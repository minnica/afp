// Datos ficticios; exige una base afp_test local y nunca carga .env.
import { createHash, randomBytes } from 'node:crypto';
import { fixtureConnection, fixtureDatabase } from './fixture-database';

async function main() {
  const db = await fixtureDatabase(fixtureConnection());
  try {
    const userId = '00000000-0000-4000-8000-000000000091';
    await db.user.upsert({ where: { id: userId }, create: { id: userId, email: 'capture-qa@example.test' }, update: {} });
    for (const [id, name] of [['transfer-pair-bbva-qa', 'BBVA ficticia'], ['transfer-pair-nu-qa', 'Nu ficticia']]) {
      const kind = id === 'transfer-pair-nu-qa' ? 'SAVINGS' : 'BANK';
      await db.moneyAccount.upsert({ where: { id }, create: { id, userId, name: name!, kind, openingBalance: 10000, asOf: new Date('2026-10-24'), baseline: {} }, update: { kind } });
    }
    const secret = randomBytes(32).toString('base64url');
    const device = await db.captureDevice.create({ data: { userId, name: 'Teléfono QA transferencias', approvedAt: new Date(), secretHash: createHash('sha256').update(secret).digest('hex') } });
    console.log(JSON.stringify({ deviceId: device.id, credential: `Capture ${device.id}.${secret}`, userId }));
  } finally { await db.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
