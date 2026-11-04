// Fictitious end-to-end data. The shared guard refuses remote databases and
// environment files; this seed never reads the personal AFP connection.
import { fixtureConnection, fixtureDatabase } from './fixture-database';
import { addDays, todayInMexico } from '../../src/lib/money/dates';

const userId = '00000000-0000-4000-8000-000000000094';
async function main() {
  const db = await fixtureDatabase(fixtureConnection());
  const today = todayInMexico(), reference = addDays(today, -10);
  const date = (value: string) => new Date(`${value}T12:00:00Z`);
  try {
    await db.user.deleteMany({ where: { id: userId } });
    await db.user.create({ data: { id: userId, email: 'money-qa@example.test' } });
    const category = await db.category.create({ data: { userId, name: 'Gastos ficticios' } });
    const type = await db.incomeType.create({ data: { userId, name: 'Ingreso de prueba' } });
    const yieldType = await db.incomeType.create({ data: { userId, name: 'Rendimiento de prueba' } });
    const person = await db.person.create({ data: { userId, name: 'Persona de prueba' } });
    const bank = await db.moneyAccount.create({ data: { id: 'ledger-bank', userId, name: 'Banco ficticio', kind: 'BANK', openingBalance: 5000, asOf: date(reference), baseline: { 'income:ledger-reference': { 'ledger-bank': 100000 }, 'expense:ledger-deleted': { 'ledger-bank': -2000 } } } });
    const cash = await db.moneyAccount.create({ data: { id: 'ledger-empty', userId, name: 'Efectivo ficticio sin movimientos', kind: 'CASH', openingBalance: 120, asOf: date(reference), baseline: {} } });
    const savings = await db.moneyAccount.create({ data: { id: 'ledger-savings', userId, name: 'Ahorro ficticio con un nombre largo para comprobar la lectura en pantalla pequeña', kind: 'SAVINGS', openingBalance: 600, asOf: date(reference), baseline: {}, autoYield: true, annualYield: 15, yieldStartDate: date(reference), yieldIncomeTypeId: yieldType.id } });
    const negative = await db.moneyAccount.create({ data: { id: 'ledger-negative', userId, name: 'Cuenta ficticia con saldo negativo', openingBalance: 0, asOf: date(reference), baseline: {} } });
    for (const key of ['default:income', 'default:expense', 'default:card', 'default:contribution']) await db.moneyRoute.create({ data: { userId, key, accountId: bank.id } });
    await db.moneyRoute.create({ data: { userId, key: `incomeType:${yieldType.id}`, accountId: savings.id } });
    const income = (id: string, concept: string, amount: string, posted: string, extra: { receivableAccountId?: string; isEstimated?: boolean } = {}) => db.income.create({ data: { id, userId, date: date(posted), incomeTypeId: type.id, source: 'Fuente ficticia', concept, amount, ...extra } });
    await income('ledger-reference', 'Depósito incluido en referencia y editado después', '1200.00', reference);
    await income('ledger-salary', 'Nómina ficticia', '2000.50', today);
    await income('ledger-estimated', 'Nómina ficticia por confirmar', '999.99', addDays(today, -1), { isEstimated: true });
    const receivable = await db.receivableAccount.create({ data: { userId, personId: person.id, concept: 'Préstamo de prueba', originalAmount: 2000, originType: 'MANUAL', originDate: date(reference), expectedMonthlyPayment: 420.15, expectedChargeDays: [15, 31] } });
    await income('ledger-collection', 'Cobro ficticio de préstamo', '420.15', addDays(today, -3), { receivableAccountId: receivable.id });
    for (let index = 0; index < 24; index++) await income(`ledger-deposit-${String(index).padStart(2, '0')}`, `Depósito ficticio ${String(index + 1).padStart(2, '0')}`, (10 + index / 100).toFixed(2), addDays(today, -(index % 9)));
    await db.income.create({ data: { id: 'ledger-yield-recorded', userId, date: date(addDays(today, -2)), incomeTypeId: yieldType.id, source: 'Banco ficticio', concept: 'Abono de rendimiento ficticio', amount: '0.25' } });
    await db.moneyTransfer.create({ data: { id: 'ledger-transfer', userId, fromAccountId: bank.id, toAccountId: savings.id, date: date(addDays(today, -1)), amount: '275.50', concept: 'Traspaso ficticio al ahorro' } });
    await db.moneyWithdrawal.create({ data: { id: 'ledger-withdrawal', userId, accountId: bank.id, date: date(addDays(today, -2)), amount: '40.10', concept: 'Retiro ficticio' } });
    await db.dailyExpense.create({ data: { id: 'ledger-debit', userId, date: date(today), paymentMethod: 'DEBIT', debitAccountId: bank.id, amount: '45.67', categoryId: category.id, concept: 'Compra ficticia con débito y un concepto largo que debe poder leerse completo incluso desde un teléfono pequeño' } });
    await db.dailyExpense.create({ data: { id: 'ledger-negative-expense', userId, date: date(today), paymentMethod: 'DEBIT', debitAccountId: negative.id, amount: 30, categoryId: category.id, concept: 'Gasto ficticio por conciliar' } });
    const card = await db.card.create({ data: { userId, name: 'Tarjeta ficticia', usualCutDay: 25, usualDueDay: 10, creditLimit: 10000, usedBalance: 1000, balanceAsOf: date(today) } });
    await db.dailyExpense.create({ data: { id: 'ledger-credit', userId, date: date(today), paymentMethod: 'CARD', cardId: card.id, amount: 900, cashContributionAmount: '25.25', categoryId: category.id, concept: 'Compra con crédito ficticia y aportación en efectivo' } });
    await db.cardCycle.create({ data: { userId, cardId: card.id, year: 2026, month: 10, startDate: date('2026-09-26'), cutDate: date('2026-10-25'), dueDate: date('2026-11-10'), statementAmount: 1000, paidAmount: '125.50', paidAt: date(addDays(today, -1)) } });
    await income('ledger-future', 'Ingreso ficticio futuro que no debe entrar en el saldo', '1500.00', addDays(today, 1));
    console.log(JSON.stringify({ userId, today, reference, bankId: bank.id, cashId: cash.id, savingsId: savings.id, negativeId: negative.id }));
  } finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
