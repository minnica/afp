"""Recorridos con Chrome, API real/PostgreSQL y dos pestañas IndexedDB/Web Locks.

Requiere una BD local desechable migrada en AFP_TEST_DATABASE_URL. Crea sus
servidores, sesión y salidas en un destino nuevo y los cierra incluso al fallar.
"""
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(sys.argv[1]).resolve()
OUTPUT.mkdir(parents=True, exist_ok=False)
SESSION = 'afp-ts5-' + uuid.uuid4().hex[:10]
CLI = ['npx', '--yes', 'agent-browser@0.27.0', '--session', SESSION]
ENV = dict(os.environ, AFP_CAPTURE_TEST_PRODUCTION='1', AFP_CAPTURE_TEST_REAL_DASHBOARD='1', AFP_UI_TEST_REAL_SETTINGS='1', AFP_UI_TEST_PORT='4216')
SERVERS = []
LOGS = []
RESULTS = {}


def save(name, value):
    (OUTPUT / (name + '.json')).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def browser(*args, source=None):
    result = subprocess.run([*CLI, *args], input=source, cwd=ROOT, text=True, capture_output=True, timeout=50)
    if result.returncode:
        raise RuntimeError(f'{args}: {result.stdout} {result.stderr}')
    return result.stdout.strip()


def evaluate(source):
    return json.loads(browser('eval', '--stdin', source=source))


def action(role, label, command='click', *args):
    snapshot = browser('snapshot', '-i')
    matches = re.findall(r'- ' + re.escape(role) + ' "' + re.escape(label) + r'"[^\n]*?\[[^\]\n]*ref=(e\d+)\]', snapshot)
    if not matches:
        raise RuntimeError(f'Falta {role} {label}: {snapshot}')
    with (OUTPUT / 'actions.log').open('a') as log:
        log.write(f'{role} {label}: {command} @{matches[0]} {args}\n{snapshot}\n\n')
    if command == 'click':
        browser('scrollintoview', '@' + matches[0])
    return browser(command, '@' + matches[0], *args)


def wait_for(expression):
    browser('wait', '--fn', expression)


def state():
    with urllib.request.urlopen('http://127.0.0.1:4192/state', timeout=5) as response:
        return json.load(response)


def check_page(name):
    errors = json.loads(browser('errors', '--json'))['data']['errors']
    page = evaluate('({url:location.pathname+location.search,alerts:[...document.querySelectorAll("[role=alertdialog]")].map(e=>e.innerText),overflow:document.documentElement.scrollWidth>innerWidth})')
    save(name + '-page', dict(page, errors=errors))
    assert not errors and not page['alerts'] and not page['overflow'], page
    browser('screenshot', str(OUTPUT / (name + '.png')))


def login(origin, email):
    browser('open', origin + '/login')
    browser('set', 'viewport', '1440', '1000')
    wait_for("!!document.querySelector('input') && Object.keys(document.querySelector('input')).some(key => key.startsWith('__reactProps'))")
    action('textbox', 'Correo electrónico', 'fill', email)
    action('textbox', 'Contraseña', 'fill', 'fictional-password')
    action('button', 'Entrar')
    wait_for("location.pathname === '/dashboard' && !document.querySelector('[role=alertdialog]')")


def record_requests(path, method):
    evaluate('''(() => {
      window.recorded = [];
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).includes(PATH) && args[1]?.method === METHOD) {
          window.recorded.push({body:JSON.parse(args[1].body),status:response.status,response:await response.clone().json()});
        }
        return response;
      };
      return true;
    })()'''.replace('PATH', json.dumps(path)).replace('METHOD', json.dumps(method)))


def next_fixtures():
    login('http://127.0.0.1:4216', 'money-qa@example.test')
    browser('open', 'http://127.0.0.1:4216/mi-dinero')
    wait_for("document.body.innerText.includes('Tu dinero en el tiempo')")
    action('tab', 'Cuentas')
    record_requests('/api/money', 'POST')
    action('button', 'Transferir')
    action('combobox', 'Cuenta de origen')
    action('option', 'Banco ficticio')
    action('combobox', 'Cuenta de destino')
    action('option', 'Efectivo ficticio')
    action('spinbutton', 'Importe', 'fill', '125.50')
    action('textbox', 'Concepto', 'fill', 'Transferencia fase 5 pruebas')
    action('button', 'Guardar')
    wait_for("recorded.length === 1 && !document.body.innerText.includes('Transferir entre mis cuentas')")
    transfers = evaluate('recorded')
    assert len(transfers) == 1 and transfers[0]['status'] == 200
    assert transfers[0]['body']['amount'] == 125.5 and transfers[0]['body']['action'] == 'TRANSFER'
    save('transfer', transfers)
    check_page('money')
    print('Transferencia: formulario, POST y respuesta correctos.', flush=True)

    login('http://127.0.0.1:4208', 'capture-qa@example.test')
    browser('open', 'http://127.0.0.1:4208/registro-automatico?tipo=otros')
    wait_for("document.body.innerText.includes('TIENDA FICTICIA')")
    record_requests('/api/captures/movements', 'PATCH')
    action('button', 'Revisar')
    wait_for("document.body.innerText.includes('Revisar gasto')")
    action('textbox', 'Concepto', 'fill', 'Revisión ficticia fase 5 pruebas')
    action('button', 'Guardar sin registrar')
    wait_for('recorded.length === 1')
    review = evaluate('recorded')
    assert len(review) == 1 and review[0]['status'] == 200 and review[0]['body']['action'] == 'correct'
    save('capture', review)
    action('button', 'Cerrar')
    check_page('capture')
    print('Captura: revisión, PATCH y respuesta correctos.', flush=True)


