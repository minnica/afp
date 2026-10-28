const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const wallet = require('./fixtures/captures/wallet-banamex-purchase.es.v1.json');
const bank = require('./fixtures/captures/banamex-card-charge.es.v1.json');
const { interpretCapture } = sourceLoader()('src/lib/captureParsers.ts');

test('Wallet real: MXN, comercio y título de Banamex; fecha de aviso México separada de operación bancaria', () => {
  const parsed = interpretCapture(wallet.event);
  assert.equal(parsed.reason, 'PURCHASE'); assert.equal(parsed.verified, true);
  assert.equal(parsed.proposal.amount, '123.45'); assert.equal(parsed.proposal.currency, 'MXN');
  assert.equal(parsed.proposal.merchant, 'COMERCIO FICTICIO'); assert.equal(parsed.proposal.printedAlias.value, '0123');
  assert.equal(parsed.proposal.aliasSourcePackage, bank.event.sourcePackage);
  assert.equal(parsed.proposal.date, '2026-10-20'); assert.equal(parsed.proposal.dateSource, 'NOTIFICATION_POSTED_AT');
  assert.equal(parsed.proposal.notificationAt, wallet.event.postedAt);
  for (const key of ['cardId', 'operationAt', 'alias']) assert.equal(parsed.proposal[key], undefined);
  assert.equal(parsed.proposal.reference, null);
});

test('Wallet real: no admite importes inválidos, otra marca, sufijo incompleto, texto extendido o fechas inválidas', () => {
  for (const body of ['MXN0.00 con Joy Banamex ••0123', 'MXN1,23.45 con Joy Banamex ••0123', 'MXN123.45 con OTRA TARJETA ••0123',
    'MXN123.45 con Joy Banamex ••123', 'MXN123.45 con Joy Banamex ••0123\nOtro importe: 99.00']) {
    assert.notEqual(interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields, 'android.text': body } }).reason, 'PURCHASE');
  }
  for (const postedAt of [null, '', 'fecha inválida', '2026-10-21T03:00:00Z']) {
    assert.notEqual(interpretCapture({ ...wallet.event, postedAt }).reason, 'PURCHASE');
  }
  assert.equal(interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields, 'android.bigText': 'MXN321.00 con Joy Banamex ••0123' } }).reason, 'CONFLICTING_FIELDS');
  assert.equal(interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields, 'android.text': wallet.event.fields['android.text'].replace('MXN', 'USD') } }).reason, 'FOREIGN_CURRENCY');
  assert.equal(interpretCapture({ ...wallet.event, sourcePackage: bank.event.sourcePackage }).reason, 'UNKNOWN_FORMAT');
  assert.equal(interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields, 'android.title': 'Devolución' } }).reason, 'SPECIAL_MOVEMENT');
});

test('Banamex real: cargo parcial, sufijo de tres cifras, fecha de operación AM/PM y autorización sin unicidad inventada', () => {
  const parsed = interpretCapture(bank.event);
  assert.equal(parsed.reason, 'INCOMPLETE_FORMAT'); assert.equal(parsed.verified, false);
  assert.equal(parsed.proposal.amount, '123.45'); assert.equal(parsed.proposal.date, '2026-10-20');
  assert.equal(parsed.proposal.operationAt, '2026-10-21T02:28:47.000Z');
  assert.equal(parsed.proposal.printedAlias.value, '123'); assert.equal(parsed.proposal.printedAlias.digits, 3);
  assert.equal(parsed.proposal.bankAuthorization, '999111'); assert.equal(parsed.proposal.evidenceOnly, true);
  for (const key of ['currency', 'reference', 'cardId']) assert.equal(parsed.proposal[key], undefined);
  for (const [printed, expected] of [['12:28:47 AM', '2026-10-20T06:28:47.000Z'], ['12:28:47 PM', '2026-10-20T18:28:47.000Z']]) {
    const body = bank.event.fields['android.text'].replace('08:28:47 PM', printed);
    assert.equal(interpretCapture({ ...bank.event, fields: { ...bank.event.fields, 'android.text': body, 'android.bigText': body } }).proposal.operationAt, expected);
  }
});

test('Banamex real: contradicciones, calendario imposible y tipo de aviso cambiado no se completan', () => {
  const conflict = interpretCapture({ ...bank.event, fields: { ...bank.event.fields, 'android.bigText': bank.event.fields['android.bigText'].replace('123.45', '999.00') } });
  assert.equal(conflict.reason, 'CONFLICTING_FIELDS');
  for (const change of [['20/10/26', '31/02/26'], ['08:28:47 PM', '13:28:47 PM'], ['123.45', '0.00'], ['Retiro/Compra', 'Cancelación/Compra']]) {
    const body = bank.event.fields['android.text'].replace(...change);
    const parsed = interpretCapture({ ...bank.event, fields: { ...bank.event.fields, 'android.text': body, 'android.bigText': body } });
    assert.notEqual(parsed.reason, 'PURCHASE'); assert.equal(Object.keys(parsed.proposal).length, 0);
  }
});
