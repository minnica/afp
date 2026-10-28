"""Comprueba señales y fallo de arranque con watchers reales de Next dev."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(sys.argv[1]).resolve()
OUTPUT.mkdir(parents=True, exist_ok=False)
RESULTS = []

for name, stop_signal, fail in [('money', signal.SIGINT, False), ('capture', signal.SIGTERM, False), ('money', None, True)]:
    port = 4216 if name == 'money' else 4208
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'El puerto {port} debe estar libre.')
    prefix = f'afp-{name}-qa-'
    temporary = Path(tempfile.gettempdir())
    before = set(temporary.glob(prefix + '*'))
    label = name + ('-startup-failure' if fail else '-signal')
    env = dict(os.environ, AFP_CAPTURE_TEST_PRODUCTION='0', AFP_UI_TEST_PORT='4216')
    env.pop('AFP_CAPTURE_TEST_KEY', None)
    env.pop('AFP_CAPTURE_TEST_CERTIFICATE', None)
    if fail:
        env.update(AFP_CAPTURE_TEST_KEY=str(OUTPUT / 'missing.key'), AFP_CAPTURE_TEST_CERTIFICATE=str(OUTPUT / 'missing.crt'))
    with (OUTPUT / (label + '.log')).open('w') as log:
        process = subprocess.Popen(['node', '--import', 'tsx', f'tests/helpers/{name}-browser-server.ts'], cwd=ROOT, env=env,
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            if not fail:
                for _ in range(900):
                    if process.poll() is not None:
                        raise RuntimeError(f'{label}: terminó antes de estar listo')
                    text = (OUTPUT / (label + '.log')).read_text()
                    if 'QA ready on' in text or 'Capture API ready on' in text:
                        break
                    time.sleep(0.1)
                else:
                    raise RuntimeError(f'{label}: no inició')
                os.kill(process.pid, stop_signal)
            code = process.wait(timeout=30)
            assert code == (1 if fail else 0), (label, code)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
    after = set(temporary.glob(prefix + '*'))
    text = (OUTPUT / (label + '.log')).read_text()
    assert after == before, (label, after - before)
    assert 'Fixture cerrado y directorio temporal eliminado.' in text
    assert 'unhandledRejection' not in text
    if fail:
        assert 'ENOENT' in text
    RESULTS.append({'fixture': name, 'signal': stop_signal.name if stop_signal else None, 'startupFailure': fail,
                    'exitCode': code, 'directoryRemoved': True, 'noUnhandledRejections': True})
    (OUTPUT / 'results.json').write_text(json.dumps(RESULTS, indent=2) + '\n')
    print(f'{label}: cierre y limpieza correctos', flush=True)