def offline():
    browser('open', 'http://127.0.0.1:4192')
    wait_for('!!window.q && !!window.observeOfflineExpenses')
    first_tab = json.loads(browser('tab', '--json'))['data']['tabs']
    # Obtener los IDs estables del navegador evita depender de su numeración.
    first_tab = next(tab['tabId'] for tab in first_tab if tab['active'])
    lost = evaluate('''(async () => {
      if (!isSecureContext || !navigator.locks || !indexedDB) throw new Error('Faltan APIs');
      const draft = {date:'2026-10-28',concept:'perdida',amount:'12.34',categoryId:'fictional',paymentMethod:'CASH'};
      const entry = await q.addOfflineExpense('user-a', draft);
      const result = await q.syncOfflineExpenses('user-a');
      return {entry,result};
    })()''')
    assert len(lost['result']['failedExpenses']) == 1
    assert len(state()['receipts']) == 1
    save('offline-lost-response', lost)
    browser('tab', 'new', 'http://127.0.0.1:4192')
    wait_for('!!window.q')
    second_tab = next(tab['tabId'] for tab in json.loads(browser('tab', '--json'))['data']['tabs'] if tab['active'])
    recovered = evaluate('''(async () => {
      const before = await q.readOfflineExpenses('user-a');
      const result = await q.syncOfflineExpenses('user-a');
      return {before,result};
    })()''')
    assert recovered['before'][0]['clientId'] == lost['entry']['clientId']
    assert len(recovered['result']['confirmations']) == 1 and not recovered['result']['failedExpenses']
    assert state()['requests'] == [lost['entry']['clientId']] * 2 and len(state()['receipts']) == 1
    save('offline-recovered-second-tab', recovered)
    account = evaluate('''(async () => {
      const draft = {date:'2026-10-28',concept:'cuenta-a',amount:'1.25',categoryId:'fictional',paymentMethod:'CASH'};
      const a = await q.addOfflineExpense('user-a',draft);
      const b = await q.addOfflineExpense('user-b',{...draft,concept:'cuenta-b'});
      const result = await q.syncOfflineExpenses('user-b');
      const remainingA = await q.readOfflineExpenses('user-a');
      await q.syncOfflineExpenses('user-a');
      return {a,b,result,remainingA};
    })()''')
    assert len(account['result']['confirmations']) == 1 and account['remainingA'][0]['clientId'] == account['a']['clientId']
    save('offline-account-change', account)
    concurrent = evaluate('''(async () => {
      window.observed = [];
      window.stopObserving = q.subscribeOfflineExpenses('user-a', change => observed.push(change ?? {}));
      const entry = await q.addOfflineExpense('user-a',{date:'2026-10-28',concept:'cierre',amount:'8.75',categoryId:'fictional',paymentMethod:'CASH'});
      window.concurrent = q.syncOfflineExpenses('user-a');
      return entry;
    })()''')
    for _ in range(50):
        if state()['held'] == 1:
            break
        time.sleep(0.1)
    else:
        raise RuntimeError('No se retuvo la respuesta concurrente')
    browser('tab', first_tab)
    evaluate('window.concurrent = q.syncOfflineExpenses("user-a"); "started"')
    with urllib.request.urlopen('http://127.0.0.1:4192/release', timeout=5) as response:
        assert json.load(response)['ok']
    first = evaluate('(async () => ({result:await concurrent,remaining:await q.readOfflineExpenses("user-a")}))()')
    browser('tab', second_tab)
    second = evaluate('(async () => {const result=await concurrent; stopObserving(); return {result,observed,remaining:await q.readOfflineExpenses("user-a")};})()')
    assert not first['remaining'] and not second['remaining']
    assert len(first['result']['confirmations']) + len(second['result']['confirmations']) == 1
    final = state()
    assert final['requests'].count(concurrent['clientId']) == 1
    assert len(final['receipts']) == 4 and final['held'] == 0
    assert any(change.get('confirmed') for change in second['observed'])
    save('offline-concurrent', {'entry': concurrent, 'firstTab': first, 'secondTab': second, 'server': final})
    check_page('offline')
    print('Offline: respuesta perdida, segunda pestaña, cambio de cuenta y sincronización única correctos.', flush=True)


