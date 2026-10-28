#!/usr/bin/env python3
"""Verificación de fase 2 en instalación limpia; solo PostgreSQL local ficticio."""
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

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
url = os.environ['AFP_TEST_DATABASE_URL']
parsed = urlparse(url)
assert parsed.hostname in ('localhost', '127.0.0.1') and re.fullmatch('/afp_test[a-zA-Z0-9_]*', parsed.path) and not parsed.query and not parsed.fragment
base = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LANG', 'XDG_RUNTIME_DIR')}
base.update(DATABASE_URL=url, DIRECT_URL=url, AFP_TEST_DATABASE_URL=url,
            AFP_MIGRATION_TEST_DATABASE_URL=url, NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9',
            NEXT_PUBLIC_SUPABASE_ANON_KEY='phase2-fictitious', NEXT_TELEMETRY_DISABLED='1', CI='1')
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

with tempfile.TemporaryDirectory(prefix='afp-ts2-clean-') as tmp:
    target = Path(tmp)
    for name in tracked:
        source = ROOT/name
        if not source.is_file() or name.startswith('artifacts/typescript-migration/phase-2/'):
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
    run('tests', ['pnpm', 'test'], target)
    run('transfer-reference', ['node', 'artifacts/typescript-migration/phase-0/transfers.cjs'], target)
    run('build', ['pnpm', 'build'], target)
meta['sourceLines'] = {name: len((ROOT/name).read_text().splitlines()) for name in tracked if name in ('src/lib/money/transferContracts.ts', 'src/lib/money/transfers.ts', 'src/lib/money/transferClient.ts', 'src/components/mi-dinero/transferEditor.ts', 'src/components/mi-dinero/MoneyTransferEditor.tsx')}
meta['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
save()
