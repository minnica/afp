#!/usr/bin/env python3
"""Verificación de fase 1 en instalación limpia; solo PostgreSQL local ficticio."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
url = os.environ['AFP_TEST_DATABASE_URL']
parsed = urlparse(url)
assert parsed.hostname in ('localhost', '127.0.0.1') and re.fullmatch('/afp_test[a-zA-Z0-9_]*', parsed.path) and not parsed.query and not parsed.fragment
base = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LANG', 'XDG_RUNTIME_DIR')}
base.update(DATABASE_URL=url, DIRECT_URL=url, AFP_TEST_DATABASE_URL=url,
            AFP_MIGRATION_TEST_DATABASE_URL=url, NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9',
            NEXT_PUBLIC_SUPABASE_ANON_KEY='phase1-fictitious', NEXT_TELEMETRY_DISABLED='1', CI='1')
tracked = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT, text=True).splitlines()
meta = {'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'checks': [],
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'pnpm': subprocess.check_output(['pnpm', '--version'], text=True).strip(),
        'schemaSha256': hashlib.sha256((ROOT/'prisma/schema.prisma').read_bytes()).hexdigest(),
        'migrationSha256': {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in tracked if name.startswith('prisma/migrations/') and name.endswith('.sql')},
        'lockfileSha256': hashlib.sha256((ROOT/'pnpm-lock.yaml').read_bytes()).hexdigest()}

def save():
    (OUT/'execution.json').write_text(json.dumps(meta, indent=2)+'\n')

def run(label, command, cwd, expected=0):
    start = time.monotonic()
    with (OUT/(label+'.log')).open('w') as log:
        result = subprocess.run(command, cwd=cwd, env=base, stdout=log, stderr=subprocess.STDOUT)
    item = dict(name=label, command=command, exitCode=result.returncode, expectedExitCode=expected, seconds=round(time.monotonic()-start, 3))
    meta['checks'].append(item)
    save()
    print(json.dumps(item), flush=True)
    if result.returncode != expected:
        raise RuntimeError(f'Falló {label}; revisar su log')

def smoke(name, port, cwd, routes):
    start = time.monotonic()
    with (OUT/(name+'-fixture.log')).open('w+') as log:
        process = subprocess.Popen(['node', f'tests/helpers/{name}-browser-server.cjs'], cwd=cwd,
                                   env={**base, 'AFP_CAPTURE_TEST_PRODUCTION': '1'}, stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic()+180
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f'Fixture {name} terminó antes de arrancar')
                log.flush()
                contents = (OUT/(name+'-fixture.log')).read_text()
                marker = {'money': 'Money QA ready', 'capture': 'Capture API ready', 'offline': 'Fixture A02:'}[name]
                if marker in contents:
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError(f'Tiempo agotado: {name}')
            for route, expected in routes:
                with urlopen(f'http://127.0.0.1:{port}{route}') as response:
                    body = response.read().decode()
                    assert response.status == 200 and expected in body, (route, body[:120])
            if name == 'money':
                with urlopen(f'http://127.0.0.1:{port}/qa-login') as response:
                    token = json.load(response)['access_token']
                request = Request(f'http://127.0.0.1:{port}/api/money', headers={'Authorization': f'Bearer {token}'})
                with urlopen(request) as response:
                    assert response.status == 200 and isinstance(json.load(response), dict)
            meta['checks'].append(dict(name=name+'-fixture', exitCode=0, expectedExitCode=0, seconds=round(time.monotonic()-start, 3), routes=[route for route, _ in routes]))
            save()
            print(f'{name} fixture OK', flush=True)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

with tempfile.TemporaryDirectory(prefix='afp-ts1-clean-') as tmp:
    target = Path(tmp)
    for name in tracked:
        source = ROOT/name
        if not source.is_file() or name.startswith('artifacts/typescript-migration/phase-1/'):
            continue
        destination = target/name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    assert not list(target.glob('.env*')) and not (target/'node_modules').exists()
    run('install', ['pnpm', 'install', '--frozen-lockfile'], target)
    run('typecheck', ['pnpm', 'typecheck'], target)
    run('type-contracts', ['pnpm', 'test:types'], target)
    run('lint', ['pnpm', 'lint'], target)
    run('migrate', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], target)
    run('database-verification', ['pnpm', 'db:verify'], target)
    run('transfer-reference', ['node', 'artifacts/typescript-migration/phase-0/transfers.cjs'], target)
    run('build', ['pnpm', 'build'], target)
    smoke('money', 4216, target, [('/mi-dinero', '<html')])
    smoke('capture', 4208, target, [('/registro-automatico', '<html')])
    smoke('offline', 4192, target, [('/', 'Cola offline'), ('/queue.js', 'export'), ('/state', 'receipts')])
    # Demuestra que el checker y el build rechazan errores, sin cambiar el repositorio.
    probe = target/'src/typecheck-probe.ts'
    probe.write_text('export const invalid: string = 123;\n')
    run('typecheck-negative', ['pnpm', 'typecheck'], target, expected=2)
    run('build-negative', ['pnpm', 'build'], target, expected=1)
    probe.unlink()
meta['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
save()
