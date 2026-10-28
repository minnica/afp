const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const bank = require('./fixtures/captures/banamex-joy-card-charge.es.v1.json');
const wallet = require('./fixtures/captures/wallet-banamex2-purchase.es.v1.json');
const additional = require('./fixtures/captures/banamex-card-charge.es.v1.json');
const firstWallet = require('./fixtures/captures/wallet-banamex-purchase.es.v1.json');
const { interpretCapture, captureParsers } = sourceLoader()('src/lib/captureParsers.ts');
const change = (from, to) => {
  const text = bank.event.fields['android.text'].replace(from, to);
  return { ...bank.event, fields: { ...bank.event.fields, 'android.text': text, 'android.bigText': text } };
};

test('BANAMEX 2 reutiliza exactamente el analizador Wallet de BANAMEX 1 y conserva origen de fecha', () => {
  const parsed = interpretCapture(wallet.event), first = interpretCapture(firstWallet.event);
  assert.equal(parsed.parserKey, first.parserKey); assert.equal(parsed.parserKey, 'wallet.banamex-purchase.es.v1');
  assert.equal(parsed.reason, 'PURCHASE'); assert.equal(parsed.verified, true);
  assert.equal(parsed.proposal.amount, '123.45'); assert.equal(parsed.proposal.currency, 'MXN');
  assert.equal(parsed.proposal.date, '2026-10-20'); assert.equal(parsed.proposal.dateSource, 'NOTIFICATION_POSTED_AT');
  assert.equal(parsed.proposal.printedAlias.value, '0456'); assert.equal(parsed.proposal.aliasSourcePackage, bank.event.sourcePackage);
  assert.equal(parsed.proposal.cardId, undefined); assert.equal(parsed.proposal.operationAt, undefined);
});

test('JOY BANAMEX bancario conserva comercio completo, centavos, tres cifras, fecha AM/PM y autorización solo como evidencia', () => {
  const parsed = interpretCapture(bank.event), p = parsed.proposal;
  assert.equal(parsed.parserKey, 'banamex.joy-card-charge.es.v1'); assert.equal(parsed.verified, false);
  assert.equal(parsed.reason, 'INCOMPLETE_FORMAT'); assert.equal(p.evidenceOnly, true);
  assert.equal(p.merchant, 'COMERCIO FICTICIO     CIUDAD'); assert.equal(p.amount, '123.45');
  assert.equal(p.date, '2026-10-20'); assert.equal(p.operationAt, '2026-10-20T22:21:22.000Z'); assert.equal(p.dateSource, 'BANK_OPERATION');
  assert.equal(p.printedAlias.value, '456'); assert.equal(p.printedAlias.digits, 3); assert.equal(p.bankAuthorization, '999222');
  for (const field of ['currency', 'reference', 'cardId']) assert.equal(p[field], undefined);
  assert.deepEqual(Array.from(p.missingFields), ['currency', 'purchaseType']);
  const parser = captureParsers.find(p => p.key === parsed.parserKey);
  assert.equal(parser.verified, false); assert.equal(parser.evidenceOnly, true);
  assert.equal(interpretCapture(additional.event).parserKey, 'banamex.card-charge.es.v1');
});

test('JOY bancario rechaza cuerpos contradictorios, importes inválidos, calendarios imposibles y operaciones futuras', () => {
  for (const [from, to] of [['123.45', '0.00'], ['123.45', '1,23.45'], ['20/10/26', '31/02/26'], ['04:21:22 PM', '13:21:22 PM'], ['04:21:22 PM', '11:21:22 PM']]) {
    assert.equal(Object.keys(interpretCapture(change(from, to)).proposal).length, 0);
  }
  assert.equal(interpretCapture({ ...bank.event, fields: { ...bank.event.fields, 'android.bigText': bank.event.fields['android.bigText'].replace('123.45', '999.00') } }).reason, 'CONFLICTING_FIELDS');
  for (const [hour, expected] of [['12:21:22 AM', '2026-10-20T06:21:22.000Z'], ['12:21:22 PM', '2026-10-20T18:21:22.000Z']]) {
    assert.equal(interpretCapture(change('04:21:22 PM', hour)).proposal.operationAt, expected);
  }
});

test('JOY no amplía el formato bancario a otra marca, fuente, referencias, moneda supuesta ni avisos especiales', () => {
  for (const [from, to] of [['JOY BANAMEX456', 'JOY BANAMEX 456'], ['JOY BANAMEX456', 'JOY BANAMEX0456'], ['JOY BANAMEX456', 'OTRA MARCA456'],
    ['999222', 'ABC999222'], ['123.45', '-123.45'], ['123.45', '123.45 MXN'], ['Retiro/Compra', 'Pago de tarjeta']]) {
    assert.equal(Object.keys(interpretCapture(change(from, to)).proposal).length, 0);
  }
  for (const sourcePackage of ['com.google.android.apps.walletnfcrel', 'com.bancomer.mbanking']) assert.equal(interpretCapture({ ...bank.event, sourcePackage }).reason, 'UNKNOWN_FORMAT');
  for (const text of ['devolución', 'rechazada', 'MSI', 'código de acceso']) assert.equal(interpretCapture({ ...bank.event, fields: { ...bank.event.fields, 'android.subText': text } }).reason, 'SPECIAL_MOVEMENT');
});
