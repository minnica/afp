"""Referencia de pruebas: copia sin .env, PostgreSQL desechable y salida nueva."""
import collections
import datetime
import hashlib
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
RELATIVE = HERE.relative_to(ROOT)
IMAGE = 'docker.io/library/postgres@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571'


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def save(file, value):
    file.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def tap_report(file):
    """Conserva nombres repetidos y jerarquía; no confunde padres con hojas."""
    scenarios, stack, counts = [], [], {}
    for line in file.read_text().splitlines():
        match = re.fullmatch(r'( *)# Subtest: (.*)', line)
        if match:
            depth = len(match[1]) // 4
            if len(match[1]) % 4 or depth > len(stack):
                raise ValueError(f'Jerarquía TAP inesperada: {line}')
            stack = stack[:depth] + [match[2]]
            scenarios.append({'nesting': depth, 'name': match[2], 'ancestors': stack[:-1]})
        match = re.fullmatch(r'# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)', line)
        if match:
            counts[match[1]] = float(match[2]) if match[1] == 'duration_ms' else int(match[2])
    required = {'tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo', 'duration_ms'}
    if counts.keys() != required or counts['tests'] != len(scenarios) or not scenarios:
        raise ValueError(f'Resumen TAP incompleto o cantidad distinta: {file.name}')
    return {'counts': counts, 'scenarios': scenarios}


