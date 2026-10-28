import { present,sparseCalculations,uncheckedFixture } from './helpers/financial-fixtures';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import bank from './fixtures/captures/santander-card-purchase.es.v1.json';
import wallet from './fixtures/captures/wallet-santander-purchase.es.v1.json';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const { interpretCapture, captureParsers } = sparseCalculations(sourceLoader()('src/lib/captureParsers.ts'));
const changeBank = (from: string, to: string) => ({ ...bank.event, fields: Object.fromEntries(Object.entries(bank.event.fields).map(([key, value]) => [key, value.replaceAll(from, to)])) });

test('Santander real: compra MXN con fecha bancaria México, comercio y terminación física/digital', () => {
  const parsed = interpretCapture(bank.event);
  assert.equal(parsed.parserKey, 'santander.card-purchase.es.v1');
  assert.equal(parsed.verified, true); assert.equal(parsed.reason, 'PURCHASE');
  assert.equal(parsed.proposal.amount, '123.45'); assert.equal(parsed.proposal.currency, 'MXN');
  assert.equal(parsed.proposal.merchant, 'COMERCIO FICTICIO');
  assert.equal(parsed.proposal.date, '2026-10-20'); assert.equal(parsed.proposal.operationAt, '2026-10-20T20:49:02.000Z');
  assert.equal(parsed.proposal.dateSource, 'BANK_OPERATION'); assert.equal(parsed.proposal.timeZone, 'America/Mexico_City');
  assert.equal(present(parsed.proposal.printedAlias).value, '0123'); assert.equal(present(parsed.proposal.printedAlias).digits, 4);
  assert.equal(parsed.proposal.aliasSourcePackage, bank.event.sourcePackage); assert.equal(parsed.proposal.reference, null);
  for (const key of ['cardId', 'alias', 'notificationAt'] as const) assert.equal(parsed.proposal[key], undefined);
  const parser = captureParsers.find(p => p.key === parsed.parserKey);
  assert.deepEqual(Array.from(present(present(parser).aliasKinds)), ['PHYSICAL', 'DIGITAL']);
});

test('Santander real: centavos, miles y fecha bancaria distinta del día de recepción', () => {
  for (const [raw, amount] of [['0.01', '0.01'], ['1,234.50', '1234.50'], ['0001.00', '1.00']] as const) {
    assert.equal(interpretCapture(changeBank('123.45', raw)).proposal.amount, amount);
  }
  const delayed = { ...bank.event, postedAt: '2026-10-22T01:00:00Z', receivedAt: '2026-10-22T01:00:01Z' };
  assert.equal(interpretCapture(delayed).proposal.date, '2026-10-20');
  assert.equal(interpretCapture(changeBank('14:49:02', '00:00:00')).proposal.operationAt, '2026-10-20T06:00:00.000Z');
});

test('Santander real: incompletos, importes inválidos, calendarios imposibles y fechas futuras no registran', () => {
  for (const [from, to] of [['123.45', '0.00'], ['123.45', '1,23.45'], ['123.45', '10'], ['123.45', '-1.00'],
    ['20/10/2026', '31/02/2026'], ['14:49:02', '24:00:00'], ['20/10/2026', '21/10/2026'],
    ['**0123', '**123'], ['**0123', '**12345'], ['$$', '$'], ['MXN', '$'], ['credito', 'debito'],
    ['Compra con tarjeta', 'Aviso de tarjeta'], ['COMERCIO FICTICIO', ''], ['hrs.', 'hrs. Otro importe 50.00']] as const) {
    assert.notEqual(interpretCapture(changeBank(from, to)).reason, 'PURCHASE', `${from} → ${to}`);
  }
  for (const receivedAt of ['invalida', null, undefined] as const) {
    assert.notEqual(uncheckedFixture(interpretCapture, { ...bank.event, receivedAt }).reason, 'PURCHASE');
  }
  assert.equal(interpretCapture(changeBank('20/10/2026', '21/10/2026')).reason, 'FUTURE_OPERATION');
});

