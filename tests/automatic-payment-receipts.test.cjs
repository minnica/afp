const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const fixture = require('./fixtures/captures/bbva-payment-receipt.es.v1.json');
const { parsePaymentReceipt, paymentReceiptSource, validClabe } = sourceLoader()('src/lib/paymentReceipts.ts');
const event = text => ({ sourcePackage: paymentReceiptSource, fields: { 'receipt.text': text } });
test('comprobante BBVA: destino, importe, día bancario, concepto y rastreo; no infiere moneda o tarjeta', () => {
  const result = parsePaymentReceipt(event(fixture.text));
  assert.equal(result.reason, 'PAYMENT_RECEIPT'); assert.equal(result.proposal.amount, '123.45');
  assert.equal(result.proposal.date, '2026-10-21'); assert.equal(result.proposal.statementMonth, 10);
  assert.equal(result.proposal.statementYear, null); assert.equal(result.proposal.dateSource, 'BANK_OPERATION');
  assert.equal(result.proposal.destinationLast4, '0009'); assert.equal(result.proposal.currency, undefined); assert.equal(result.proposal.cardId, undefined);
  assert.equal(parsePaymentReceipt(event(fixture.text.replace('Clave de rastreo', 'Clave de rastre0'))).reason, 'PAYMENT_RECEIPT');
});
test('comprobante: errores de dígitos OCR, fechas, importes o rastreo no habilitan abonos', () => {
  assert.ok(validClabe('012180000000000002')); assert.ok(validClabe('646180000000000009'));
  for (const [before, after] of [['000009','000008'], ['$ -123.45','$ -123.4S'], ['22:32:27','25:32:27'], ['MBAN010026102200000000001','error'], ['2026-10-21T22:32:49.011-06:00','2026-10-22T22:32:49.011-06:00']]) {
    assert.equal(parsePaymentReceipt(event(fixture.text.replace(before, after))).reason, 'RECEIPT_INCOMPLETE', before);
  }
});
test('concepto noviembre se conserva como noviembre; no se sustituye por el mes de operación', () => {
  assert.equal(parsePaymentReceipt(event(fixture.text.replace('estado de cuenta octubre','estado de cuenta noviembre'))).proposal.statementMonth, 11);
  assert.equal(parsePaymentReceipt(event(fixture.text.replace('estado de cuenta octubre','pago'))).reason, 'RECEIPT_PERIOD_REQUIRED');
});
