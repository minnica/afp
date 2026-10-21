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
  for (const name of ['BBVA', 'HSBC 1', 'HSBC 2', 'BANAMEX 1', 'BANAMEX 2', 'SANTANDER', 'NU', 'DIDI', 'MERCADOPAGO']) await db.card.upsert({ where: { userId_name: { userId, name } }, create: { userId, name, usualCutDay: 25, usualDueDay: 15 }, update: {} });
  const card = await db.card.findUnique({ where: { userId_name: { userId, name: 'BBVA' } } });
  const device = await db.captureDevice.create({ data: { userId, name: 'Teléfono de prueba', secretHash: createHash('sha256').update(randomUUID()).digest('hex'), approvedAt: new Date() } });
  const proposal = { merchant: 'TIENDA FICTICIA', cardId: card.id, categoryId: category.id, date: '2026-10-21', amount: '350.50', currency: 'MXN' };
  for (const [reason, p] of [['UNVERIFIED_FORMAT', proposal], ['UNKNOWN_FORMAT', {}], ['POSSIBLE_DUPLICATE', proposal]]) {
    const row = await db.captureMovement.create({ data: { userId, reason, status: reason === 'UNVERIFIED_FORMAT' ? 'OBSERVED' : 'REVIEW', proposal: p, cardId: card.id, amount: p.amount || null } });
    await db.captureEvent.create({ data: { userId, deviceId: device.id, eventId: randomUUID(), contractVersion: 1, sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: createHash('sha256').update(randomUUID()).digest('hex'), requestHash: 'ficticio', postedAt: new Date(), receivedAt: new Date(), movementId: row.id,
      fields: { 'android.title': 'Aviso ficticio', 'android.text': 'Compra ficticia de 350.50 MXN. Datos sintéticos para la Fase 5.' } } });
  }
  console.log('Fixture ficticio Fase 5 preparado: nueve tarjetas, categoría y tres avisos.');
}
main().finally(() => db.$disconnect());
