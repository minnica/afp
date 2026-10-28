"""Verify the UI batch with an explicitly selected disposable PostgreSQL DB."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = Path(__file__).resolve().parent
database = os.environ.get('AFP_TEST_DATABASE_URL', '')
url = urlparse(database)
if url.hostname not in ('localhost', '127.0.0.1') or not url.path.startswith('/afp_test') or url.query or url.fragment:
    raise SystemExit('Use AFP_TEST_DATABASE_URL local y desechable afp_test… sin parámetros.')
environment = {**os.environ, 'DATABASE_URL': database, 'DIRECT_URL': database,
               'NEXT_PUBLIC_SUPABASE_URL': 'https://example.supabase.co',
               'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'phase6-fictitious-key'}
manifest_path = ARTIFACTS / 'execution.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
    'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'attempts': []}
record = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commands': []}
manifest['attempts'].append(record)
attempt = len(manifest['attempts'])
for command in [['pnpm', name] for name in ('typecheck', 'test:types', 'lint', 'test', 'build')]:
    log_name = f'{attempt}-{command[1].replace(":", "-")}.log'
    started = time.monotonic()
    with (ARTIFACTS / log_name).open('w') as log:
        result = subprocess.run(command, cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT)
    outcome = {'command': ' '.join(command), 'exitCode': result.returncode,
               'seconds': round(time.monotonic() - started, 3), 'log': log_name}
    record['commands'].append(outcome)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(outcome), flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
