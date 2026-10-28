import { z } from 'zod';

// Persisted JSON predates the current forms. Keep optional legacy fields,
// numeric text and extra snapshot metadata; never rewrite it while reading.
const numeric = z.union([z.number(), z.string()]);
export const baselineSchema = z.record(z.string(), z.record(z.string(), z.number()));
export const paymentMixSchema = z.object({
  version: z.number().optional(), referenceMonths: z.array(z.string()).optional(),
  cashWeight: z.number(), cards: z.array(z.object({ cardId: z.string(), weight: z.number() })),
  sampleCount: z.number().optional(),
}).passthrough();
export const storedYieldRuleSchema = z.object({
  autoYield: z.boolean().optional(), annualYield: numeric.nullish(), yieldTaxPercent: numeric.nullish(),
  yieldBasis: numeric.nullish(), yieldCap: numeric.nullish(), yieldStartDate: z.string().nullish(),
  yieldEndDate: z.string().nullish(), yieldIncomeTypeId: z.string().nullish(), yieldMethod: z.string().nullish(),
  yieldDailyAmount: numeric.nullish(), yieldExcessRate: numeric.nullish(), yieldPayout: z.string().nullish(), yieldRounding: z.string().nullish(),
}).passthrough();
export const yieldHistoryEntrySchema = z.object({ from: z.string(), rule: storedYieldRuleSchema }).passthrough();
export const accountSnapshotSchema = storedYieldRuleSchema.extend({
  asOf: z.string(), openingBalance: numeric.nullish(), reservedAmount: numeric.nullish(),
  baseline: baselineSchema.nullish(), yieldInitialPendingDays: z.number().nullish(),
});
export type PaymentMix = z.output<typeof paymentMixSchema>;
export function readPaymentMix(value: unknown) { return value == null ? null : paymentMixSchema.parse(value); }
export function readBaseline(value: unknown) { return value == null ? {} : baselineSchema.parse(value); }
export function readSnapshot(value: unknown) {
  // Older reconciliations without a balance snapshot were already ignored.
  if (!value || typeof value !== 'object' || !('asOf' in value) || !value.asOf) return null;
  return accountSnapshotSchema.parse(value);
}
export function readYieldHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown) => !!entry && typeof entry === 'object' && 'from' in entry && typeof entry.from === 'string' && 'rule' in entry && !!entry.rule)
    .map((entry: unknown) => yieldHistoryEntrySchema.parse(entry));
}

// A no-op rate edit must retain even legacy entries ignored by calculations.
export function preserveYieldHistory(value: unknown) { return z.array(z.json()).parse(value || []); }
