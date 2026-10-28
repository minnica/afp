const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
const { PrismaPg } = require(path.join(process.cwd(), 'node_modules/@prisma/adapter-pg'));
const connectionString = process.env.AFP_TEST_DATABASE_URL;
const url = new URL(connectionString);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search && !url.hash);
const folder = path.join(process.cwd(), 'artifacts/typescript-migration/phase-7');
const seed = JSON.parse(fs.readFileSync(path.join(folder,'browser-seed.json')));
const browser = JSON.parse(fs.readFileSync(path.join(folder,'browser-mobile.json')));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
(async () => {
  const transfers = await db.moneyTransfer.findMany({ where: { userId: seed.userId }, orderBy: { amount: 'desc' } });
  const operations = await db.moneyOperation.findMany({ where: { userId: seed.userId, operationId: { in: browser.requests.map(row => row.body.operationId) } } });
  assert.equal(transfers.length, 2);
  assert.equal(operations.length, 2);
  for (const request of browser.requests) {
    assert.equal(request.status, 200);
    const stored = transfers.find(row => row.id === request.response.id);
    assert.equal(Number(stored.amount), request.body.amount);
    assert.equal(stored.fromAccountId, request.body.fromAccountId);
    assert.equal(stored.toAccountId, request.body.toAccountId);
    assert.equal(stored.concept, request.body.concept);
    assert.ok(operations.some(row => row.operationId === request.body.operationId));
  }
  const accounts = await db.moneyAccount.findMany({ where: { userId: seed.userId } });
  const effect = account => Math.round(Number(account.openingBalance) * 100)
    + transfers.reduce((sum, row) => sum + (row.toAccountId === account.id ? Math.round(Number(row.amount) * 100) : 0) - (row.fromAccountId === account.id ? Math.round(Number(row.amount) * 100) : 0), 0);
  const balances = accounts.map(account => ({ name: account.name, transferAdjustedCents: effect(account) }));
  assert.equal(balances.reduce((sum, row) => sum + row.transferAdjustedCents, 0), 1000000);
  fs.writeFileSync(path.join(folder,'browser-data.json'), JSON.stringify({ transfers, operations, balances, totalCents: 1000000 }, null, 2) + '\n');
  console.log('OK: dos transferencias y recibos; importes, UUID y cuentas coinciden; el total se conserva.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
