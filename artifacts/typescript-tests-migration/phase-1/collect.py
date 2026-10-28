"""Fase 1: instalación limpia, suite mixta y comparación con la referencia."""
import collections
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PHASE0 = HERE.parent / 'phase-0'
IMAGE = 'docker.io/library/postgres@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571'
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('phase0', PHASE0 / 'collect.py')
baseline_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline_tools)


def save(file, value):
    file.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Uso: python3 artifacts/typescript-tests-migration/phase-1/collect.py DIRECTORIO_NUEVO')
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=False)
    env = {key: value for key, value in os.environ.items() if key in ('PATH', 'HOME', 'USER', 'LANG', 'XDG_RUNTIME_DIR')}
    env.update(CI='1', TZ='America/Mexico_City', NEXT_TELEMETRY_DISABLED='1',
               NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY='phase1-fictitious',
               AFP_APP_ORIGIN='http://localhost:3000')
    manifest = {'startedAt': baseline_tools.stamp(), 'checks': [], 'complete': False,
                'environment': {'inheritedKeys': sorted(set(env) & set(os.environ)), 'envFilesCopied': [], 'nodeOptions': None}}
    container = 'afp-tests-ts1-' + uuid.uuid4().hex[:10]
    created, clean = False, None

    def read(command, cwd=ROOT):
        return subprocess.check_output(command, cwd=cwd, env=env, text=True).strip()

    def checkpoint():
        save(output / 'execution.json', manifest)

    def run(label, command, cwd=ROOT):
        started = time.monotonic()
        entry = {'name': label, 'command': command, 'startedAt': baseline_tools.stamp(), 'log': label + '.log'}
        with (output / entry['log']).open('w') as log:
            try:
                process = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
                entry.update(exitCode=process.returncode, signal=-process.returncode if process.returncode < 0 else None)
            except OSError as error:
                entry.update(exitCode=None, startupError=str(error))
        entry['seconds'] = round(time.monotonic() - started, 3)
        manifest['checks'].append(entry)
        checkpoint()
        print(json.dumps(entry), flush=True)
        if entry['exitCode'] != 0:
            raise RuntimeError(f'Falló {label}; ver {entry["log"]}')

    try:
        manifest.update(baseCommit=read(['git', 'rev-parse', 'HEAD']), workingTreeAtStart=read(['git', 'status', '--short']),
                        versions={'node': read(['node', '--version']), 'pnpm': read(['pnpm', '--version']),
                                  'python': sys.version.split()[0], 'podman': read(['podman', '--version'])})
        run('postgres-start', ['podman', 'run', '--pull=never', '--rm', '-d', '--name', container,
                              '-e', 'POSTGRES_PASSWORD=afp_test_only', '-e', 'POSTGRES_DB=afp_test_tests_ts1',
                              '-p', '127.0.0.1::5432', IMAGE])
        created = True
        for _ in range(60):
            ready = subprocess.run(['podman', 'exec', container, 'pg_isready', '-U', 'postgres', '-d', 'afp_test_tests_ts1'],
                                   env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('PostgreSQL no estuvo listo en 30 segundos.')
        address = read(['podman', 'port', container, '5432'])
        if not re.fullmatch(r'127\.0\.0\.1:\d+', address):
            raise RuntimeError('El puerto debe limitarse a 127.0.0.1.')
        url = f'postgresql://postgres:afp_test_only@{address}/afp_test_tests_ts1'
        env.update(DATABASE_URL=url, DIRECT_URL=url, AFP_TEST_DATABASE_URL=url, AFP_MIGRATION_TEST_DATABASE_URL=url)
        manifest['postgres'] = {'container': container, 'address': address, 'image': IMAGE,
                                'imageId': read(['podman', 'image', 'inspect', IMAGE, '--format', '{{.Id}}']),
                                'version': read(['podman', 'exec', container, 'postgres', '--version'])}
        with tempfile.TemporaryDirectory(prefix='afp-tests-ts1-') as directory:
            clean = Path(directory)
            names = read(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0')
            copied = []
            for name in sorted(set(names)):
                source = ROOT / name
                if not name or not source.is_file() or source.is_relative_to(output) or any(part.startswith('.env') for part in Path(name).parts):
                    continue
                target = clean / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                copied.append(name)
            manifest['copy'] = {'initialNext': (clean / '.next').exists(), 'initialNodeModules': (clean / 'node_modules').exists(),
                                'initialTypeScriptCache': bool(list(clean.glob('*.tsbuildinfo'))), 'files': len(copied),
                                'dependencyPolicy': 'pnpm install --frozen-lockfile; almacén pnpm compartido, node_modules nuevo.',
                                'inputSha256': {name: digest(clean / name) for name in copied if not name.startswith('artifacts/') or name.startswith(str(HERE.relative_to(ROOT)) + '/')}}
            if any(manifest['copy'][key] for key in ('initialNext', 'initialNodeModules', 'initialTypeScriptCache')):
                raise RuntimeError('La copia no está limpia.')
            run('install', ['pnpm', 'install', '--frozen-lockfile'], clean)
            manifest['versions']['packages'] = {name: json.loads((clean / 'node_modules' / name / 'package.json').read_text())['version']
                                                for name in ('next', 'typescript', 'esbuild', 'tsx', 'prisma', 'eslint')}
            run('migrate', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], clean)
            # Cada comprobación de tipos debe generar sus propios prerrequisitos.
            for label, script in [('typecheck-tests', 'typecheck:tests'), ('typecheck', 'typecheck'), ('test-types', 'test:types')]:
                shutil.rmtree(clean / '.next', ignore_errors=True)
                for cache in clean.glob('*.tsbuildinfo'):
                    cache.unlink()
                run(label, ['pnpm', script], clean)
            run('lint', ['pnpm', 'lint'], clean)
            run('test', ['pnpm', 'test'], clean)
            files = json.loads(read(['node', '--import', 'tsx', 'tests/run-tests.ts', '--list'], clean))
            save(output / 'discovery.json', {'files': files, 'cjs': sum(file.endswith('.cjs') for file in files),
                                             'ts': sum(file.endswith('.ts') for file in files), 'duplicates': len(files) != len(set(files))})
            reporter = PHASE0.relative_to(ROOT) / 'scenario-reporter.cjs'
            run('test-scenarios', ['node', '--import', 'tsx', '--test', '--experimental-test-isolation=none',
                                   '--test-reporter=tap', '--test-reporter-destination=stdout',
                                   f'--test-reporter=./{reporter}', f'--test-reporter-destination={output}/scenario-events.ndjson', *files], clean)
            run('build', ['pnpm', 'build'], clean)
            run('db-verify', ['pnpm', 'db:verify'], clean)

            # La configuración de fixtures ya no copia programas que referencian
            # pruebas ausentes: ejercitar copia, Next typegen y compilación TS.
            with tempfile.TemporaryDirectory(prefix='afp-tests-ts1-next-') as fixture_name:
                fixture = Path(fixture_name)
                shutil.copytree(clean / 'src', fixture / 'src')
                (fixture / 'node_modules').symlink_to(clean / 'node_modules', target_is_directory=True)
                helper = clean / 'tests/helpers/next-fixture.cjs'
                run('next-fixture', ['node', '-e', '''const fs = require('node:fs');
const assert = require('node:assert/strict');
const { copyNextConfiguration, generateNextTypes } = require(process.argv[1]);
const target = process.argv[2];
copyNextConfiguration(target);
assert.deepEqual(fs.readdirSync(target).filter(name => name.startsWith('tsconfig')), ['tsconfig.json']);
assert.equal(fs.readdirSync(target).some(name => name.startsWith('.env')), false);
assert.equal(fs.existsSync(target + '/next-env.d.ts'), false);
generateNextTypes(target);''', str(helper), str(fixture)], clean)
                run('next-fixture-types', ['pnpm', 'exec', 'tsc', '--project', str(fixture / 'tsconfig.json'), '--noEmit'], clean)

            programs = {}
            for label, config in [('runtime', 'tsconfig.tests.json'), ('contracts', 'tsconfig.type-tests.json')]:
                paths = read(['pnpm', 'exec', 'tsc', '--project', config, '--listFilesOnly'], clean).splitlines()
                programs[label] = sorted(str(Path(file).relative_to(clean)) for file in paths if Path(file).is_relative_to(clean / 'tests'))
            expected = sorted(str(file.relative_to(clean)) for file in (clean / 'tests').rglob('*.ts') if 'types' not in file.relative_to(clean / 'tests').parts)
            lint = {}
            for file in [*expected, 'tests/types/test-runner.ts']:
                config = json.loads(read(['pnpm', 'exec', 'eslint', '--print-config', file], clean))
                rules = {name: value for name, value in config['rules'].items() if name.startswith('@typescript-eslint/no-unsafe') or name in ('@typescript-eslint/no-explicit-any', '@typescript-eslint/ban-ts-comment', 'no-restricted-syntax')}
                lint[file] = {'projects': config['languageOptions']['parserOptions']['project'], 'rules': rules}
                assert all(value[0] == 2 for value in rules.values())
            assert all(file in programs['runtime'] for file in expected)
            assert not any(file.startswith('tests/types/') for file in programs['runtime'])
            assert 'tests/types/test-runner.ts' in programs['contracts']
            save(output / 'type-inclusion.json', {'programs': programs, 'runtimeTsFiles': expected,
                                                 'cjsHelpersChecked': False, 'eslint': lint})

            scenarios = baseline_tools.scenario_manifest(output / 'scenario-events.ndjson')
            previous = json.loads((PHASE0 / 'reference/scenarios.json').read_text())['scenarios']
            baseline_files = {item['identity'][0] for item in previous}
            preserved = [item for item in scenarios if item['identity'][0] in baseline_files]
            added = [item for item in scenarios if item['identity'][0] not in baseline_files]
            assert [(item['identity'], item['occurrence']) for item in previous] == [(item['identity'], item['occurrence']) for item in preserved]
            actual_files = sorted({item['file'] for item in scenarios})
            assert files == actual_files
            reports = {name: baseline_tools.tap_report(output / (name + '.log')) for name in ('test', 'test-scenarios', 'db-verify')}
            identities = [{key: item[key] for key in ('nesting', 'name', 'ancestors')} for item in scenarios]
            assert all(report['scenarios'] == identities for report in reports.values())
            assert all(report['counts']['tests'] == report['counts']['pass'] == len(scenarios)
                       and all(report['counts'][key] == 0 for key in ('fail', 'cancelled', 'skipped', 'todo')) for report in reports.values())
            summary = {'counts': {name: report['counts'] for name, report in reports.items()}, 'baselineScenariosPreservedInOrder': len(preserved),
                       'addedScenarios': len(added), 'allCommandsSameOrderedScenarios': True, 'discoveredAndObservedFiles': len(files),
                       'perFile': dict(sorted(collections.Counter(item['file'] for item in scenarios).items()))}
            save(output / 'scenarios.json', {'summary': summary, 'added': added, 'scenarios': scenarios})
            manifest['scenarioComparison'] = summary
            manifest['complete'] = True
    except Exception as error:
        manifest.update(complete=False, error=f'{type(error).__name__}: {error}')
    finally:
        manifest['temporaryCopyRemoved'] = clean is not None and not clean.exists()
        if created:
            try:
                run('postgres-stop', ['podman', 'stop', container])
                manifest['containerRemoved'] = True
            except Exception as error:
                manifest.update(complete=False, cleanupError=str(error), containerRemoved=False)
        hashes = json.loads((PHASE0 / 'reference/hashes.json').read_text())
        comparison = {group: {'count': len(hashes[group]), 'changed': [file for file, expected in hashes[group].items()
                                                                   if not (ROOT / file).is_file() or digest(ROOT / file) != expected]}
                      for group in ('protectedFiles', 'historicalArtifacts', 'mutableConfiguration')}
        save(output / 'hash-comparison.json', comparison)
        if comparison['protectedFiles']['changed'] or comparison['historicalArtifacts']['changed']:
            manifest.update(complete=False, hashError='Cambios en fuentes/fixtures protegidos o evidencia histórica.')
        manifest['finishedAt'] = baseline_tools.stamp()
        checkpoint()
    print(json.dumps({'complete': manifest['complete'], 'error': manifest.get('error'), 'output': str(output)}), flush=True)
    return 0 if manifest['complete'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
