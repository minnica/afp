import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretCapture } from '../src/lib/captureParsers';
import type { CaptureNotice } from '../src/lib/captureTypes';

const body = 'Compra con TDD 0123 en MERPAGO*TIENDA FICTICIA $67.89 25 octubre 23:41h';
const notice = (text = body, extra: Record<string, string> = {}): CaptureNotice => ({
  sourcePackage: 'com.bancomer.mbanking', postedAt: '2026-10-26T05:41:30Z', receivedAt: '2026-10-26T05:41:31Z',
  fields: { 'android.title': 'Compra con TDD', 'android.text': text, ...extra },
});

test('TDD: extrae comercio, centavos, terminación y hora bancaria sin convertirlo en crédito', () => {
  for (const merchant of ['MERPAGO*TIENDA FICTICIA', 'CAFÉ FICTICIO', 'NEGOCIO QA 123']) {
    const p = interpretCapture(notice(body.replace('MERPAGO*TIENDA FICTICIA', merchant)));
    assert.equal(p.parserKey, 'bbva.debit-purchase.es.v1'); assert.equal(p.reason, 'ACCOUNT_DEBIT_REVIEW');
    assert.equal(p.proposal.amount, '67.89'); assert.equal(p.proposal.accountSuffix, '0123'); assert.equal(p.proposal.merchant, merchant);
    assert.equal(p.proposal.date, '2026-10-25'); assert.equal(p.proposal.operationAt, '2026-10-26T05:41:00.000Z');
    assert.equal(p.proposal.paymentEvidence, 'DEBIT_PURCHASE'); assert.equal(p.proposal.dateSource, 'BANK_OPERATION');
    assert.equal(p.proposal.cardId, undefined); assert.equal(p.proposal.currency, undefined);
  }
});

test('TDD: conserva el día bancario con entrega tardía y completa el año al cruzar diciembre', () => {
  const late = interpretCapture({ ...notice(), postedAt: '2026-10-26T06:05:00Z', receivedAt: '2026-10-26T06:05:01Z' });
  assert.equal(late.proposal.date, '2026-10-25');
  const year = interpretCapture({ ...notice(body.replace('25 octubre', '31 diciembre')), postedAt: '2027-01-01T06:05:00Z', receivedAt: '2027-01-01T06:05:01Z' });
  assert.equal(year.proposal.date, '2026-12-31'); assert.equal(year.proposal.operationAt, '2027-01-01T05:41:00.000Z');
});

test('TDD: calendario, hora, importe, contradicciones, moneda y avisos especiales conservan revisión', () => {
  for (const text of [body.replace('25 octubre', '31 febrero'), body.replace('23:41', '25:41'), body.replace('23:41', '23:61'),
    body.replace('67.89', '67.891'), body.replace('67.89', '0.00'), body.replace('67.89', '1,23.45'), body.replace('25 octubre', '20 octubre'),
    body + ' $10.00', body.replace('0123', '12345'), body.replace('TDD', 'TDC'), body.replace('23:41h', '23:41')]) {
    assert.notEqual(interpretCapture(notice(text)).reason, 'ACCOUNT_DEBIT_REVIEW', text);
  }
  const extras: Record<string, string>[] = [{ 'android.bigText': body.replace('67.89', '12.34') }, { 'android.title.big': 'Otro título' },
    { 'android.subText': 'USD' }, { 'android.subText': 'CNY' }, { 'android.subText': '€' }, { 'android.subText': 'Compra rechazada' }, { 'android.subText': 'Devolución' }];
  for (const extra of extras) {
    assert.notEqual(interpretCapture(notice(body, extra)).reason, 'ACCOUNT_DEBIT_REVIEW');
  }
  assert.equal(interpretCapture(notice(body.replace('23:41', '23:59'))).reason, 'FUTURE_OPERATION');
  assert.notEqual(interpretCapture({ ...notice(), sourcePackage: 'com.nu.production' }).reason, 'ACCOUNT_DEBIT_REVIEW');
  assert.notEqual(interpretCapture({ ...notice(), receivedAt: 'invalid' }).reason, 'ACCOUNT_DEBIT_REVIEW');
});

test('TDD: el descriptor revisado de pago de tarjeta conserva su interpretación anterior', () => {
  const row = interpretCapture(notice(body.replace('MERPAGO*TIENDA FICTICIA', 'MERPAGO*TARJETADE')));
  assert.equal(row.parserKey, 'bbva.debit-card-charge.es.v1'); assert.equal(row.reason, 'ACCOUNT_DEBIT_REVIEW');
  assert.equal(row.proposal.paymentEvidence, 'SOURCE_DEBIT_ONLY'); assert.equal(row.proposal.cardId, undefined);
});
