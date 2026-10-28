"""Authenticated navigation smoke test against the isolated local UI fixture."""
import json
import os
from pathlib import Path
import subprocess

ARTIFACTS = Path(__file__).resolve().parent
cli = os.environ.get('AFP_BROWSER_CLI', 'agent-browser')
origin = 'http://127.0.0.1:4226'
def run(*args):
    result = subprocess.run([cli, '--session', 'afp-ts-phase6-production', *args], text=True, capture_output=True, timeout=45)
    if result.returncode:
        raise RuntimeError(f'{args[0]}: {result.stdout} {result.stderr}')
    return result.stdout

def evaluate(code):
    return json.loads(run('eval', code))

screens = [
    ('dashboard', 'PAGOS DE TARJETAS'), ('mi-dinero', 'Banco ficticio'),
    ('gastos', 'Compra ficticia CASH'), ('registro-automatico?tipo=otros', 'Aviso ficticio'),
    ('analisis', 'Gastos por semana'), ('compras-a-meses', 'Compra ficticia a meses'),
    ('suscripciones', 'Servicio ficticio'), ('ingresos', 'Ingreso de prueba'),
    ('cuentas-por-cobrar', 'Cobro ficticio'), ('cuentas-por-pagar', 'Deuda ficticia'),
    ('tarjetas', 'Tarjeta ficticia'), ('credito-y-deuda', 'Tarjeta ficticia'),
    ('configuracion', 'Categoría ficticia'),
]
records = []
try:
    run('errors', '--clear')
    run('console', '--clear')
    for device, width, height in [('desktop', 1440, 1000), ('mobile', 390, 844)]:
        run('set', 'viewport', str(width), str(height))
        for route, marker in screens:
            run('open', f'{origin}/{route}')
            if route == 'mi-dinero':
                run('wait', '--text', 'Tu dinero en el tiempo')
                run('find', 'role', 'tab', 'click', '--name', 'Cuentas', '--exact')
            run('wait', '--text', marker)
            if device == 'mobile' and evaluate('Boolean(document.querySelector("[aria-label=\\"Cerrar formulario\\"]"))'):
                if route == 'gastos':
                    run('screenshot', str(ARTIFACTS / 'gastos-mobile-form.png'))
                run('find', 'role', 'button', 'click', '--name', 'Cerrar formulario', '--exact')
            state = evaluate('({url:location.pathname+location.search,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,headings:[...document.querySelectorAll("h1,h2")].map(e=>e.textContent),alerts:[...document.querySelectorAll("[role=alertdialog]")].map(e=>e.innerText)})')
            state.update(device=device, marker=marker)
            errors = json.loads(run('errors', '--json'))['data']['errors']
            state['errors'] = errors
            records.append(state)
            (ARTIFACTS / 'browser-smoke.json').write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')
            assert not errors, errors
            assert not state['alerts'], state['alerts']
            assert state['scrollWidth'] <= width, state
            if (device, route) in [('desktop', 'gastos'), ('mobile', 'gastos'), ('mobile', 'analisis'), ('mobile', 'registro-automatico?tipo=otros')]:
                run('screenshot', str(ARTIFACTS / f'{route.split("?")[0]}-{device}.png'))
            print(json.dumps({'device': device, 'route': route, 'passed': True}), flush=True)
finally:
    (ARTIFACTS / 'browser-smoke.json').write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')
