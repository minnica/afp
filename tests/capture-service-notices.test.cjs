const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { sourceLoader } = require('./helpers/load-source.ts');
const load = sourceLoader({ 'next/server': { NextResponse: {} } });
const { reviewOnlyCapturePackages } = load('src/lib/captureSourcePolicy.ts');
const { validateCaptureEvent } = load('src/lib/captureProtocol.ts');
const { interpretCapture, captureParsers } = load('src/lib/captureParsers.ts');
const { captureInventorySchema, configureCapture } = load('src/lib/captureConfiguration.ts');

test('Viajes y pedidos: cada paquete exacto conserva texto original sin interpretar cobros ni tarjetas', () => {
  // Casos hipotéticos deliberados: no son muestras ni gramáticas verificadas.
  for (const sourcePackage of reviewOnlyCapturePackages) {
    for (const text of ['', 'Tu conductor está llegando', 'Viaje finalizado', 'Pedido entregado',
      'Tarifa estimada MXN 150.00', 'Pago MXN 150.00 tarjeta 0123', 'Retención $150.00',
      'Reembolso MXN 150.00', 'MXN150.00 con Nu Mastercard Gold ••0123']) {
      const input = { contractVersion: 1, eventId: randomUUID(), sourcePackage,
        notificationKeyHash: 'a'.repeat(64), postedAt: '2026-10-23T12:00:00Z', receivedAt: '2026-10-23T12:00:01Z',
        fields: { 'android.title': 'Aviso hipotético', 'android.text': text, 'android.bigText': `${text}\nDetalle ficticio` } };
      const event = validateCaptureEvent(input);
      assert.deepEqual(JSON.parse(JSON.stringify(event.fields)), input.fields);
      const result = interpretCapture(event);
      assert.equal(result.reason, 'SERVICE_NOTICE_REVIEW');
      assert.equal(Object.keys(result.proposal).length, 0);
      assert.equal(result.parserKey, undefined);
      assert.equal(result.verified, undefined);
    }
    assert.equal(captureParsers.some(parser => parser.sourcePackage === sourcePackage), false);
  }
});

test('Viajes y pedidos: no aceptan alias de tarjetas ni inventarios bancarios', async () => {
  const db = { $transaction() { throw new Error('No debe consultar la BD'); } };
  for (const sourcePackage of reviewOnlyCapturePackages) {
    await assert.rejects(configureCapture(db, 'owner', { action: 'alias', cardId: 'card', sourcePackage,
      kind: 'DIGITAL', value: '0123', verified: true, evidence: 'Ficticia' }), { status: 400 });
    assert.equal(captureInventorySchema.safeParse({ version: 1, cards: [{ name: 'Ficticia', bankPackage: sourcePackage,
      physical: [], digital: ['0123'], wallet: [], verified: false, evidence: '' }] }).success, false);
  }
});
