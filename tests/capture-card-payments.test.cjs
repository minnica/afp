const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const fixture = require('./fixtures/captures/nu-card-payment.es.v1.json');
const load = sourceLoader();
const { interpretCapture } = load('src/lib/captureParsers.ts');
const { paymentStatementPeriod } = load('src/lib/capturePaymentParsers.ts');

test('pago Nu real anonimizado: identifica recepción, conserva ausencias y usa fecha propuesta explícita', () => {
  const p = interpretCapture(fixture.event);
  assert.equal(p.reason, 'PAYMENT_REVIEW'); assert.equal(p.verified, false);
  assert.equal(p.proposal.amount, '123.45'); assert.equal(p.proposal.movementType, 'CARD_PAYMENT');
  assert.equal(p.proposal.date, '2026-10-21'); assert.equal(p.proposal.dateSource, 'NOTIFICATION_POSTED_AT');
  for (const field of ['cardId', 'currency', 'operationAt', 'statementPeriod']) assert.equal(p.proposal[field], undefined);
});
test('Cajita, ingreso a Cuenta Nu, recordatorio y pago CFE no son abonos a tarjeta', () => {
  for (const title of ['Retiraste dinero de tu Cajita 🤑', 'Agregaste dinero a tu Cajita Turbo 🚀', '¡Recibiste una transferencia!', 'Evita la comisión por pago tardío', 'Tu pago a CFE fue exitoso']) {
    const result = interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.title': title } });
    assert.notEqual(result.proposal.movementType, 'CARD_PAYMENT');
  }
});
test('pago Nu: texto contradictorio, otro paquete, fecha inválida y cancelación no acreditan pago', () => {
  const changed = { ...fixture.event, fields: { ...fixture.event.fields, 'android.bigText': 'Otro movimiento' } };
  assert.equal(interpretCapture(changed).reason, 'CONFLICTING_FIELDS');
  assert.equal(interpretCapture({ ...fixture.event, sourcePackage: 'com.mercadopago.wallet' }).reason, 'UNKNOWN_FORMAT');
  assert.equal(interpretCapture({ ...fixture.event, postedAt: 'invalid' }).reason, 'INCOMPLETE_FORMAT');
  assert.equal(interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.subText': 'cancelación' } }).reason, 'SPECIAL_MOVEMENT');
});
test('concepto de estado: reconoce mes, conserva año ausente y rechaza texto ambiguo', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(paymentStatementPeriod('estado de cuenta octubre'))), { month: 10, year: null });
  assert.equal(paymentStatementPeriod(' ESTADO DE CUENTA ENERO 2027 ').year, 2027);
  for (const text of ['estado de cuenta octubre noviembre', 'octubre', 'estado de cuenta enero 26', '', null]) assert.equal(paymentStatementPeriod(text), null);
});
