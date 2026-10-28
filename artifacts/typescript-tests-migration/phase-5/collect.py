"""Cierre reproducible de fase 5: copia sin secretos y PostgreSQL desechable."""
import collections
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
IMAGE = 'docker.io/library/postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('phase0', ROOT / 'artifacts/typescript-tests-migration/phase-0/collect.py')
phase0 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(phase0)


def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Uso: python3 artifacts/typescript-tests-migration/phase-5/collect.py DIRECTORIO_NUEVO')
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=False)
    base = {key: value for key, value in os.environ.items() if key in ('PATH', 'HOME', 'USER', 'LANG', 'XDG_RUNTIME_DIR')}
    base.update(CI='1', TZ='America/Mexico_City', NEXT_TELEMETRY_DISABLED='1',
                NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY='phase5-fictitious',
                AFP_APP_ORIGIN='http://localhost:3000')

    def read(command, cwd=ROOT):
        return subprocess.check_output(command, cwd=cwd, env=base, text=True).strip()

    manifest = {'baseCommit': read(['git', 'rev-parse', 'HEAD']), 'startedAt': phase0.stamp(), 'commands': []}
    work = Path(tempfile.mkdtemp(prefix='afp-tests-ts5-'))
    container = 'afp-tests-ts5-' + str(os.getpid())
    started = False

    def run(name, command, cwd=work):
        start = time.monotonic()
        with (output / (name + '.log')).open('w') as log:
            result = subprocess.run(command, cwd=cwd, env=base, stdout=log, stderr=subprocess.STDOUT)
        item = {'name': name, 'command': command, 'seconds': round(time.monotonic() - start, 3), 'exitCode': result.returncode}
        manifest['commands'].append(item)
        save(output / 'execution.json', manifest)
        print(f'{name}: {result.returncode} ({item["seconds"]} s)', flush=True)
        if result.returncode:
            raise RuntimeError('Control fallido: ' + name)

    try:
        paths = read(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0')
        for relative in paths:
            path = ROOT / relative
            if not path.is_file() or any(part.startswith('.env') for part in path.parts) or path.is_relative_to(output):
                continue
            target = work / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        assert not list(work.glob('.env*')) and not (work / '.next').exists()
        manifest['workspace'] = {'copyWithoutEnv': True, 'dependencies': 'pnpm install --frozen-lockfile in the isolated copy', 'nextInitiallyAbsent': True}
        manifest['versions'] = {'node': read(['node', '--version']), 'pnpm': read(['pnpm', '--version']),
                                'typescript': read(['pnpm', 'exec', 'tsc', '--version']),
                                'tsx': read(['node', '-p', 'require("tsx/package.json").version']),
                                'prisma': read(['node', '-p', 'require("@prisma/client/package.json").version'])}
        read(['podman', 'run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=afp_test_only',
              '-e', 'POSTGRES_DB=afp_test_phase5', '-p', '127.0.0.1::5432', IMAGE])
        started = True
        for _ in range(100):
            if subprocess.run(['podman', 'exec', container, 'pg_isready', '-U', 'postgres', '-d', 'afp_test_phase5'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError('PostgreSQL no inició')
        address = read(['podman', 'port', container, '5432/tcp'])
        assert address.startswith('127.0.0.1:')
        connection = 'postgresql://postgres:afp_test_only@' + address + '/afp_test_phase5'
        base.update(DATABASE_URL=connection, DIRECT_URL=connection, AFP_TEST_DATABASE_URL=connection, AFP_MIGRATION_TEST_DATABASE_URL=connection)
        manifest['postgres'] = {'address': address, 'image': IMAGE, 'imageId': read(['podman', 'image', 'inspect', IMAGE, '--format', '{{.Id}}']),
                                'version': read(['podman', 'exec', container, 'postgres', '--version'])}
        run('install', ['pnpm', 'install', '--frozen-lockfile'])
        run('migrate', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'])
        for name, command in [('typecheck', ['pnpm', 'typecheck']), ('typecheck-tests', ['pnpm', 'typecheck:tests']),
                              ('test-types', ['pnpm', 'test:types']), ('lint', ['pnpm', 'lint']), ('test', ['pnpm', 'test']),
                              ('build', ['pnpm', 'build']), ('db-verify', ['pnpm', 'db:verify'])]:
            run(name, command)
        files = json.loads(read(['node', '--import', 'tsx', 'tests/run-tests.ts', '--list'], work))
        save(output / 'discovery.json', {'files': files, 'typescript': sum(f.endswith('.ts') for f in files), 'cjs': sum(f.endswith('.cjs') for f in files)})
        run('test-scenarios', ['node', '--import', 'tsx', '--test', '--experimental-test-isolation=none',
                              '--test-reporter=tap', '--test-reporter-destination=stdout',
                              '--test-reporter=./artifacts/typescript-tests-migration/phase-0/scenario-reporter.cjs',
                              '--test-reporter-destination=' + str(output / 'scenario-events.ndjson'), *files])
        observed = phase0.scenario_manifest(output / 'scenario-events.ndjson')
        identity = lambda row: (tuple(row['identity']), row['occurrence'])
        summaries = {name: phase0.tap_report(output / (name + '.log')) for name in ('test', 'test-scenarios', 'db-verify')}
        ordered = [(s['nesting'], s['name'], s['ancestors']) for s in observed]
        for name, report in summaries.items():
            assert report['counts']['pass'] == len(observed) and all(report['counts'][key] == 0 for key in ('fail', 'skipped', 'cancelled', 'todo'))
            assert [(s['nesting'], s['name'], s['ancestors']) for s in report['scenarios']] == ordered, name
        comparisons = {}
        for phase in (0, 2, 3, 4):
            reference = json.loads((ROOT / f'artifacts/typescript-tests-migration/phase-{phase}/reference/scenarios.json').read_text())['scenarios']
            reference_ids = [identity(s) for s in reference]
            wanted = set(reference_ids)
            preserved = [identity(s) for s in observed if identity(s) in wanted]
            assert preserved == reference_ids, f'Escenarios distintos de fase {phase}'
            comparisons[str(phase)] = {'reference': len(reference), 'preservedInOrder': len(preserved)}
        previous = {identity(s) for s in json.loads((ROOT / 'artifacts/typescript-tests-migration/phase-4/reference/scenarios.json').read_text())['scenarios']}
        save(output / 'scenarios.json', {'summary': {name: report['counts'] for name, report in summaries.items()},
                                        'comparisons': comparisons, 'added': [s for s in observed if identity(s) not in previous], 'scenarios': observed})
        old_hashes = json.loads((ROOT / 'artifacts/typescript-tests-migration/phase-0/reference/hashes.json').read_text())
        checks = {}
        for group in ('protectedFiles', 'historicalArtifacts'):
            changed = [file for file, old in old_hashes[group].items() if not (ROOT / file).is_file() or digest(ROOT / file) != old]
            assert not changed, changed
            checks[group] = {'checked': len(old_hashes[group]), 'changed': changed}
        prior = read(['git', 'ls-files', 'artifacts/typescript-tests-migration/']).splitlines()
        prior = [file for file in prior if not file.startswith('artifacts/typescript-tests-migration/phase-5/')]
        changed = [file for file in prior if digest(ROOT / file) != hashlib.sha256(subprocess.check_output(['git', 'show', 'HEAD:' + file], cwd=ROOT)).hexdigest()]
        assert not changed, changed
        checks['priorTestMigrationArtifacts'] = {'checked': len(prior), 'changed': changed}
        save(output / 'hash-comparison.json', checks)
        listing = read(['pnpm', 'exec', 'tsc', '--project', 'tsconfig.tests.json', '--listFilesOnly'], work).splitlines()
        included = {str(Path(file).relative_to(work)) for file in listing if file.startswith(str(work) + '/')}
        tsfiles = sorted(str(path.relative_to(work)) for path in (work / 'tests').rglob('*.ts') if 'types' not in path.relative_to(work / 'tests').parts)
        declarations = sorted(str(path.relative_to(work)) for path in (work / 'scripts').glob('*.d.cts'))
        assert all(file in included for file in tsfiles + declarations)
        config = json.loads(read(['pnpm', 'exec', 'eslint', '--print-config', 'tests/capture-api-integration.test.ts'], work))
        save(output / 'type-inclusion.json', {'included': tsfiles, 'scriptDeclarations': declarations,
                                            'remainingCjsHelpers': sorted(str(p.relative_to(work)) for p in (work / 'tests/helpers').glob('*.cjs')),
                                            'negativeContractFiles': sorted(str(p.relative_to(work)) for p in (work / 'tests/types').glob('*.ts*')),
                                            'eslintRules': {key: value for key, value in config['rules'].items() if 'unsafe' in key or key in ('@typescript-eslint/no-explicit-any', '@typescript-eslint/ban-ts-comment', 'no-restricted-syntax')}})
        read(['podman', 'exec', container, 'createdb', '-U', 'postgres', 'afp_test_phase5_receivers'])
        receiver_connection = connection.rsplit('/', 1)[0] + '/afp_test_phase5_receivers'
        context_file = work / 'receiver-context.json'
        base.update(DIRECT_URL=receiver_connection, AFP_TEST_DATABASE_URL=receiver_connection, AFP_RECEIVER_TEST_CONTEXT=str(context_file))
        run('receiver-migrate', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'])
        run('receiver-seed', ['node', '--import', 'tsx', 'tests/helpers/seed-receiver-payments.ts'])
        context = json.loads(context_file.read_text())
        assert context['authorization'].startswith('Capture ' + context['deviceId'] + '.')
        assert context['userId'] == '00000000-0000-4000-8000-000000000091'
        assert context_file.stat().st_mode & 0o777 == 0o600
        counts = read(['podman', 'exec', container, 'psql', '-U', 'postgres', '-d', 'afp_test_phase5_receivers', '-Atc',
                       'SELECT (SELECT count(*) FROM "cards"), (SELECT count(*) FROM "card_cycles"), (SELECT count(*) FROM "capture_payment_policies"), (SELECT count(*) FROM "capture_card_aliases"), (SELECT count(*) FROM "capture_devices")'])
        assert counts == '2|2|2|1|1', counts
        save(output / 'receiver-seed.json', {'cards': 2, 'cycles': 2, 'observationPolicies': 2, 'aliases': 1, 'devices': 1, 'credentialMode': '0600', 'credentialShapeVerified': True})
        context_file.unlink()
        base.update(DIRECT_URL=connection, AFP_TEST_DATABASE_URL=connection)
        base.pop('AFP_RECEIVER_TEST_CONTEXT')
        run('browser', ['python3', 'artifacts/typescript-tests-migration/phase-5/browser.py', str(output / 'browser')])
        run('dev-shutdown', ['python3', 'artifacts/typescript-tests-migration/phase-5/dev-shutdown.py', str(output / 'dev-shutdown')])
        manifest['completed'] = True
    except BaseException as error:
        manifest['failure'] = f'{type(error).__name__}: {error}'
        raise
    finally:
        if started:
            subprocess.run(['podman', 'stop', container], stdout=subprocess.DEVNULL, check=True)
        shutil.rmtree(work)
        manifest.update(finishedAt=phase0.stamp(), cleanedUp=True)
        save(output / 'execution.json', manifest)


if __name__ == '__main__':
    main()
