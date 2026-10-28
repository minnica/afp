const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const fixture = require('./fixtures/captures/nu-cfe-service-payment.es.v1.json');
const { interpretCapture, captureParsers } = sourceLoader()('src/lib/captureParsers.ts');

test('Nu real anonimizado: pago CFE conserva solo importe/comercio y exige completar tarjeta, moneda y fecha', () => {
  const result = interpretCapture(fixture.event);
  assert.equal(result.parserKey, 'nu.cfe-service-payment.es.v2');
  assert.equal(result.reason, 'FORMAT_POLICY_REQUIRED'); assert.equal(result.verified, false);
  assert.equal(result.proposal.amount, '123.45'); assert.equal(result.proposal.merchant, 'CFE');
  assert.equal(result.proposal.movementType, 'SERVICE_PAYMENT');
  assert.deepEqual(Array.from(result.proposal.missingFields), ['currency', 'card', 'operationDate']);
  for (const key of ['cardId', 'alias', 'currency', 'date', 'operationAt', 'reference']) assert.equal(result.proposal[key], undefined);
  const parser = captureParsers.find(row => row.key === result.parserKey);
  assert.equal(parser.verified, true); assert.equal(parser.evidence, 'REAL_REVIEWED_POLICY_REQUIRED');
  assert.equal(captureParsers.find(row => row.key === 'nu.cfe-service-payment.es.v1').verified, false);
});

test('Nu CFE: ni el resto de campos Android ni sus fechas completan datos bancarios ausentes', () => {
  const result = interpretCapture({ ...fixture.event, postedAt: '2026-10-22T02:00:00Z', receivedAt: '2026-10-22T02:00:01Z', fields: {
    ...fixture.event.fields, 'android.subText': 'Aviso del 21/10/2026 · tarjeta *0123 · MXN',
  } });
  assert.equal(result.reason, 'FORMAT_POLICY_REQUIRED');
  for (const key of ['cardId', 'alias', 'currency', 'date', 'operationAt']) assert.equal(result.proposal[key], undefined);
});

test('Nu CFE: importes inválidos, textos contradictorios y avisos ampliados quedan sin propuesta', () => {
  for (const amount of ['0.00', '1,23.45', '-123.45', '123', '123.456']) {
    const body = `El pago de $${amount} a CFE fue exitoso.`;
    const result = interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.text': body, 'android.bigText': body } });
    assert.equal(Object.keys(result.proposal).length, 0, amount);
  }
  const conflict = interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.bigText': 'El pago de $321.00 a CFE fue exitoso.' } });
  assert.equal(conflict.reason, 'CONFLICTING_FIELDS'); assert.equal(Object.keys(conflict.proposal).length, 0);
  const extra = 'El pago de $123.45 a CFE fue exitoso. Otro cargo de $99.00.';
  assert.equal(Object.keys(interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.text': extra, 'android.bigText': extra } }).proposal).length, 0);
});

test('Nu CFE: no generaliza a otros destinatarios, bancos o avisos financieros', () => {
  for (const sourcePackage of ['com.bancomer.mbanking', 'com.google.android.apps.walletnfcrel', 'com.mercadopago.wallet']) {
    assert.equal(interpretCapture({ ...fixture.event, sourcePackage }).reason, 'UNKNOWN_FORMAT');
  }
  assert.equal(interpretCapture({ ...fixture.event, fields: { 'android.title': 'Tu pago a OTRO fue exitoso', 'android.text': 'El pago de $123.45 a OTRO fue exitoso.' } }).reason, 'UNKNOWN_FORMAT');
  assert.equal(interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.subText': 'devolución' } }).reason, 'SPECIAL_MOVEMENT');
  assert.equal(interpretCapture({ ...fixture.event, fields: { 'android.title': 'Pago de tarjeta recibido', 'android.text': 'Recibimos tu pago de $123.45.' } }).reason, 'UNKNOWN_FORMAT');
});
