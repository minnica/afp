import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCapture } from '../src/lib/captureParsers';
const event = (body: string) => ({ sourcePackage: 'com.bancomer.mbanking', fields: { 'android.title': 'Aviso de cargo en tu cuenta', 'android.text': body }, postedAt: '2026-10-31T06:00:26Z', receivedAt: '2026-10-31T06:00:27Z' });
const charge = 'Tienes un cargo a tu cuenta *0123 de $120.00. Esta información te ayuda a tener control en tus finanzas. Abre para más detalles.';
test('cargo BBVA conserva fecha bancaria cuando llega después de medianoche', () => {
 const p = interpretCapture(event(`${charge} 30 de octubre de 2026, 23:52 h`));
 assert.equal(p.reason, 'ACCOUNT_DEBIT_REVIEW'); assert.equal(p.proposal.date, '2026-10-30'); assert.equal(p.proposal.dateSource, 'BANK_OPERATION'); assert.equal(p.proposal.operationAt, '2026-10-31T05:52:00.000Z'); assert.equal(p.proposal.notificationAt, '2026-10-31T06:00:26.000Z'); assert.ok(!p.proposal.missingFields?.includes('operationDate'));
});
test('cargo sin reloj bancario conserva publicación México como respaldo', () => {
 const p = interpretCapture(event('Cargo a tu cuenta *0123 de $120.00'));
 assert.equal(p.proposal.date, '2026-10-31'); assert.equal(p.proposal.dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(p.proposal.operationAt, undefined);
});
for (const printed of ['31 de septiembre de 2026, 23:52 h', '30 de octubre de 2026, 25:52 h', '30 de mesinventado de 2026, 23:52 h', '1 de noviembre de 2026, 23:52 h']) test(`fecha bancaria inválida o futura no automatiza: ${printed}`, () => { assert.notEqual(interpretCapture(event(`${charge} ${printed}`)).reason, 'ACCOUNT_DEBIT_REVIEW'); });
test('la evidencia bancaria original conserva la hora de verano histórica de México', () => {
 const p = interpretCapture({ ...event(`${charge} 1 de julio de 2020, 23:52 h`), postedAt: '2020-07-02T05:00:00Z', receivedAt: '2020-07-02T05:01:00Z' });
 assert.equal(p.proposal.operationAt, '2020-07-02T04:52:00.000Z');
});
