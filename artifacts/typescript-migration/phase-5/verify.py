"""Run each sequential batch against an explicitly selected disposable database."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = Path(__file__).resolve().parent
database = os.environ.get('AFP_TEST_DATABASE_URL', '')
url = urlparse(database)
if url.hostname not in ('localhost', '127.0.0.1') or not url.path.startswith('/afp_test') or url.query:
    raise SystemExit('Use AFP_TEST_DATABASE_URL local y desechable afp_test… sin parámetros.')
batch = sys.argv[1]
environment = {**os.environ, 'DATABASE_URL': database, 'DIRECT_URL': database,
               'NEXT_PUBLIC_SUPABASE_URL': 'https://example.supabase.co',
               'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'phase5-fictitious-key'}
record = {'name': batch, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commands': []}
manifest_path = ARTIFACTS / 'execution.json'
manifest = json.loads(manifest_path.read_text())
attempt = 1 + sum(item['name'] == batch for item in manifest['batches'])
record['attempt'] = attempt
manifest['batches'].append(record)
for command in [['pnpm', name] for name in ('typecheck', 'test:types', 'lint', 'test', 'build')]:
    log_name = f'{batch}-{attempt}-{command[1].replace(":", "-")}.log'
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
