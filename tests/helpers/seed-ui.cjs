// Fictitious UI data only; refuses remote/shared databases and environment files.
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const connectionString = process.env.AFP_TEST_DATABASE_URL;
const url = new URL(connectionString);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search && !url.hash);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const userId = '00000000-0000-4000-8000-000000000094';
(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.user.create({ data: { id: userId, email: 'money-qa@example.test' } });
  const category = await db.category.create({ data: { userId, name: 'Categoría ficticia' } });
  const incomeType = await db.incomeType.create({ data: { userId, name: 'Ingreso ficticio' } });
  const person = await db.person.create({ data: { userId, name: 'Persona ficticia' } });
  const [bank, cash] = await Promise.all(['Banco ficticio', 'Efectivo ficticio'].map((name, index) => db.moneyAccount.create({ data: { userId, name, kind: index ? 'CASH' : 'BANK', openingBalance: 5000, baseline: {}, asOf: new Date('2026-10-01T12:00:00Z') } })));
  const card = await db.card.create({ data: { userId, name: 'Tarjeta ficticia', usualCutDay: 25, usualDueDay: 10, creditLimit: 10000, usedBalance: 1000, balanceAsOf: new Date('2026-10-28T12:00:00Z') } });
  const today = new Date().toISOString().slice(0, 10);
  await db.cardCycle.create({ data: { userId, cardId: card.id, year: 2026, month: 10, startDate: new Date('2026-09-26T12:00:00Z'), cutDate: new Date('2026-10-25T12:00:00Z'), dueDate: new Date('2026-11-10T12:00:00Z'), statementAmount: 1000, paidAmount: 250 } });
  await db.subscription.create({ data: { userId, name: 'Servicio ficticio', amount: 120, paymentMethod: 'CARD', cardId: card.id, categoryId: category.id, chargeDay: 1, frequencyMonths: 1, startYear: 2026, startMonth: 1 } });
  await db.installmentPurchase.create({ data: { userId, concept: 'Compra ficticia a meses', cardId: card.id, categoryId: category.id, purchaseDate: new Date(`${today}T12:00:00Z`), totalAmount: 1200, months: 12 } });
  await db.receivableAccount.create({ data: { userId, personId: person.id, concept: 'Cobro ficticio', originalAmount: 500, originType: "MANUAL", originDate: new Date(`${today}T12:00:00Z`), expectedChargeDays: [15, 31] } });
  await db.payableAccount.create({ data: { userId, personId: person.id, concept: 'Deuda ficticia', originalAmount: 700, originType: "MANUAL", originDate: new Date(`${today}T12:00:00Z`), expectedDate: new Date(`${today}T12:00:00Z`) } });
  await db.income.create({ data: { userId, incomeTypeId: incomeType.id, date: new Date(`${today}T12:00:00Z`), concept: 'Ingreso de prueba', source: 'Fuente ficticia', amount: 1500 } });
  for (const paymentMethod of ['CASH', 'CARD', 'DEBIT']) await db.dailyExpense.create({ data: { userId, date: new Date(`${today}T12:00:00Z`), paymentMethod, cardId: paymentMethod === 'CARD' ? card.id : null, debitAccountId: paymentMethod === 'DEBIT' ? bank.id : null, concept: `Compra ficticia ${paymentMethod}`, amount: 50, categoryId: category.id } });
  await db.captureMovement.create({ data: { userId, reason: 'UNKNOWN_FORMAT', proposal: { merchant: 'Aviso ficticio', amount: '45.50', date: today, currency: 'MXN', cardId: card.id, categoryId: category.id } } });
  await db.captureMovement.create({ data: { userId, parserKey: 'banamex.card-payment.es.v1', reason: 'PAYMENT_REVIEW', proposal: { merchant: 'Pago ficticio para revisión', movementType: 'CARD_PAYMENT', paymentEvidence: 'BANK_RECEIVED', amount: '100.00', date: today, currency: 'MXN', cardId: card.id } } });
  console.log(JSON.stringify({ userId, categoryId: category.id, personId: person.id, incomeTypeId: incomeType.id, cardId: card.id, bankId: bank.id, cashId: cash.id }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
