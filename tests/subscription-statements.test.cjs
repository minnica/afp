const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const helpers = ['installmentStatements', 'cardCredits', 'subscriptionStatements']
  .map(name => read(`src/lib/calculations/${name}.js`).replace(/^export /gm, '')).join('\n');
const contexts = ['card-cycles', 'dashboard'].map(route => {
  const ctx = vm.createContext({});
  const source = read(`src/app/api/${route}/route.js`)
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(helpers + '\n' + source, ctx);
  return { route, ctx };
});
const subscription = { id: 'internet', cardId: 'card', name: 'Internet', amount: '379.00',
  chargeDay: 3, paymentMethod: 'CARD', frequencyMonths: 1, startMonth: 1,
  startYear: 2026, isActive: true };
const chargeDate = '2026-10-03T12:00:00Z';
const evidence = { version: 1, source: 'octubre.pdf', sourceSha256: 'a'.repeat(64),
  startDate: '2026-09-10', cutDate: '2026-10-09', subscriptionCharges: [
    { subscriptionId: 'internet', date: '2026-10-03', amount: '279.00', applyToCycleAmount: true },
  ] };
const cycle = { id: 'october', cardId: 'card', year: 2026, month: 10,
  startDate: '2026-09-10T12:00:00Z', cutDate: '2026-10-09T12:00:00Z',
  dueDate: '2026-10-31T12:00:00Z', statementAmount: '279.00', usageReconciliation: evidence,
  card: { id: 'card', usualCutDay: 10, usualDueDay: 29 } };
const amount = (ev, sub = subscription, date = chargeDate) => contexts[0].ctx
  .getSubscriptionStatementAmount(sub, { ...cycle, usageReconciliation: ev }, date);

test('descuento temporal concilia ambas rutas sin cambiar la tarifa ni duplicar cargos', () => {
  const before = JSON.stringify({ subscription, cycle });
  for (const { route, ctx } of contexts) {
    const result = ctx.calculateCycleAmount({ cycle, expenses: [], subscriptions: [subscription], purchases: [] });
    assert.equal(result.subscriptionsAmount, 279);
    assert.equal(result.calculatedAmount, 279);
    assert.equal(result.difference, 0);
    if (route === 'card-cycles') assert.equal(result.includedSubscriptions.length, 1);
  }
  assert.equal(JSON.stringify({ subscription, cycle }), before);
});
test('otros cortes y otra suscripción conservan su importe', () => {
  assert.equal(amount(undefined), 379);
  assert.equal(amount({ ...evidence, cutDate: '2026-09-09' }), 379);
  assert.equal(amount(evidence, { ...subscription, id: 'other' }), 379);
  assert.equal(amount(evidence, { ...subscription, cardId: 'other' }), 379);
  assert.equal(amount(evidence, subscription, '2026-11-03'), 379);
});
test('evidencia histórica solo de consumo mínimo no cambia cálculos financieros', () => {
  assert.equal(amount({ ...evidence, subscriptionCharges: [{ ...evidence.subscriptionCharges[0], applyToCycleAmount: undefined }] }), 379);
});
test('rechaza referencias inválidas, fechas imposibles e importes que no son cargos', () => {
  for (const change of [{ source: '' }, { sourceSha256: 'invalid' }, { version: 2 },
    { startDate: '2026-09-31' }, { startDate: '2026-10-10' }, { cutDate: '2026-11-09' }]) {
    assert.equal(amount({ ...evidence, ...change }), 379);
  }
  for (const value of [null, '', false, -1, 'NaN', 'Infinity', 0, '279.005', ' 279 ']) {
    assert.equal(amount({ ...evidence, subscriptionCharges: [{ ...evidence.subscriptionCharges[0], amount: value }] }), 379);
  }
  assert.equal(amount({ ...evidence, subscriptionCharges: [{ ...evidence.subscriptionCharges[0], date: '2026-10-10' }] }), 379);
});
test('no colapsa cargos múltiples ambiguos del mismo mes', () => {
  assert.equal(amount({ ...evidence, subscriptionCharges: [...evidence.subscriptionCharges, { ...evidence.subscriptionCharges[0] }] }), 379);
});
test('la baja de una suscripción conserva las reglas de inclusión del corte', () => {
  for (const { ctx } of contexts) {
    const result = ctx.calculateCycleAmount({ cycle, expenses: [], purchases: [],
      subscriptions: [{ ...subscription, isActive: false, deactivatedAt: '2026-09-30T12:00:00Z' }] });
    assert.equal(result.subscriptionsAmount, 0);
  }
});
