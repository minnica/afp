// Explicit, local boundaries with the financial core scheduled for phase 4.
// Only the returned fields used by Mi dinero are validated here.
import { z } from 'zod';
import { getDebtAccountState as debtState } from '@/lib/calculations/debtAccounts';
import { calculateCycleAmount as cycleAmount } from '@/lib/calculations/cardCycles';
import { buildSubscriptionCharges as subscriptionCharges } from '@/lib/subscriptionCharges';
import type { CalculationData } from './types';

export function getDebtAccountState(account: CalculationData['receivables'][number] | CalculationData['payables'][number], payments: CalculationData['incomes'] | CalculationData['payables'][number]['dailyExpenses']) {
  const result: unknown = debtState(account, payments);
  return z.object({ status: z.string(), pendingBalance: z.number() }).parse(result);
}
type CycleInput = { cycle: object; expenses: object[]; subscriptions: object[]; purchases: object[]; includeBreakdown: boolean };
const calculate: (input: CycleInput) => unknown = cycleAmount as (input: CycleInput) => unknown;
export function calculateCycleAmount(input: CycleInput) {
  return z.object({ calculatedAmount: z.number() }).parse(calculate(input));
}
type SubscriptionInput = { subscriptions: CalculationData['subscriptions']; cycles: CalculationData['cycles']; month: string; today: string };
const charges: (input: SubscriptionInput) => unknown = subscriptionCharges as (input: SubscriptionInput) => unknown;
export function buildSubscriptionCharges(input: SubscriptionInput) {
  return z.array(z.object({ paymentMethod: z.string(), status: z.string(), subscriptionId: z.string(), date: z.string(), amount: z.union([z.string(), z.number()]), name: z.string() })).parse(charges(input));
}
