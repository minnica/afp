import type { AccountResponse } from '@/lib/money/responses';

export type AccountTotals = Pick<AccountResponse, 'balance' | 'yieldEstimate'>;

export function accountTotals(accounts: readonly AccountTotals[]): AccountTotals {
  const cents = accounts.reduce((total, account) => {
    total.balance += Math.round(account.balance * 100);
    total.daily += Math.round(account.yieldEstimate.daily * 100);
    total.weekly += Math.round(account.yieldEstimate.weekly * 100);
    total.monthly += Math.round(account.yieldEstimate.monthly * 100);
    return total;
  }, { balance: 0, daily: 0, weekly: 0, monthly: 0 });

  return {
    balance: cents.balance / 100,
    yieldEstimate: {
      daily: cents.daily / 100,
      weekly: cents.weekly / 100,
      monthly: cents.monthly / 100,
    },
  };
}
