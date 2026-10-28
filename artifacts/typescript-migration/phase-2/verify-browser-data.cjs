// Ejecutar después del recorrido de navegador documentado, antes de borrar la BD.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const connectionString = process.env.AFP_TEST_DATABASE_URL;
const url = new URL(connectionString);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
const userId = '00000000-0000-4000-8000-000000000094';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
(async () => {
  try {
    const browser = JSON.parse(fs.readFileSync(`${__dirname}/browser-checks.json`, 'utf8'));
    const transfers = await db.moneyTransfer.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    const operations = await db.moneyOperation.findMany({ where: { userId } });
    assert.equal(transfers.length, 2);
    assert.equal(operations.length, 6); // Dos cuentas, dos transferencias y dos reversiones.
    assert.ok(transfers.every(row => row.reversedAt));
    for (const post of browser.posts) {
      const receipt = operations.find(row => row.operationId === post.command.operationId);
      assert.ok(receipt);
      assert.deepEqual(receipt.result, post.response);
    }
    const result = { checkedAt: new Date().toISOString(), transfers: transfers.map(row => ({ id: row.id, amount: row.amount.toString(), date: row.date.toISOString(), reversedAt: row.reversedAt.toISOString() })), operationCount: operations.length, browserPosts: browser.posts.length, allReceiptsMatch: true };
    fs.writeFileSync(`${__dirname}/browser-persistence.json`, `${JSON.stringify(result, null, 2)}\n`);
    console.log('Dos transferencias conservadas y revertidas; cinco POST corresponden a cuatro recibos únicos de transferencia/reversión.');
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
