import { z } from 'zod';
import { cashWithdrawalFormSchema } from '@/lib/money/schema';
import type { EditorConfiguration } from './editorContracts';

export function createWithdrawalEditor(accounts: unknown, today: string): Extract<EditorConfiguration, { action: 'WITHDRAWAL' }> {
  const rows = z.array(z.object({ id: z.string(), name: z.string(), kind: z.string() })).parse(accounts);
  const banks = rows.filter(account => account.kind !== 'CASH');
  const cash = rows.filter(account => account.kind === 'CASH');
  const options = (items: typeof rows) => items.map(account => ({ value: account.id, label: account.name }));
  return {
    title: 'Registrar retiro de efectivo',
    description: 'Descuenta el total del banco y suma el efectivo recibido a tu caja. La diferencia corresponde a la comisión.',
    action: 'WITHDRAWAL', schema: cashWithdrawalFormSchema,
    values: { accountId: '', cashAccountId: cash.length === 1 ? cash[0]!.id : '', amount: '', cashAmount: '', date: today, concept: 'Retiro de efectivo' },
    fields: [
      { name: 'accountId', label: 'Cuenta de salida', options: options(banks) },
      { name: 'cashAccountId', label: 'Cuenta que recibe el efectivo', options: options(cash), help: cash.length ? 'El efectivo se sumará a esta cuenta.' : 'Primero agrega una cuenta de tipo Efectivo en Mi dinero.' },
      { name: 'amount', label: 'Total descontado del banco (MXN)', type: 'number', money: true, help: 'Incluye la comisión y sus impuestos, si los hubo.' },
      { name: 'cashAmount', label: 'Efectivo recibido (MXN)', type: 'number', money: true, help: 'Solo el dinero entregado por el cajero, sin comisión.' },
      { name: 'date', label: 'Fecha del retiro', type: 'date' },
      { name: 'concept', label: 'Concepto' },
    ],
  };
}
