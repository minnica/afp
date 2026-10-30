// Fictitious yield data for the local browser fixture. Never loads .env.
import { fixtureConnection, fixtureDatabase } from './fixture-database';
import { addDays, todayInMexico } from '../../src/lib/money/dates';

async function main() {
  const db = await fixtureDatabase(fixtureConnection());
  const userId = '00000000-0000-4000-8000-000000000094';
  const today = todayInMexico();
  const start = addDays(today, -40);
  try {
    await db.user.deleteMany({ where: { id: userId } });
    await db.user.create({ data: { id: userId, email: 'money-qa@example.test' } });
    const bankType = await db.incomeType.create({ data: { userId, name: 'Rendimiento bancario ficticio' } });
    const savingsType = await db.incomeType.create({ data: { userId, name: 'Rendimiento de ahorro ficticio' } });
    const salaryType = await db.incomeType.create({ data: { userId, name: 'Nómina ficticia' } });
    const bank = await db.moneyAccount.create({ data: { userId, name: 'Banco ficticio', kind: 'BANK', openingBalance: 12000, asOf: new Date(start), baseline: {}, annualYield: 13, autoYield: true, yieldIncomeTypeId: bankType.id } });
    const savings = await db.moneyAccount.create({ data: { userId, name: 'Ahorro ficticio con rendimiento por tramos', kind: 'SAVINGS', openingBalance: 21000, asOf: new Date(start), baseline: {}, annualYield: 15, yieldCap: 20000, yieldExcessRate: 7, yieldPayout: 'MX_BUSINESS', autoYield: true, yieldIncomeTypeId: savingsType.id } });
    await db.moneyAccount.create({ data: { userId, name: 'Efectivo ficticio', kind: 'CASH', openingBalance: 750, asOf: new Date(today), baseline: {} } });
    for (const [incomeTypeId, accountId] of [[bankType.id, bank.id], [salaryType.id, bank.id]] as const) {
      await db.moneyRoute.create({ data: { userId, key: `incomeType:${incomeTypeId}`, accountId } });
    }
    const deposit = (incomeTypeId: string, date: string, amount: number, concept: string) => db.income.create({ data: { userId, incomeTypeId, date: new Date(date), amount, concept, source: 'Fixture local' } });
    await deposit(bankType.id, addDays(today, -2), 4.32, 'Interés real ficticio del banco');
    await deposit(bankType.id, today, 4.45, 'Interés real ficticio de hoy');
    const savingsIncome = await deposit(savingsType.id, today, 9.12, 'Interés real ficticio del ahorro');
    await db.moneyRoute.create({ data: { userId, key: `income:${savingsIncome.id}`, accountId: savings.id } });
    await deposit(bankType.id, start, 120.55, 'Abono histórico ficticio');
    await deposit(salaryType.id, today, 5000, 'Nómina ficticia: no es rendimiento');
    await deposit(savingsType.id, today, 1.25, 'Interés ficticio sin cuenta');
    console.log(JSON.stringify({ today, userId, accounts: [bank.id, savings.id], realCurrentMonth: 19.14 }));
  } finally { await db.$disconnect(); }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
