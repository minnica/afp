const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const refund = require('./fixtures/captures/mercadopago-refund.es.v1.json');
const cancellation = require('./fixtures/captures/banamex-purchase-cancellation.es.v1.json');
const { interpretCapture } = sourceLoader()('src/lib/captureParsers.ts');
const { refundCaptureKind } = sourceLoader()('src/lib/captureRefundParsers.ts');

test('devoluciones reales: conserva datos impresos sin inventar tarjeta, MXN ni referencia', () => {
  for (const fixture of [refund, cancellation]) {
    const parsed = interpretCapture(fixture.event);
    assert.equal(parsed.reason, 'REFUND_REVIEW'); assert.equal(parsed.verified, true);
    assert.equal(parsed.proposal.amount, '123.45'); assert.equal(parsed.proposal.merchant, 'COMERCIO FICTICIO');
    assert.equal(parsed.proposal.movementType, 'REFUND'); assert.equal(refundCaptureKind(parsed), true);
    for (const key of ['cardId', 'currency', 'reference']) assert.equal(parsed.proposal[key], undefined);
  }
  assert.equal(interpretCapture(cancellation.event).proposal.operationAt, '2026-10-24T18:00:00.000Z');
});

test('devoluciones: enteros observados; importes, textos contradictorios y fuentes ajenas requieren revisión', () => {
  for (const [raw, expected] of [['20', '20.00'], ['49.93', '49.93'], ['1,234.50', '1234.50']]) {
    const fields = { ...refund.event.fields, 'android.title': `COMERCIO FICTICIO te devolvió $${raw}`, 'android.title.big': `COMERCIO FICTICIO te devolvió $${raw}` };
    assert.equal(interpretCapture({ ...refund.event, fields }).proposal.amount, expected);
  }
  for (const [field, text] of [['android.title.big', 'Otro título'], ['android.bigText', 'Otro contenido']]) {
    assert.equal(interpretCapture({ ...refund.event, fields: { ...refund.event.fields, [field]: text } }).reason, 'CONFLICTING_FIELDS');
  }
  for (const raw of ['0', '-20', '1,23.00', '1.234', '1e3', '10000000000.00']) {
    const fields = { 'android.title': `COMERCIO FICTICIO te devolvió $${raw}`, 'android.text': 'Para más detalles, entra aquí.' };
    assert.notEqual(interpretCapture({ ...refund.event, fields }).reason, 'REFUND_REVIEW');
  }
  for (const sourcePackage of ['com.google.android.apps.walletnfcrel', 'com.nu.production', 'com.mercadopago.wallet.fake']) {
    assert.equal(interpretCapture({ ...refund.event, sourcePackage }).reason, 'UNKNOWN_FORMAT');
  }
  assert.equal(interpretCapture({ ...refund.event, fields: { ...refund.event.fields, 'android.subText': 'USD' } }).reason, 'FOREIGN_CURRENCY');
});