def scenario_manifest(file):
    scenarios, stack = [], []
    occurrences = collections.Counter()
    for line in file.read_text().splitlines():
        event = json.loads(line)
        depth = event['nesting']
        if event['event'] == 'test:start':
            if depth > len(stack) or not event['file']:
                raise ValueError(f'Evento sin contexto: {event}')
            stack = stack[:depth]
            names = [item['name'] for item in stack] + [event['name']]
            # La extensión no forma parte de la identidad para permitir CJS → TS.
            identity = [re.sub(r'\.(cjs|ts)$', '', event['file']), *names]
            key = json.dumps(identity, ensure_ascii=False)
            occurrences[key] += 1
            item = {key: event[key] for key in ('file', 'line', 'column', 'name', 'nesting')}
            item.update(ancestors=names[:-1], identity=identity, occurrence=occurrences[key])
            scenarios.append(item)
            stack.append(item)
        else:
            item = stack[depth]
            if any(item[key] != event[key] for key in ('name', 'file', 'line')):
                raise ValueError(f'Resultado sin inicio correspondiente: {event}')
            item.update(status=event['event'].removeprefix('test:'), skip=event['skip'], todo=event['todo'],
                        durationMs=event['durationMs'], testNumber=event['testNumber'])
            stack = stack[:depth]
    if not scenarios or any('status' not in item for item in scenarios):
        raise ValueError('Manifiesto incompleto; faltan resultados de escenarios.')
    return scenarios


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Uso: python3 artifacts/typescript-tests-migration/phase-0/collect.py DIRECTORIO_NUEVO')
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=False)  # No reemplazar referencias anteriores.
    base = {key: value for key, value in os.environ.items() if key in ('PATH', 'HOME', 'USER', 'LANG', 'XDG_RUNTIME_DIR')}
    base.update(CI='1', TZ='America/Mexico_City', NEXT_TELEMETRY_DISABLED='1',
                NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY='phase0-fictitious',
                AFP_APP_ORIGIN='http://localhost:3000')

    def read(command, cwd=ROOT):
        return subprocess.check_output(command, cwd=cwd, env=base, text=True).strip()

    manifest = {'baseCommit': read(['git', 'rev-parse', 'HEAD']), 'startedAt': stamp(),
                'workingTreeAtStart': read(['git', 'status', '--short']),
                'versions': {'node': read(['node', '--version']), 'pnpm': read(['pnpm', '--version']),
                             'python': sys.version.split()[0], 'podman': read(['podman', '--version'])},
                'environment': {'timezone': base['TZ'], 'inheritedKeys': sorted(set(base) & set(os.environ)),
                                'envFilesCopied': [], 'nodeOptions': None, 'database': 'new local Podman container'},
                'checks': [], 'complete': False}
    container = 'afp-tests-ts0-' + uuid.uuid4().hex[:10]
    created = False
    hashes = None
    temporary_copy = None

    def checkpoint():
        save(output / 'execution.json', manifest)

    def run(label, command, cwd=ROOT):
        started = time.monotonic()
        entry = {'name': label, 'command': command, 'startedAt': stamp(), 'log': label + '.log'}
        with (output / entry['log']).open('w') as log:
            try:
                process = subprocess.run(command, cwd=cwd, env=base, stdout=log, stderr=subprocess.STDOUT)
                entry['exitCode'] = process.returncode
                entry['signal'] = -process.returncode if process.returncode < 0 else None
            except OSError as error:
                entry.update(exitCode=None, startupError=str(error))
        entry['seconds'] = round(time.monotonic() - started, 3)
        manifest['checks'].append(entry)
        checkpoint()
        print(json.dumps({key: entry[key] for key in ('name', 'exitCode', 'seconds', 'log')}), flush=True)
        return entry['exitCode'] == 0

    try:
        if not run('inventory', ['node', str(HERE / 'inventory.cjs'), str(output)]):
            raise RuntimeError('No se pudo inventariar la referencia.')
        hashes = json.loads((output / 'hashes.json').read_text())
        inventory = json.loads((output / 'inventory.json').read_text())
        manifest['versions']['packages'] = {
            name: json.loads((ROOT / 'node_modules' / name / 'package.json').read_text())['version']
            for name in ('next', 'react', 'prisma', '@prisma/client', '@prisma/adapter-pg',
                         'typescript', 'esbuild', 'eslint', 'fake-indexeddb')}
        manifest['postgres'] = {'image': IMAGE, 'container': container, 'database': 'afp_test_tests_ts0'}
        if not run('postgres-start', ['podman', 'run', '--pull=never', '--rm', '-d', '--name', container,
                                     '-e', 'POSTGRES_PASSWORD=afp_test_only', '-e', 'POSTGRES_DB=afp_test_tests_ts0',
                                     '-p', '127.0.0.1::5432', IMAGE]):
            raise RuntimeError('No se pudo crear PostgreSQL desechable; verificar Podman y la imagen fijada.')
        created = True
        for _ in range(60):
            ready = subprocess.run(['podman', 'exec', container, 'pg_isready', '-U', 'postgres', '-d', 'afp_test_tests_ts0'],
                                   env=base, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('PostgreSQL no estuvo listo después de 30 segundos.')
        address = read(['podman', 'port', container, '5432'])
        if not re.fullmatch(r'127\.0\.0\.1:\d+', address):
            raise RuntimeError('El puerto del contenedor debe estar limitado a 127.0.0.1.')
        database = f'postgresql://postgres:afp_test_only@{address}/afp_test_tests_ts0'
        base.update(DATABASE_URL=database, DIRECT_URL=database, AFP_TEST_DATABASE_URL=database,
                    AFP_MIGRATION_TEST_DATABASE_URL=database)
        manifest['postgres'].update(address=address, version=read(['podman', 'exec', container, 'postgres', '--version']),
                                    imageId=read(['podman', 'image', 'inspect', IMAGE, '--format', '{{.Id}}']))
        with tempfile.TemporaryDirectory(prefix='afp-tests-ts0-') as directory:
            clean = Path(directory)
            temporary_copy = clean
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
                                'dependencyPolicy': 'Copia física de node_modules instalado; no es una instalación limpia.',
                                'inputSha256': {name: digest(clean / name) for name in copied if not name.startswith('artifacts/') or name.startswith(str(RELATIVE) + '/')}}
            # Turbopack necesita dependencias dentro de la raíz, sin symlinks externos.
            if not run('copy-dependencies', ['cp', '-a', '--reflink=auto', str(ROOT / 'node_modules'), str(clean / 'node_modules')]):
                raise RuntimeError('No se pudo copiar node_modules.')
            if not run('migrate', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], clean):
                raise RuntimeError('Falló la migración de la base nueva; no se certifican integraciones.')
            for label, command in [('typecheck', 'typecheck'), ('test-types', 'test:types'), ('lint', 'lint'), ('test', 'test')]:
                run(label, ['pnpm', command], clean)
            # El script pnpm coloca sus archivos antes de argumentos extra. Node 22
            # ignora ahí los flags de reportero. Observar otra ejecución equivalente
            # permite mantener pnpm test intacto y no usar NODE_OPTIONS global.
            test_files = sorted(item['file'] for item in inventory['files'] if item['role'] == 'runtime-test')
            run('test-scenarios', ['node', '--test', '--experimental-test-isolation=none', '--test-reporter=tap',
                                   '--test-reporter-destination=stdout',
                                   f'--test-reporter=./{RELATIVE}/scenario-reporter.cjs',
                                   f'--test-reporter-destination={output}/scenario-events.ndjson', *test_files], clean)
            run('build', ['pnpm', 'build'], clean)
            run('db-verify', ['pnpm', 'db:verify'], clean)
            reports = {name: tap_report(output / (name + '.log')) for name in ('test', 'test-scenarios', 'db-verify')}
            scenarios = scenario_manifest(output / 'scenario-events.ndjson')
            identities = [{key: item[key] for key in ('nesting', 'name', 'ancestors')} for item in scenarios]
            correspondence = {name: report['scenarios'] == identities for name, report in reports.items()}
            counts_ok = all(report['counts']['tests'] == report['counts']['pass'] == len(scenarios)
                            and all(report['counts'][key] == 0 for key in ('fail', 'cancelled', 'skipped', 'todo'))
                            for report in reports.values())
            actual_files = sorted(set(item['file'] for item in scenarios))
            # Cada escenario observado debe remontarse a una declaración del AST.
            # node:test sitúa t.test en el identificador «test», dos columnas
            # después del comienzo del acceso «t.test» que devuelve el AST.
            declaration_positions = {(item['file'], declaration['line'], declaration['runtimeColumn'])
                                     for item in inventory['files'] for declaration in item['declarations']}
            unmapped = [item for item in scenarios if (item['file'], item['line'], item['column']) not in declaration_positions]
            counts = collections.Counter(item['file'] for item in scenarios)
            summary = {'counts': {name: report['counts'] for name, report in reports.items()},
                       'sameOrderedScenarios': correspondence, 'expectedFiles': len(test_files), 'observedFiles': len(actual_files),
                       'missingFiles': sorted(set(test_files) - set(actual_files)), 'extraFiles': sorted(set(actual_files) - set(test_files)),
                       'unmappedDeclarations': unmapped, 'perFile': dict(sorted(counts.items())),
                       'topLevel': sum(item['nesting'] == 0 for item in scenarios),
                       'subtests': sum(item['nesting'] > 0 for item in scenarios),
                       'successWithoutOmissions': counts_ok}
            save(output / 'scenarios.json', {'summary': summary, 'scenarios': scenarios})
            manifest['scenarioComparison'] = summary
            if not counts_ok or not all(correspondence.values()) or actual_files != test_files or unmapped:
                raise RuntimeError('Faltan escenarios, hay omisiones/fallos o no coincide la suite de los tres comandos.')
            manifest['complete'] = all(item['exitCode'] == 0 for item in manifest['checks'])
        manifest['temporaryCopyRemoved'] = True
    except Exception as error:
        manifest['error'] = f'{type(error).__name__}: {error}'
        manifest['complete'] = False
    finally:
        if temporary_copy is not None:
            manifest['temporaryCopyRemoved'] = not temporary_copy.exists()
        if created:
            manifest['containerRemoved'] = run('postgres-stop', ['podman', 'stop', container])
            if not manifest['containerRemoved']:
                manifest['complete'] = False
        if hashes:
            changes = [name for group in ('protectedFiles', 'historicalArtifacts', 'mutableConfiguration')
                       for name, expected in hashes[group].items() if not (ROOT / name).exists() or digest(ROOT / name) != expected]
            manifest['hashComparison'] = {'changed': changes,
                                          'counts': {group: len(hashes[group]) for group in ('protectedFiles', 'historicalArtifacts', 'mutableConfiguration')}}
            if changes:
                manifest['complete'] = False
        manifest['finishedAt'] = stamp()
        checkpoint()
    print(json.dumps({'complete': manifest['complete'], 'error': manifest.get('error'), 'output': str(output)}), flush=True)
    return 0 if manifest['complete'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
