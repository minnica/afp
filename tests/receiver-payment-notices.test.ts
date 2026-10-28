import jsonFixture0 from './fixtures/captures/banamex-card-payment.es.v1.json';
import jsonFixture2 from './fixtures/captures/bbva-debit-card-charge.es.v1.json';
import jsonFixture1 from './fixtures/captures/mercadopago-card-payment.es.v1.json';
import { present,sparseCalculations } from './helpers/financial-fixtures';
import type { NoticeSample } from './helpers/integration-fixtures';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const banamex = jsonFixture0.event;
const mercado = jsonFixture1.event;
const debit = jsonFixture2.event;
const { interpretCapture, captureParsers } = sparseCalculations(sourceLoader()('src/lib/captureParsers.ts'));
const change = (event: NoticeSample['event'], before: string, after: string) => ({ ...event, fields: Object.fromEntries(Object.entries(event.fields).map(([k,v]) => [k,v.replaceAll(before,after)])) });

test('Banamex: pago SPEI real, medianoche 00 AM, tres cifras y fecha bancaria; no inventa moneda o corte', () => {
 const result = interpretCapture(banamex), p = result.proposal;
 assert.equal(result.reason, 'PAYMENT_REVIEW'); assert.equal(result.verified, true);
 assert.equal(p.amount, '123.45'); assert.equal(p.date, '2026-10-23'); assert.equal(p.operationAt, '2026-10-23T06:10:00.000Z');
 assert.equal(p.dateSource, 'BANK_OPERATION'); assert.equal(present(p.printedAlias).value, '123'); assert.equal(present(p.printedAlias).digits, 3);
 assert.equal(p.bankReference, '001234'); assert.equal(p.bankAuthorization, '654321');
 for(const key of ['currency','cardId','statementMonth','reference'] as const) assert.equal(p[key], undefined);
 assert.equal(interpretCapture(change(banamex, '00:10:00 AM', '12:10:00 AM')).proposal.operationAt, p.operationAt);
 const afternoon = { ...change(banamex, '00:10:00 AM', '01:10:00 PM'), receivedAt:'2026-10-23T19:10:01Z' };
 assert.equal(interpretCapture(afternoon).proposal.operationAt, '2026-10-23T19:10:00.000Z');
});

test('Banamex: fechas imposibles, hora contradictoria, importe inválido y operación futura conservan revisión', () => {
 for (const [a,b] of [['23/10/26','31/02/26'],['00:10:00 AM','00:10:00 PM'],['00:10:00 AM','13:10:00 AM'],['00:10:00 AM','00:60:00 AM'],['123.45','0.00'],['123.45','1,23.45']] as const) {
  assert.equal(interpretCapture(change(banamex,a,b)).reason, 'INVALID_FIELDS', b);
 }
 assert.equal(interpretCapture(change(banamex,'23/10/26','24/10/26')).reason, 'FUTURE_OPERATION');
 assert.equal(interpretCapture({ ...banamex, receivedAt:'invalid' }).reason, 'INVALID_FIELDS');
 assert.equal(interpretCapture(change(banamex,'001234','123')).reason, 'INCOMPLETE_FORMAT');
});

test('Mercado Pago: pago total recibido con fecha de publicación México, sin inventar tarjeta ni fecha bancaria', () => {
 const result = interpretCapture(mercado), p = result.proposal;
 assert.equal(result.reason, 'PAYMENT_REVIEW'); assert.equal(p.amount, '67.89'); assert.equal(p.paymentCoverage,'FULL');
 assert.equal(p.date,'2026-10-23'); assert.equal(p.dateSource,'NOTIFICATION_POSTED_AT');
 for(const key of ['currency','cardId','operationAt','statementMonth'] as const) assert.equal(p[key],undefined);
 const midnight = { ...mercado, postedAt:'2026-10-23T05:59:00Z', receivedAt:'2026-10-23T06:01:00Z' };
 assert.equal(interpretCapture(midnight).proposal.date,'2026-10-22');
 for (const [a,b] of [['67.89','0.00'],['67.89','67.8'],['¡Cubriste el total y liberaste límite!','Pago pendiente de aplicación']] as const) {
  assert.equal(interpretCapture(change(mercado,a,b)).reason,'INCOMPLETE_FORMAT');
 }
 assert.equal(interpretCapture({...mercado, postedAt:'invalid'}).reason,'INCOMPLETE_FORMAT');
});

test('pagos receptores: otro paquete, campos contradictorios, cancelaciones y otros productos no acreditan abonos', () => {
 for(const event of [banamex,mercado] as const) {
  assert.equal(interpretCapture({...event,sourcePackage:'com.nu.production'}).reason,'UNKNOWN_FORMAT');
  assert.equal(interpretCapture({...event,fields:{...event.fields,'android.bigText':'Otro movimiento'}}).reason,'CONFLICTING_FIELDS');
  assert.equal(interpretCapture({...event,fields:{...event.fields,'android.title.big':'Otro título'}}).reason,'CONFLICTING_FIELDS');
  assert.equal(interpretCapture({...event,fields:{...event.fields,'android.subText':'cancelación'}}).reason,'SPECIAL_MOVEMENT');
 }
 assert.notEqual(interpretCapture(change(banamex,'JOY BANAMEX','CUENTA BANAMEX')).reason,'PAYMENT_REVIEW');
 assert.notEqual(interpretCapture(change(mercado,'a tu tarjeta de crédito','a tu préstamo')).reason,'PAYMENT_REVIEW');
});

test('BBVA TDD: solo salida de dinero; no identifica crédito ni habilita un segundo abono', () => {
 const result = interpretCapture(debit);
 assert.equal(result.reason,'ACCOUNT_DEBIT_REVIEW'); assert.equal(result.proposal.amount,'67.89');
 assert.equal(result.proposal.movementType,'ACCOUNT_DEBIT'); assert.equal(result.proposal.paymentEvidence,'SOURCE_DEBIT_ONLY');
 assert.equal(result.proposal.cardId,undefined); assert.equal(result.proposal.alias,undefined);
 assert.equal(interpretCapture({...debit,fields:{...debit.fields,'android.bigText':'Otro texto'}}).reason,'CONFLICTING_FIELDS');
});

test('formatos receptores y débito permanecen fuera de la automatización de compras', () => {
 for(const key of ['banamex.card-payment.es.v1','mercadopago.card-payment.es.v1','bbva.debit-card-charge.es.v1'] as const) {
  assert.equal(present(captureParsers.find(p=>p.key===key)).paymentOnly,true);
 }
});
