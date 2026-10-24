const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const fixture = require('./fixtures/captures/wallet-didi-purchase.es.v1.json');
const banamex = require('./fixtures/captures/wallet-banamex-purchase.es.v1.json');
const santander = require('./fixtures/captures/wallet-santander-purchase.es.v1.json');
const { interpretCapture, captureParsers } = sourceLoader()('src/lib/captureParsers.js');
const body = text => ({ ...fixture.event, fields: { ...fixture.event.fields, 'android.text': text } });

test('Wallet DiDi real: importe y MXN explícitos, comercio, alias bancario y fecha del aviso México separados de operación', () => {
  const result = interpretCapture(fixture.event), p = result.proposal;
  assert.equal(result.reason, 'PURCHASE'); assert.equal(result.verified, true);
  assert.equal(result.parserKey, 'wallet.didi-purchase.es.v1');
  assert.equal(p.amount, '123.45'); assert.equal(p.currency, 'MXN'); assert.equal(p.merchant, 'COMERCIO FICTICIO');
  assert.equal(p.printedAlias.value, '0123'); assert.equal(p.printedAlias.digits, 4);
  assert.equal(p.aliasSourcePackage, 'com.didiglobal.cashloan');
  assert.equal(p.dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(p.date, '2026-10-20');
  assert.equal(p.notificationAt, fixture.event.postedAt); assert.equal(p.timeZone, 'America/Mexico_City');
  assert.equal(p.reference, null);
  for (const key of ['cardId', 'alias', 'operationAt', 'completionPolicy']) assert.equal(p[key], undefined);
  const parser = captureParsers.find(p => p.key === result.parserKey);
  assert.equal(parser.dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(parser.aliasSourcePackage, p.aliasSourcePackage);
  assert.deepEqual(Array.from(parser.aliasKinds), ['PHYSICAL', 'DIGITAL']);
});

test('Wallet DiDi real: centavos y miles exactos; medianoche y recepción tardía conservan el día de publicación', () => {
  for (const [raw, amount] of [['0.01', '0.01'], ['1,234.50', '1234.50'], ['0001.00', '1.00']]) {
    assert.equal(interpretCapture(body(`MXN${raw} con DIDI Credit Card ••0123`)).proposal.amount, amount);
  }
  for (const [postedAt, day] of [['2026-10-21T05:59:59Z', '2026-10-20'], ['2026-10-21T06:00:00Z', '2026-10-21']]) {
    const result = interpretCapture({ ...fixture.event, postedAt, receivedAt: '2026-10-22T12:00:00Z' });
    assert.equal(result.proposal.date, day); assert.equal(result.proposal.operationAt, undefined);
  }
});

test('Wallet DiDi real: estructura, marca y terminación exactas; importes inválidos o texto añadido no crean propuestas', () => {
  for (const text of ['MXN0.00 con DIDI Credit Card ••0123', 'MXN1,23.45 con DIDI Credit Card ••0123',
    'MXN10 con DIDI Credit Card ••0123', 'MXN-1.00 con DIDI Credit Card ••0123', 'MXN123.45 con DIDI Credit Card ••123',
    'MXN123.45 con DIDI Credit Card ••12345', 'MXN123.45 con DiDi Credit Card ••0123', 'MXN123.45 con OTRA TARJETA ••0123',
    '$123.45 con DIDI Credit Card ••0123', 'MXN123.45 con DIDI Credit Card ••0123\nOtro importe: 9.00']) {
    assert.equal(Object.keys(interpretCapture(body(text)).proposal).length, 0, text);
  }
});

test('Wallet DiDi real: fechas inválidas o futuras, campos ausentes y cuerpos contradictorios conservan revisión', () => {
  for (const postedAt of [null, '', 'inválida', '2026-10-21T04:00:00Z']) {
    assert.equal(Object.keys(interpretCapture({ ...fixture.event, postedAt }).proposal).length, 0);
  }
  for (const receivedAt of [null, '', 'inválida']) {
    assert.equal(Object.keys(interpretCapture({ ...fixture.event, receivedAt }).proposal).length, 0);
  }
  for (const title of ['', ' ', 'x'.repeat(201), 'COMERCIO\nOTRO']) {
    assert.equal(Object.keys(interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.title': title } }).proposal).length, 0);
  }
  for (const fields of [
    { 'android.bigText': 'MXN999.00 con DIDI Credit Card ••0123' },
    { 'android.title.big': 'OTRO COMERCIO' },
  ]) assert.equal(interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, ...fields } }).reason, 'CONFLICTING_FIELDS');
});

test('Wallet DiDi real: moneda ajena y avisos especiales no se completan; el paquete DiDi no hereda el formato Wallet', () => {
  for (const currency of ['USD', 'EUR']) assert.equal(interpretCapture(body(`${currency}123.45 con DIDI Credit Card ••0123`)).reason, 'FOREIGN_CURRENCY');
  for (const sourcePackage of ['com.didiglobal.cashloan', 'com.citibanamex.banamexmobile', 'mx.bancosantander.supermovil']) {
    assert.equal(interpretCapture({ ...fixture.event, sourcePackage }).reason, 'UNKNOWN_FORMAT');
  }
  for (const marker of ['MSI', 'devolución', 'rechazada', 'promoción', 'abono', 'preautorización']) {
    assert.equal(interpretCapture({ ...fixture.event, fields: { ...fixture.event.fields, 'android.subText': marker } }).reason, 'SPECIAL_MOVEMENT');
  }
  assert.equal(interpretCapture({ sourcePackage: 'com.didiglobal.cashloan', fields: { 'android.title': 'DiDi Cuenta', 'android.text': 'Saldo ficticio y rendimiento de prueba.' } }).reason, 'UNKNOWN_FORMAT');
});

test('Wallet: Banamex, DiDi y Santander conservan perfiles, bancos y políticas separados', () => {
  const b = interpretCapture(banamex.event), d = interpretCapture(fixture.event), s = interpretCapture(santander.event);
  assert.equal(b.parserKey, 'wallet.banamex-purchase.es.v1'); assert.equal(b.proposal.aliasSourcePackage, 'com.citibanamex.banamexmobile');
  assert.equal(d.parserKey, 'wallet.didi-purchase.es.v1'); assert.equal(d.proposal.aliasSourcePackage, 'com.didiglobal.cashloan');
  assert.equal(s.parserKey, 'wallet.santander-purchase.es.v2'); assert.equal(s.reason, 'PURCHASE');
  assert.equal(s.proposal.aliasSourcePackage, 'mx.bancosantander.supermovil');
  assert.equal(s.verified, true); assert.equal(s.proposal.dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(s.proposal.operationAt, undefined);
});
