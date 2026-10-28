"""Validate phase 7 in a clean copy, with an explicitly selected disposable DB."""
import datetime
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
ARTIFACTS = Path(__file__).resolve().parent
database = os.environ.get('AFP_TEST_DATABASE_URL', '')
url = urlparse(database)
if url.hostname not in ('localhost', '127.0.0.1') or not re.fullmatch(r'/afp_test[a-zA-Z0-9_]*', url.path) or url.query or url.fragment:
    raise SystemExit('Use AFP_TEST_DATABASE_URL local y desechable afp_test… sin parámetros.')
environment = {**os.environ, 'CI': '1', 'DATABASE_URL': database, 'DIRECT_URL': database,
               'AFP_MIGRATION_TEST_DATABASE_URL': database,
               'NEXT_PUBLIC_SUPABASE_URL': 'https://example.supabase.co',
               'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'phase7-fictitious-key'}
manifest_path = ARTIFACTS / 'execution.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
    'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'attempts': []}
record = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commands': []}
manifest['attempts'].append(record)
attempt = len(manifest['attempts'])

def run(command, cwd):
    log_name = f'{attempt}-{len(record["commands"]) + 1}-{Path(command[0]).name}-{command[1].replace(":", "-").replace("/", "-")}.log'
    started = time.monotonic()
    with (ARTIFACTS / log_name).open('w') as log:
        result = subprocess.run(command, cwd=cwd, env=environment, stdout=log, stderr=subprocess.STDOUT)
    outcome = {'command': ' '.join(command), 'exitCode': result.returncode,
               'seconds': round(time.monotonic() - started, 3), 'log': log_name}
    record['commands'].append(outcome)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(outcome), flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)

with tempfile.TemporaryDirectory(prefix='afp-ts-phase7-clean-') as directory:
    clean = Path(directory)
    tracked = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    copied = []
    for name in sorted(set(tracked)):
        if not name or name.startswith('artifacts/typescript-migration/phase-7/') or any(part.startswith('.env') for part in Path(name).parts):
            continue
        source = ROOT / name
        if source.is_file():
            target = clean / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied.append(name)
    source_names = [name for name in copied if name.startswith('src/')]
    record['cleanCopy'] = {'envFiles': [], 'initialNodeModules': (clean / 'node_modules').exists(),
                           'initialNext': (clean / '.next').exists(), 'sourceFiles': len(source_names),
                           'sourceSha256': hashlib.sha256(''.join(name + ':' + hashlib.sha256((clean / name).read_bytes()).hexdigest() + '\n' for name in source_names).encode()).hexdigest()}
    run(['pnpm', 'install', '--frozen-lockfile'], clean)
    run(['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], clean)
    for name in ('typecheck', 'test:types', 'lint', 'test', 'build', 'db:verify'):
        run(['pnpm', name], clean)
    run(['node', 'artifacts/typescript-migration/phase-0/transfers.cjs'], clean)
    # Outputs generated inside the disposable checkout remain inspectable.
    for name in ('transfers.actual.json', 'transfers.comparison.json'):
        source = clean / 'artifacts/typescript-migration/phase-0' / name
        if source.exists():
            shutil.copy2(source, ARTIFACTS / name)
    invariants = json.loads((ARTIFACTS / 'invariants.json').read_text())
    unchanged = all(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest
                    for name, digest in invariants['sha256'].items())
    if not unchanged:
        raise SystemExit('Cambió un archivo protegido; revisar invariants.json.')
    record['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record['protectedFilesUnchanged'] = len(invariants['sha256'])
    record['cleanCopyRemoved'] = True
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
