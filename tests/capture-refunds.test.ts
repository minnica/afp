import assert from 'node:assert/strict';
import { test } from 'node:test';
import cancellation from './fixtures/captures/banamex-purchase-cancellation.es.v1.json';
import refund from './fixtures/captures/mercadopago-refund.es.v1.json';
import { sparseCalculations } from './helpers/financial-fixtures';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const { interpretCapture } = sparseCalculations(sourceLoader()('src/lib/captureParsers.ts'));
const { refundCaptureKind } = sourceLoader()('src/lib/captureRefundParsers.ts');

test('devoluciones reales: conserva datos impresos sin inventar tarjeta, MXN ni referencia', () => {
  for (const fixture of [refund, cancellation] as const) {
    const parsed = interpretCapture(fixture.event);
    assert.equal(parsed.reason, 'REFUND_REVIEW'); assert.equal(parsed.verified, true);
    assert.equal(parsed.proposal.amount, '123.45'); assert.equal(parsed.proposal.merchant, 'COMERCIO FICTICIO');
    assert.equal(parsed.proposal.movementType, 'REFUND'); assert.equal(refundCaptureKind(parsed), true);
    for (const key of ['cardId', 'currency', 'reference'] as const) assert.equal(parsed.proposal[key], undefined);
  }
  assert.equal(interpretCapture(cancellation.event).proposal.operationAt, '2026-10-24T18:00:00.000Z');
});

test('devoluciones: enteros observados; importes, textos contradictorios y fuentes ajenas requieren revisión', () => {
  for (const [raw, expected] of [['20', '20.00'], ['49.93', '49.93'], ['1,234.50', '1234.50']] as const) {
    const fields = { ...refund.event.fields, 'android.title': `COMERCIO FICTICIO te devolvió $${raw}`, 'android.title.big': `COMERCIO FICTICIO te devolvió $${raw}` };
    assert.equal(interpretCapture({ ...refund.event, fields }).proposal.amount, expected);
  }
  for (const [field, text] of [['android.title.big', 'Otro título'], ['android.bigText', 'Otro contenido']] as const) {
    assert.equal(interpretCapture({ ...refund.event, fields: { ...refund.event.fields, [field]: text } }).reason, 'CONFLICTING_FIELDS');
  }
  for (const raw of ['0', '-20', '1,23.00', '1.234', '1e3', '10000000000.00'] as const) {
    const fields = { 'android.title': `COMERCIO FICTICIO te devolvió $${raw}`, 'android.text': 'Para más detalles, entra aquí.' };
    assert.notEqual(interpretCapture({ ...refund.event, fields }).reason, 'REFUND_REVIEW');
  }
  for (const sourcePackage of ['com.google.android.apps.walletnfcrel', 'com.nu.production', 'com.mercadopago.wallet.fake'] as const) {
    assert.equal(interpretCapture({ ...refund.event, sourcePackage }).reason, 'UNKNOWN_FORMAT');
  }
  assert.equal(interpretCapture({ ...refund.event, fields: { ...refund.event.fields, 'android.subText': 'USD' } }).reason, 'FOREIGN_CURRENCY');
});

test('cancelación Banamex: tarjeta sin nombre y doble espacio conserva tres cifras sin inventar moneda', () => {
  const fields = Object.fromEntries(Object.entries(cancellation.event.fields)
    .map(([key, value]) => [key, value.replace('tarjeta JOY BANAMEX 123', 'tarjeta  123')]));
  const event = { ...cancellation.event, fields };
  assert.deepEqual(interpretCapture(event), interpretCapture(cancellation.event));
  for (const suffix of ['12', '1234', '', 'JOY OTRA 123']) {
    const invalid = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.replace('tarjeta  123', `tarjeta  ${suffix}`)]));
    assert.notEqual(interpretCapture({ ...event, fields: invalid }).reason, 'REFUND_REVIEW');
  }
  assert.equal(interpretCapture({ ...event, fields: { ...fields,
    'android.bigText': fields['android.bigText']!.replace('123.45', '999.00'),
  } }).reason, 'CONFLICTING_FIELDS');
});