test('Santander real: títulos y cuerpos contradictorios no eligen datos; otra moneda queda por revisar', () => {
  for (const fields of [
    { 'android.bigText': bank.event.fields['android.bigText'].replace('123.45', '999.00') },
    { 'android.title.big': 'Otro tipo de movimiento' },
  ] as const) assert.equal(interpretCapture({ ...bank.event, fields: { ...bank.event.fields, ...fields } }).reason, 'CONFLICTING_FIELDS');
  for (const currency of ['USD', 'EUR'] as const) assert.equal(interpretCapture(changeBank('MXN', currency)).reason, 'FOREIGN_CURRENCY');
  for (const sourcePackage of ['com.bancomer.mbanking', wallet.event.sourcePackage, 'com.citibanamex.banamexmobile'] as const) {
    assert.equal(interpretCapture({ ...bank.event, sourcePackage }).reason, 'UNKNOWN_FORMAT');
  }
  for (const marker of ['MSI', 'devolución', 'preautorización', 'rechazada', 'cancelación'] as const) {
    assert.equal(interpretCapture({ ...bank.event, fields: { ...bank.event.fields, 'android.subText': marker } }).reason, 'SPECIAL_MOVEMENT');
  }
});

test('Wallet Santander v2: propone fecha del aviso México con alias bancario, sin fecha bancaria inventada', () => {
  const parsed = interpretCapture(wallet.event);
  assert.equal(parsed.parserKey, 'wallet.santander-purchase.es.v2');
  assert.equal(parsed.reason, 'PURCHASE'); assert.equal(parsed.verified, true);
  assert.equal(parsed.proposal.amount, '123.45'); assert.equal(parsed.proposal.currency, 'MXN');
  assert.equal(parsed.proposal.merchant, 'COMERCIO FICTICIO'); assert.equal(present(parsed.proposal.printedAlias).value, '0123');
  assert.equal(parsed.proposal.aliasSourcePackage, bank.event.sourcePackage); assert.equal(parsed.proposal.evidenceOnly, undefined);
  assert.equal(parsed.proposal.notificationAt, wallet.event.postedAt);
  assert.equal(parsed.proposal.date, '2026-10-20'); assert.equal(parsed.proposal.dateSource, 'NOTIFICATION_POSTED_AT');
  assert.equal(parsed.proposal.reference, null);
  for (const key of ['operationAt', 'cardId', 'alias'] as const) assert.equal(parsed.proposal[key], undefined);
  const parser = captureParsers.find(p => p.key === parsed.parserKey);
  assert.equal(present(parser).verified, true); assert.equal(present(parser).nonBlockingInObservation, true);
  assert.equal(present(parser).dateSource, 'NOTIFICATION_POSTED_AT');
  const legacy = captureParsers.find(p => p.key === 'wallet.santander-purchase.es.v1');
  assert.equal(present(legacy).verified, false); assert.equal(present(legacy).evidenceOnly, true);
});

test('Wallet Santander v2: la publicación define el día México incluso con entrega tardía o cambio UTC de día', () => {
  const event = { ...wallet.event, postedAt: '2026-10-21T00:49:07Z', receivedAt: '2026-10-22T02:00:00Z' };
  const p = interpretCapture(event).proposal;
  assert.equal(p.date, '2026-10-20'); assert.equal(p.notificationAt, new Date(event.postedAt).toISOString());
  assert.equal(p.timeZone, 'America/Mexico_City'); assert.equal(p.operationAt, undefined);
  assert.equal(interpretCapture(bank.event).proposal.dateSource, 'BANK_OPERATION');
});

test('Wallet Santander real: otra tarjeta, moneda, estructura, fecha o contenido contradictorio conserva revisión', () => {
  for (const body of ['MXN0.00 con Santander LikeU ••0123', 'MXN1,23.45 con Santander LikeU ••0123',
    'MXN123.45 con Santander LikeU ••123', 'MXN123.45 con Santander OTRA ••0123', 'MXN123.45 con Santander LikeU ••0123\nOtro cargo'] as const) {
    const parsed = interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields, 'android.text': body } });
    assert.equal(Object.keys(parsed.proposal).length, 0);
  }
  for (const postedAt of [null, '', 'fecha inválida', '2026-10-21T03:00:00Z'] as const) {
    assert.equal(Object.keys(uncheckedFixture(interpretCapture, { ...wallet.event, postedAt }).proposal).length, 0);
  }
  for (const currency of ['USD', 'EUR'] as const) assert.equal(interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields,
    'android.text': wallet.event.fields['android.text'].replace('MXN', currency) } }).reason, 'FOREIGN_CURRENCY');
  assert.equal(interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields, 'android.bigText': 'Otro contenido' } }).reason, 'UNKNOWN_FORMAT');
  assert.equal(interpretCapture({ ...wallet.event, fields: { ...wallet.event.fields,
    'android.bigText': wallet.event.fields['android.text'].replace('123.45', '999.00') } }).reason, 'CONFLICTING_FIELDS');
  assert.equal(interpretCapture({ ...wallet.event, sourcePackage: bank.event.sourcePackage }).reason, 'UNKNOWN_FORMAT');
});
