// Datos ficticios para la revisión de navegador; nunca carga .env.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { randomUUID, createHash } = require('node:crypto');
const connectionString = process.env.AFP_TEST_DATABASE_URL;
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/afp_test\w*$/.test(url.pathname) || url.search) throw new Error('Solo permite una base local afp_test.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
async function main() {
  const userId = '00000000-0000-4000-8000-000000000091';
  await db.user.upsert({ where: { id: userId }, create: { id: userId, email: 'capture-qa@example.test' }, update: {} });
  const category = await db.category.upsert({ where: { userId_name: { userId, name: 'Compras ficticias' } }, create: { userId, name: 'Compras ficticias' }, update: {} });
  const sources = [
    ['BBVA', 'com.bancomer.mbanking', true], ['HSBC 1', 'mx.hsbc.hsbcmexico', false], ['HSBC 2', 'mx.hsbc.hsbcmexico', false],
    ['BANAMEX 1', 'com.citibanamex.banamexmobile', true], ['BANAMEX 2', 'com.citibanamex.banamexmobile', true],
    ['SANTANDER', 'mx.bancosantander.supermovil', true], ['NU', 'com.nu.production', true], ['DIDI', 'com.didiglobal.cashloan', true], ['MERCADOPAGO', 'com.mercadopago.wallet', false],
  ];
  for (const [i, [name, sourcePackage, supportsWallet]] of sources.entries()) {
    const card = await db.card.upsert({ where: { userId_name: { userId, name } }, create: { userId, name, usualCutDay: 25, usualDueDay: 15 }, update: {} });
    for (const kind of ['PHYSICAL', 'DIGITAL', ...(supportsWallet ? ['WALLET'] : [])]) {
      const identity = { userId, cardId: card.id, sourcePackage: kind === 'WALLET' ? 'com.google.android.apps.walletnfcrel' : sourcePackage, kind,
        value: String((kind === 'PHYSICAL' ? 1000 : kind === 'DIGITAL' ? 2000 : 3000) + i) };
      await db.captureCardAlias.upsert({ where: { userId_cardId_sourcePackage_kind_value: identity }, create: { ...identity, verifiedAt: new Date(), evidence: 'Terminación ficticia para revisión local.' }, update: {} });
    }
  }
  const card = await db.card.findUnique({ where: { userId_name: { userId, name: 'BBVA' } } });
  const device = await db.captureDevice.create({ data: { userId, name: 'Teléfono de prueba', secretHash: createHash('sha256').update(randomUUID()).digest('hex'), approvedAt: new Date() } });
  const proposal = { merchant: 'TIENDA FICTICIA', cardId: card.id, categoryId: category.id, date: '2026-10-21', amount: '350.50', currency: 'MXN' };
  for (const [reason, p] of [['UNVERIFIED_FORMAT', proposal], ['UNKNOWN_FORMAT', {}], ['POSSIBLE_DUPLICATE', proposal]]) {
    const row = await db.captureMovement.create({ data: { userId, reason, status: reason === 'UNVERIFIED_FORMAT' ? 'OBSERVED' : 'REVIEW', proposal: p, cardId: card.id, amount: p.amount || null } });
    await db.captureEvent.create({ data: { userId, deviceId: device.id, eventId: randomUUID(), contractVersion: 1, sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: createHash('sha256').update(randomUUID()).digest('hex'), requestHash: 'ficticio', postedAt: new Date(), receivedAt: new Date(), movementId: row.id,
      fields: { 'android.title': 'Aviso ficticio', 'android.text': 'Compra ficticia de 350.50 MXN. Datos sintéticos para la Fase 5.' } } });
  }
  console.log('Fixture ficticio preparado: nueve tarjetas, 24 alias, categoría y tres avisos.');
}
main().finally(() => db.$disconnect());
