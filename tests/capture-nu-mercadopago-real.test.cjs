const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const wallet = require('./fixtures/captures/wallet-nu-purchase.es.v1.json');
const bank = require('./fixtures/captures/nu-card-purchase.es.v1.json');
const mp = require('./fixtures/captures/mercadopago-card-purchase.es.v1.json');
const load = sourceLoader(), { interpretCapture, captureParsers } = load('src/lib/captureParsers.js');
const change = (fixture, fields) => ({ ...fixture.event, fields: { ...fixture.event.fields, ...fields } });
const mpAmount = value => change(mp, { 'android.title': `Compra por $ ${value} fue aprobada`, 'android.title.big': `Compra por $ ${value} fue aprobada` });

test('Nu Wallet conserva MXN, alias bancario y día de publicación México; token NFC separado', () => {
  const r = interpretCapture(wallet.event), p = r.proposal;
  assert.equal(r.reason, 'PURCHASE'); assert.equal(r.parserKey, 'wallet.nu-purchase.es.v1'); assert.equal(r.verified, true);
  assert.equal(p.amount, '123.45'); assert.equal(p.currency, 'MXN'); assert.equal(p.merchant, 'COMERCIO FICTICIO');
  assert.equal(p.printedAlias.value, '0123'); assert.equal(p.aliasSourcePackage, bank.event.sourcePackage);
  assert.equal(p.date, '2026-10-20'); assert.equal(p.dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(p.operationAt, undefined);
  assert.equal(p.cardId, undefined); assert.equal(p.completionPolicy, undefined);
  assert.equal(interpretCapture(change(wallet, { 'android.text': 'USD123.45 con Nu Mastercard Gold ••0123' })).reason, 'FOREIGN_CURRENCY');
});

test('Nu Wallet exige producto y estructura observados, importes válidos y campos coherentes', () => {
  for (const text of ['MXN123.45 con Nu ••0123', 'MXN0.00 con Nu Mastercard Gold ••0123',
    'MXN123.45 con Nu Mastercard Gold ••123', 'MXN1,23.45 con Nu Mastercard Gold ••0123',
    'MXN123.45 con Nu Mastercard Gold ••0123\nOtro cargo']) assert.equal(Object.keys(interpretCapture(change(wallet, { 'android.text': text })).proposal).length, 0);
  assert.equal(interpretCapture(change(wallet, { 'android.bigText': 'MXN9.99 con Nu Mastercard Gold ••0123' })).reason, 'CONFLICTING_FIELDS');
  assert.equal(interpretCapture({ ...wallet.event, postedAt: 'invalid' }).reason, 'INVALID_FIELDS');
  assert.equal(interpretCapture({ ...wallet.event, postedAt: '2026-10-21T06:00:00Z', receivedAt: '2026-10-21T06:00:01Z' }).proposal.date, '2026-10-21');
});

test('Nu banco queda como evidencia parcial; título y cuerpo deben coincidir en importe', () => {
  const r = interpretCapture(bank.event), p = r.proposal;
  assert.equal(r.reason, 'INCOMPLETE_FORMAT'); assert.equal(r.verified, false); assert.equal(r.parserKey, 'nu.card-purchase.es.v1');
  assert.equal(p.amount, '123.45'); assert.equal(p.printedAlias.value, '0123'); assert.equal(p.evidenceOnly, true);
  assert.equal(p.currency, undefined); assert.equal(p.date, undefined); assert.equal(p.operationAt, undefined);
  assert.deepEqual(Array.from(p.missingFields), ['currency', 'operationDate']);
  assert.equal(captureParsers.find(x => x.key === r.parserKey).evidenceOnly, true);
  assert.equal(interpretCapture(change(bank, { 'android.title': 'Compra aprobada por $9.99' })).reason, 'CONFLICTING_FIELDS');
  assert.equal(interpretCapture(change(bank, { 'android.bigText': 'Otra compra' })).reason, 'CONFLICTING_FIELDS');
});

test('Mercado Pago solo obtiene importe y comercio del aviso; no supone moneda ni tarjeta sin regla', () => {
  const r = interpretCapture(mp.event), p = r.proposal;
  assert.equal(r.parserKey, 'mercadopago.card-purchase.es.v1'); assert.equal(r.reason, 'FORMAT_POLICY_REQUIRED'); assert.equal(r.verified, false);
  assert.equal(p.amount, '123.00'); assert.equal(p.merchant, 'COMERCIO FICTICIO');
  for (const k of ['cardId', 'currency', 'date', 'operationAt', 'reference', 'subscriptionId']) assert.equal(p[k], undefined);
  for (const [raw, expected] of [['0.01', '0.01'], ['1,234', '1234.00'], ['1,234.56', '1234.56']]) assert.equal(interpretCapture(mpAmount(raw)).proposal.amount, expected);
  for (const raw of ['0', '0.00', '1.5', '1,23', '1.234', '-123', '123abc']) assert.notEqual(interpretCapture(mpAmount(raw)).reason, 'FORMAT_POLICY_REQUIRED');
});

test('Mercado Pago rechaza moneda contradictoria, revisiones, pagos y estructura desconocida', () => {
  assert.equal(interpretCapture(change(mp, { 'android.subText': 'USD' })).reason, 'FOREIGN_CURRENCY');
  assert.equal(interpretCapture(change(mp, { 'android.title.big': 'Compra por $ 999 fue aprobada' })).reason, 'CONFLICTING_FIELDS');
  assert.equal(interpretCapture(change(mp, { 'android.bigText': 'Otro comercio' })).reason, 'CONFLICTING_FIELDS');
  for (const word of ['rechazada', 'cancelación', 'reembolso', 'meses sin intereses']) assert.notEqual(interpretCapture(change(mp, { 'android.subText': word })).reason, 'FORMAT_POLICY_REQUIRED');
  assert.equal(interpretCapture({ ...mp.event, sourcePackage: 'com.bancomer.mbanking' }).reason, 'UNKNOWN_FORMAT');
  assert.equal(interpretCapture(change(mp, { 'android.text': 'Ve tu compra aquí.', 'android.bigText': 'Ve tu compra aquí.' })).reason, 'INCOMPLETE_FORMAT');
});

test('las reglas Nu/CFE y Mercado Pago requieren aceptaciones independientes; solo CFE exige suscripción', () => {
  const { matchesCapturePolicy } = load('src/lib/captureFormatPolicy.js');
  const parser = captureParsers.find(p => p.key === 'mercadopago.card-purchase.es.v1');
  const policy = { parserKey: parser.key, completionPolicy: parser.completionPolicy, cardId: 'own-card', datePolicy: 'NOTIFICATION_POSTED_AT', policyAcceptedAt: new Date('2026-10-20T12:00:00Z'), policySubscriptionId: null };
  assert.equal(matchesCapturePolicy(policy, parser), true);
  for (const changes of [{ policyAcceptedAt: null }, { datePolicy: 'BANK_OPERATION' }, { completionPolicy: 'NU_CFE_MXN' }, { policySubscriptionId: 'unexpected' }]) assert.equal(matchesCapturePolicy({ ...policy, ...changes }, parser), false);
  const proposal = { cardId: policy.cardId, completionPolicy: policy.completionPolicy, policyAcceptedAt: policy.policyAcceptedAt.toISOString(), cardSource: 'OWNER_FORMAT_POLICY', currencySource: 'OWNER_FORMAT_POLICY' };
  assert.equal(matchesCapturePolicy(policy, parser, proposal), true);
  assert.equal(matchesCapturePolicy(policy, parser, { ...proposal, policyAcceptedAt: '2026-10-19T12:00:00Z' }), false);
  const cfe = captureParsers.find(p => p.key === 'nu.cfe-service-payment.es.v2');
  const cfePolicy = { ...policy, parserKey: cfe.key, completionPolicy: cfe.completionPolicy };
  assert.equal(matchesCapturePolicy(cfePolicy, cfe), false);
  assert.equal(matchesCapturePolicy({ ...cfePolicy, policySubscriptionId: 'own-subscription' }, cfe), true);
});
