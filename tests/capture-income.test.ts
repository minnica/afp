import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretCapture } from '../src/lib/captureParsers';
const event = (body: string, sourcePackage = 'com.bancomer.mbanking') => ({ sourcePackage, fields: { 'android.title': 'BBVA', 'android.text': body }, postedAt: '2026-10-30T11:19:00Z', receivedAt: '2026-10-30T11:20:00Z' });
test('nómina BBVA real anonimizada conserva la ausencia de importe y cuenta exacta', () => {
 const p = interpretCapture(event('Abono de nomina a TDD 0123 30 octubre 04:26h '));
 assert.equal(p.reason, 'INCOME_AMOUNT_REQUIRED'); assert.equal(p.parserKey, 'bbva.payroll.es.v1'); assert.equal(p.proposal.amount, undefined); assert.equal(p.proposal.accountSuffix, '0123'); assert.equal(p.proposal.currency, undefined);
});
test('candidato de depósito conserva importe y exige regla propia, sin declararse verificado', () => {
 const p = interpretCapture(event('Tienes un abono a tu cuenta *00123 de $1,234.50'));
 assert.equal(p.reason, 'INCOME_POLICY_REQUIRED'); assert.equal(p.proposal.amount, '1234.50'); assert.equal(p.proposal.accountSuffix, '00123'); assert.equal(p.verified, false);
});
for (const [label, body, source] of [
 ['fecha inválida', 'Abono de nomina a TDD 0123 31 septiembre 04:26h ', 'com.bancomer.mbanking'],
 ['hora inválida', 'Abono de nomina a TDD 0123 30 octubre 28:26h ', 'com.bancomer.mbanking'],
 ['compra', 'COMPRA TDC EN COMERCIO $1,234.50 30 octubre 10:42h', 'com.bancomer.mbanking'],
 ['promoción', 'Recibe tu nómina y gana $500.00', 'com.bancomer.mbanking'],
 ['otro banco', 'Abono de nomina a TDD 0123 30 octubre 04:26h ', 'com.nu.production'],
 ['rechazo', 'Abono a tu cuenta *0123 de $1,234.50 rechazado', 'com.bancomer.mbanking'],
 ['precisión', 'Abono a tu cuenta *0123 de $1,234.501', 'com.bancomer.mbanking'],
] as const) test(`ingresos no acepta ${label}`, () => { const p = interpretCapture(event(body, source)); assert.notEqual(p.reason, 'INCOME_POLICY_REQUIRED'); assert.notEqual(p.reason, 'INCOME_AMOUNT_REQUIRED'); });
test('no elige importe entre campos contradictorios', () => {
 const e = event('Abono a tu cuenta *0123 de $100.00');
 assert.equal(interpretCapture({ ...e, fields: { ...e.fields, 'android.bigText': 'Abono a tu cuenta *0123 de $200.00' } }).reason, 'CONFLICTING_FIELDS');
});
