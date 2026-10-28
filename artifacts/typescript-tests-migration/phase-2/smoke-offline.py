"""Comprueba el consumidor CJS y sus módulos ESM con Chrome aislado."""
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request
import uuid

session = 'afp-tests-ts2-' + uuid.uuid4().hex[:10]
cli = ['npx', '--yes', 'agent-browser@0.27.0', '--session', session]
origin = 'http://127.0.0.1:4192'
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 4192)) == 0:
        raise SystemExit('El puerto 4192 debe estar libre; no reutilizar otro fixture.')

def browser(*args, source=None):
    result = subprocess.run([*cli, *args], input=source, text=True, capture_output=True, timeout=50)
    print(result.stdout, end='', flush=True)
    if result.stderr:
        print(result.stderr, end='', flush=True)
    result.check_returncode()
    return result.stdout

with tempfile.TemporaryFile(mode='w+') as log:
    server = subprocess.Popen(['node', '--import', 'tsx', 'tests/helpers/offline-browser-server.cjs'],
                              stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    browser_started = False
    try:
        for _ in range(80):
            if server.poll() is not None:
                raise RuntimeError('El servidor offline terminó durante el arranque.')
            try:
                with urllib.request.urlopen(origin + '/state', timeout=1) as response:
                    assert response.status == 200
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError('El servidor offline no estuvo listo.')
        for path in ('/queue.js', '/observer.js'):
            with urllib.request.urlopen(origin + path, timeout=5) as response:
                assert response.status == 200
                assert 'javascript' in response.headers['Content-Type']
                assert 'export' in response.read().decode()
        browser_started = True
        browser('open', origin)
        browser('wait', '--fn', "!!window.q && typeof window.observeOfflineExpenses === 'function'")
        browser('eval', '--stdin', source='''(() => {
  if (!window.isSecureContext || !indexedDB || !navigator.locks) throw new Error('Faltan APIs offline');
  const names = Object.keys(window.q);
  if (!names.length || names.some(name => typeof window.q[name] !== 'function')) throw new Error('Exports de cola inválidos');
  return { importedQueueExports: names, observer: typeof window.observeOfflineExpenses, indexedDB: true, webLocks: true };
})()''')
        errors = browser('errors', '--json')
        if '"errors":[]' not in errors.replace(' ', '').replace('\n', ''):
            raise RuntimeError('Errores de navegador: ' + errors)
    finally:
        try:
            if browser_started:
                browser('close')
        finally:
            if server.poll() is None:
                os.killpg(server.pid, signal.SIGTERM)
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(server.pid, signal.SIGKILL)
                    server.wait(timeout=5)
            log.seek(0)
            print(log.read(), end='', flush=True)
            print('Fixture y sesión de navegador cerrados.', flush=True)