def verify_database():
    code = r'''
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixtureConnection, fixtureDatabase } = require('./tests/helpers/fixture-database.ts');
(async () => {
 const db = await fixtureDatabase(fixtureConnection());
 try {
  const out = process.argv[1];
  const [transfer] = JSON.parse(fs.readFileSync(path.join(out, 'transfer.json')));
  const [capture] = JSON.parse(fs.readFileSync(path.join(out, 'capture.json')));
  const stored = await db.moneyTransfer.findUniqueOrThrow({where:{id:transfer.response.id}});
  assert.equal(Number(stored.amount), 125.5);
  for (const key of ['concept','fromAccountId','toAccountId']) assert.equal(stored[key], transfer.body[key]);
  const operations = await db.moneyOperation.findMany({where:{userId:stored.userId,operationId:transfer.body.operationId}});
  assert.equal(operations.length,1);
  const movement = await db.captureMovement.findUniqueOrThrow({where:{id:capture.body.id}});
  assert.equal(movement.correction.merchant, 'Revisión ficticia fase 5 pruebas');
  assert.equal(movement.expenseId, null);
  const cards = await db.card.count({where:{userId:movement.userId}});
  const aliases = await db.captureCardAlias.count({where:{userId:movement.userId}});
  const events = await db.captureEvent.count({where:{userId:movement.userId}});
  assert.equal(cards,9); assert.equal(aliases,24); assert.equal(events,3);
  fs.writeFileSync(path.join(out,'database.json'), JSON.stringify({stored,operations,movement,cards,aliases,events},null,2)+'\n');
 } finally {await db.$disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1});
'''
    subprocess.run(['node', '--import', 'tsx', '-e', code, str(OUTPUT)], cwd=ROOT, env=ENV, check=True)


try:
    for port in (4192, 4208, 4209, 4216, 4217):
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError(f'El puerto {port} debe estar libre.')
    for name in ('seed-ui', 'seed-capture-review'):
        result = subprocess.run(['node', '--import', 'tsx', f'tests/helpers/{name}.ts'], cwd=ROOT, env=ENV, text=True, capture_output=True, check=True)
        (OUTPUT / (name + '.log')).write_text(result.stdout + result.stderr)
    for name, port in (('money', 4216), ('capture', 4208), ('offline', 4192)):
        log = (OUTPUT / (name + '-server.log')).open('w')
        LOGS.append(log)
        process = subprocess.Popen(['node', '--import', 'tsx', f'tests/helpers/{name}-browser-server.ts'], cwd=ROOT, env=ENV, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        SERVERS.append(process)
        for _ in range(1800):
            if process.poll() is not None:
                raise RuntimeError(f'{name}: terminó durante el arranque; consultar log')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/auth/v1/token' if name != 'offline' else f'http://127.0.0.1:{port}/state', timeout=1) as response:
                    assert response.status == 200
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError(f'{name}: no inició')
    configurations = []
    for name in ('money', 'capture'):
        log = (OUTPUT / (name + '-server.log')).read_text()
        directory = Path(re.search(r'Fixture directory: (.+)', log).group(1))
        assert not list(directory.glob('.env*'))
        assert not list(directory.glob('tsconfig.test*.json'))
        assert not (directory / 'tests').exists()
        assert (directory / 'next-env.d.ts').is_file() and (directory / '.next/types').is_dir()
        assert (directory / '.next/BUILD_ID').is_file()
        configurations.append({'fixture': name, 'noEnvironmentFiles': True, 'noTestConfiguration': True,
                               'nextTypesRegenerated': True, 'isolatedProductionBuild': True})
    save('fixture-configurations', configurations)
    next_fixtures()
    verify_database()
    offline()
    RESULTS['completed'] = True
except BaseException as error:
    RESULTS['failure'] = f'{type(error).__name__}: {error}'
    try:
        (OUTPUT / 'failure-snapshot.txt').write_text(browser('snapshot'))
        save('failure-browser-state', evaluate('({url:location.href,recorded:window.recorded,inputs:[...document.querySelectorAll("input")].map(e=>({id:e.id,value:e.value,invalid:e.getAttribute("aria-invalid")}))})'))
    except Exception:
        pass
    raise
finally:
    try:
        browser('close')
    finally:
        for process in SERVERS:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=5)
        for log in LOGS:
            log.close()
        directories = []
        for name in ('money', 'capture'):
            log = OUTPUT / (name + '-server.log')
            if log.exists():
                matches = re.findall(r'Fixture directory: (.+)', log.read_text())
                directories.extend(matches)
        RESULTS.update(cleanedUp=all(not Path(folder).exists() for folder in directories), serversStopped=all(p.poll() is not None for p in SERVERS), temporaryDirectories=directories)
        save('execution', RESULTS)
        if not RESULTS['cleanedUp']:
            raise RuntimeError('No se eliminaron los directorios temporales')
