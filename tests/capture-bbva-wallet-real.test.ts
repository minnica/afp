import { present,sparseCalculations,uncheckedFixture } from './helpers/financial-fixtures';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixture from './fixtures/captures/wallet-bbva-purchase.es.v1.json';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const { interpretCapture, captureParsers } = sparseCalculations(sourceLoader()('src/lib/captureParsers.ts'));
const change = (fields: { 'android.text': string; } | { 'android.bigText': string; } | { 'android.title.big': string; } | { 'android.subText': string; }) => ({ ...fixture.event, fields: { ...fixture.event.fields, ...fields } });

test('BBVA Wallet: TDC Platinum conserva MXN, descriptor, alias bancario y fecha del aviso México', () => {
  const r = interpretCapture(fixture.event), p = r.proposal;
  assert.equal(r.parserKey, 'wallet.bbva-purchase.es.v1'); assert.equal(r.reason, 'PURCHASE'); assert.equal(r.verified, true);
  assert.equal(p.amount, '123.45'); assert.equal(p.currency, 'MXN'); assert.equal(p.merchant, 'COMERCIO FICTICIO   SUCURSAL');
  assert.equal(present(p.printedAlias).value, '0123'); assert.equal(present(p.printedAlias).digits, 4); assert.equal(p.aliasSourcePackage, 'com.bancomer.mbanking');
  assert.equal(p.date, '2026-10-20'); assert.equal(p.dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(p.timeZone, 'America/Mexico_City');
  assert.equal(p.notificationAt, fixture.event.postedAt); assert.equal(p.operationAt, undefined); assert.equal(p.cardId, undefined); assert.equal(p.reference, null);
  const parser = captureParsers.find(x => x.key === r.parserKey);
  assert.equal(present(parser).rejectCrossBankAliasCollision, true); assert.deepEqual(Array.from(present(present(parser).aliasKinds)), ['PHYSICAL','DIGITAL']);
});

test('BBVA Wallet: envío tardío no sustituye el día de publicación por el de recepción', () => {
  const r = interpretCapture({ ...fixture.event, receivedAt: '2026-10-23T03:00:00Z' });
  assert.equal(r.proposal.date, '2026-10-20'); assert.equal(r.proposal.notificationAt, fixture.event.postedAt);
  const midnight = interpretCapture({ ...fixture.event, postedAt: '2026-10-21T05:59:59Z', receivedAt: '2026-10-21T06:20:00Z' });
  assert.equal(midnight.proposal.date, '2026-10-20'); assert.equal(midnight.proposal.operationAt, undefined);
});

test('BBVA Wallet: separadores estrictos, centavos y límites sin redondeos', () => {
  for (const [raw, expected] of [['0.01','0.01'],['1,234.56','1234.56'],['0001.00','1.00']] as const) {
    assert.equal(interpretCapture(change({'android.text':fixture.event.fields['android.text'].replace('123.45',raw)})).proposal.amount,expected);
  }
  for (const raw of ['0.00','-1.00','123','1,23.45','1.234,56','99999999999.99'] as const) {
    assert.notEqual(interpretCapture(change({'android.text':fixture.event.fields['android.text'].replace('123.45',raw)})).reason,'PURCHASE');
  }
});

test('BBVA Wallet: fecha, moneda y campos contradictorios requieren revisión', () => {
  for(const postedAt of [null,'','invalida','2026-10-22T06:00:00Z'] as const) assert.notEqual(uncheckedFixture(interpretCapture, {...fixture.event,postedAt}).reason,'PURCHASE');
  for(const currency of ['USD','EUR'] as const) assert.equal(interpretCapture(change({'android.text':fixture.event.fields['android.text'].replace('MXN',currency)})).reason,'FOREIGN_CURRENCY');
  assert.equal(interpretCapture(change({'android.bigText':fixture.event.fields['android.text'].replace('123.45','999.99')})).reason,'CONFLICTING_FIELDS');
  assert.equal(interpretCapture(change({'android.title.big':'Otro comercio ficticio'})).reason,'CONFLICTING_FIELDS');
  for(const marker of ['MSI','rechazada','cancelación','devolución','preautorización'] as const) assert.equal(interpretCapture(change({'android.subText':marker})).reason,'SPECIAL_MOVEMENT');
});

test('BBVA Wallet: no amplía otros productos, fuentes o estructuras sin muestra', () => {
  for(const body of ['MXN123.45 con TDC Oro ••0123','MXN123.45 con BBVA Platinum ••0123','MXN123.45 con TDC Platinum ••123',
    'MXN123.45 con TDC Platinum ••01234','MXN123.45 con TDC Platinum ••0123 NUEVO FORMATO'] as const) assert.notEqual(interpretCapture(change({'android.text':body})).reason,'PURCHASE');
  for(const sourcePackage of ['com.bancomer.mbanking','com.nu.production','mx.bancosantander.supermovil'] as const) assert.equal(interpretCapture({...fixture.event,sourcePackage}).reason,'UNKNOWN_FORMAT');
  assert.equal(present(captureParsers.find(p=>p.key==='bbva.purchase.es.v1')).verified,false);
});
