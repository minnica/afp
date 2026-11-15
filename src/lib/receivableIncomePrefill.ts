import type { ImportantNotice } from './importantNotices';
import type { NamedRecord, Receivable } from './uiTypes';
import { receivableOccurrenceIncomes } from './receivableOccurrences';
import { validDay } from './money/dates';

export interface IncomeDraft {
  date: string;
  incomeTypeId: string;
  source: string;
  concept: string;
  amount: string;
  receivableAccountId: string;
  notes: string;
}

export function receivableIncomeHref(notice: Pick<ImportantNotice, 'type' | 'receivableAccountId' | 'date'>) {
  if (notice.type !== 'RECEIVABLE' || !notice.receivableAccountId) return null;
  const date = new Date(notice.date);
  if (!Number.isFinite(date.getTime())) return null;
  const params = new URLSearchParams({ receivableAccountId: notice.receivableAccountId, chargeDate: date.toISOString().slice(0, 10) });
  return `/ingresos?${params}`;
}

// Resolve only against the current owner's authenticated response, never URL amounts or names.
export function buildReceivableIncomeDraft(
  receivables: Pick<Receivable, 'id' | 'status' | 'pendingBalance' | 'expectedMonthlyPayment' | 'expectedChargeDays' | 'originDate' | 'person' | 'concept' | 'incomes'>[],
  incomeTypes: NamedRecord[],
  accountId: string,
  chargeDate: string,
  now = new Date(),
): IncomeDraft {
  if (!validDay(chargeDate)) throw new Error('La fecha del aviso no es válida. Abre un aviso actualizado.');
  const account = receivables.find(item => item.id === accountId);
  if (!account) throw new Error('La cuenta por cobrar ya no está disponible. Revisa tus cuentas por cobrar.');
  if (account.status === 'CANCELLED') throw new Error('Esta cuenta por cobrar está cancelada. Revisa tus cuentas por cobrar.');
  const pending = Math.round(Number(account.pendingBalance) * 100);
  if (account.status !== 'ACTIVE' || !Number.isFinite(pending) || pending <= 0) {
    throw new Error('Esta cuenta por cobrar ya está liquidada. Revisa los ingresos registrados.');
  }
  const date = new Date(`${chargeDate}T12:00:00Z`);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (chargeDate < account.originDate.slice(0, 10) || !account.expectedChargeDays.some(day => Math.min(day, lastDay) === date.getUTCDate())) {
    throw new Error('La programación de este cobro cambió. Abre un aviso actualizado.');
  }
  if (receivableOccurrenceIncomes(account, chargeDate, now).length > 0) {
    throw new Error('Este cobro ya tiene un ingreso registrado. Revisa el historial antes de agregar otro abono.');
  }
  const expected = Math.round(Number(account.expectedMonthlyPayment) * 100);
  return {
    date: chargeDate,
    incomeTypeId: incomeTypes.find(type => type.name.trim().toLocaleLowerCase('es-MX') === 'pago recibido')?.id || '',
    source: account.person?.name || '',
    concept: account.concept,
    amount: Number.isFinite(expected) && expected > 0 ? (Math.min(expected, pending) / 100).toFixed(2) : '',
    receivableAccountId: account.id,
    notes: '',
  };
}
