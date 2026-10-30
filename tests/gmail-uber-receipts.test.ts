import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixture from './fixtures/captures/gmail-uber-receipt.es.v1.json';
import { financialLoader } from './helpers/financial-fixtures';

const load = financialLoader({ 'next/server': { NextResponse: {} } });
const { interpretCapture } = load('src/lib/captureParsers.ts');
const { validateCaptureEvent } = load('src/lib/captureProtocol.ts');
const body = fixture.event.fields['android.bigText'];
const input = (text = body) => ({ ...fixture.event, fields: { ...fixture.event.fields, 'android.bigText': text } });

test('recibo Gmail: fecha del viaje, total MXN y terminación bancaria; no fecha de publicación ni nombre editable', () => {
  const result = interpretCapture(validateCaptureEvent(input()));
  assert.equal(result.reason, 'PURCHASE');
  assert.equal(result.proposal.date, '2026-10-14');
  assert.equal(result.proposal.dateSource, 'RECEIPT_OPERATION');
  assert.equal(result.proposal.operationAt, '2026-10-15T00:21:00.000Z');
  assert.equal(result.proposal.amount, '160.25');
  assert.equal(result.proposal.printedAlias?.value, '0123');
  assert.equal(result.proposal.cardId, undefined);
});

test('recibo Gmail: el total actualizado ya contiene propina; no suma total y pagos de nuevo', () => {
  const updated = body.replace('Gracias por usar Uber', 'Gracias por el monto extra')
    .replace('Total\nMXN 160.25', 'Total\nMXN 180.25')
    .replace('Pagos\n', 'Monto propina\nMXN 20.00\nPagos\n') + '\nVisa ••••0123 (Nombre editable)\nMXN 20.00';
  const result = interpretCapture(validateCaptureEvent(input(updated)));
  assert.equal(result.reason, 'PURCHASE');
  assert.equal(result.proposal.amount, '180.25');
  assert.equal(result.proposal.uberReceipt?.tipAmount, '20.00');
  assert.equal(result.proposal.uberReceipt?.updated, true);
});

test('recibo Gmail recortado: conserva fecha e importe, sin inventar tarjeta', () => {
  const result = interpretCapture(validateCaptureEvent(input(body.split('Pagos')[0])));
  assert.equal(result.reason, 'UBER_RECEIPT_CARD_REQUIRED');
  assert.equal(result.proposal.amount, '160.25');
  assert.equal(result.proposal.date, '2026-10-14');
  assert.equal(result.proposal.cardId, undefined);
  assert.equal(interpretCapture(validateCaptureEvent(input('Tu viaje del miércoles por la noche con Uber\nTotal\nMXN 160.25'))).reason, 'UBER_RECEIPT_INCOMPLETE');
});

test('Gmail: rechaza otros remitentes, promociones, fuente falsa y datos de la cuenta antes de persistir', () => {
  for (const fields of [
    { ...fixture.event.fields, 'android.title': 'Otro remitente' },
    { 'android.title': 'Recibos de Uber', 'android.text': 'Aprovecha tu descuento' },
    { ...fixture.event.fields, 'android.subText': 'private@example.test' },
    { ...fixture.event.fields, 'android.summaryText': 'private@example.test' },
  ]) assert.throws(() => validateCaptureEvent({ ...fixture.event, fields }));
  assert.throws(() => validateCaptureEvent({ ...input(), sourcePackage: 'com.google.android.gm.fake' }));
});

test('recibo Gmail: varios viajes, tarjetas, total inválido, fecha imposible y futura conservan revisión', () => {
  for (const [text, reason] of [
    [body + '\nTotal\nMXN 200.00', 'CONFLICTING_FIELDS'],
    [body + '\nVisa ••••0456', 'AMBIGUOUS_CARD'],
    [body.replaceAll('14/10/2026', '31/02/2026'), 'UBER_RECEIPT_INCOMPLETE'],
    [body.replaceAll('160.25', '160.255'), 'UBER_RECEIPT_INCOMPLETE'],
    [body.replaceAll('14/10/2026', '20/10/2026'), 'FUTURE_OPERATION'],
  ] as const) assert.equal(interpretCapture(validateCaptureEvent(input(text))).reason, reason);
});
