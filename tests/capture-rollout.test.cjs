const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const { isReviewedCapture, captureFormatReadiness, buildCaptureRollout } = sourceLoader()('src/lib/captureRollout.ts');
const sourcePackage = 'mx.hsbc.hsbcmexico';
const parser = { key: 'synthetic.hsbc.v1', sourcePackage, verified: true };
const alias = { cardId: 'card1', sourcePackage, kind: 'PHYSICAL', value: '0123', verifiedAt: new Date() };
const fixture = () => ({ cardId: 'card1', parserKey: parser.key, status: 'LINKED', resolvedAt: new Date(),
  proposal: { cardId: 'card1', alias: { kind: 'PHYSICAL', value: '0123' }, amount: '123.45', date: '2026-10-21', currency: 'MXN', merchant: 'COMERCIO', operationAt: '2026-10-21T19:00:00Z' },
  expense: { cardId: 'card1', date: new Date('2026-10-21T12:00:00Z'), amount: '123.45', paymentMethod: 'CARD', reconciledAt: new Date(), concept: 'Nombre personal', cashContributionAmount: '20.00' },
  events: [{ sourcePackage, interpretation: { parserKey: parser.key, proposal: { cardId: 'card1' }, reason: 'OBSERVATION' } }],
});

test('activación: requiere propuesta de observación, vínculo resuelto, cotejo y datos financieros vigentes', () => {
  assert.equal(isReviewedCapture(fixture(), parser, [alias]), true);
  for (const update of [{ status: 'OBSERVED' }, { status: 'DISCARDED' }, { status: 'CONVERTED' }, { resolvedAt: null }, { expense: null }, { proposal: {} }, { parserKey: 'synthetic.hsbc.v2' }, { cardId: 'card2' }]) {
    assert.equal(isReviewedCapture({ ...fixture(), ...update }, parser, [alias]), false, JSON.stringify(update));
  }
  for (const update of [{ reconciledAt: null }, { paymentMethod: 'CASH' }, { cardId: 'card2' }, { amount: '124.45' }, { date: new Date('2026-10-22T12:00:00Z') }]) {
    const movement = fixture(); Object.assign(movement.expense, update);
    assert.equal(isReviewedCapture(movement, parser, [alias]), false);
  }
});

test('activación: corregir un campo interpretado no acredita que el analizador acertó', () => {
  const original = fixture();
  const correction = { cardId: 'card1', date: original.proposal.date, amount: '123.450', currency: 'MXN', merchant: 'comércio', categoryId: 'elegida' };
  assert.equal(isReviewedCapture({ ...original, correction }, parser, [alias]), true);
  for (const update of [{ cardId: 'card2' }, { date: '2026-10-20' }, { amount: '122.45' }, { currency: 'USD' }, { merchant: 'OTRO COMERCIO' }]) {
    assert.equal(isReviewedCapture({ ...original, correction: { ...correction, ...update } }, parser, [alias]), false);
  }
});

test('activación: no usa avisos de otra fuente, versión ni tarjeta, o un registro automático como observación', () => {
  for (const event of [
    { sourcePackage: 'com.google.android.apps.walletnfcrel' },
    { interpretation: { parserKey: 'synthetic.hsbc.v2', proposal: { cardId: 'card1' }, reason: 'OBSERVATION' } },
    { interpretation: { parserKey: parser.key, proposal: { cardId: 'card2' }, reason: 'OBSERVATION' } },
    { interpretation: { parserKey: parser.key, proposal: { cardId: 'card1' }, reason: 'PURCHASE' } },
  ]) {
    const movement = fixture(); movement.events = [{ ...movement.events[0], ...event }];
    assert.equal(isReviewedCapture(movement, parser, [alias]), false);
  }
  const movement = fixture(); movement.events = [];
  assert.equal(isReviewedCapture(movement, parser, [alias]), false);
});

test('activación: formatos sin verificar, débito y alias no verificados o ambiguos bloquean el alta', () => {
  assert.equal(captureFormatReadiness(parser, 'card1', [alias], [fixture()]).canEnable, true);
  assert.equal(captureFormatReadiness({ ...parser, verified: false }, 'card1', [alias], [fixture()]).canEnable, false);
  assert.equal(captureFormatReadiness({ ...parser, evidence: 'REAL_OUT_OF_SCOPE' }, 'card1', [alias], [fixture()]).canEnable, false);
  assert.equal(captureFormatReadiness(parser, 'card1', [{ ...alias, verifiedAt: null }], [fixture()]).canEnable, false);
  assert.equal(captureFormatReadiness(parser, 'card1', [alias, { ...alias, cardId: 'card2', verifiedAt: null }], [fixture()]).canEnable, false);
  assert.equal(captureFormatReadiness(parser, 'card2', [alias], [fixture()]).canEnable, false);
});

test('cobertura: los nombres editables no eligen banco ni asignan evidencia de Wallet', () => {
  const cards = [{ id: 'card1', name: 'BBVA' }, { id: 'card2', name: 'HSBC 1' }];
  const coverage = buildCaptureRollout(cards, [alias], [], [parser], [fixture()]);
  assert.ok(coverage[0].sources.some(source => source.sourcePackage === sourcePackage));
  assert.equal(coverage[1].sources.length, 1);
  assert.equal(coverage[1].sources[0].sourcePackage, 'com.google.android.apps.walletnfcrel');
  assert.equal(coverage[1].sources[0].verifiedAliases, 0);
  assert.equal(coverage[0].sources[0].verifiedChannels, undefined);
  assert.ok(!JSON.stringify(coverage).includes('0123'));
});
