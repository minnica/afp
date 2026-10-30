import type { ChangeEvent, RefObject } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { useCreationDraft } from '@/hooks/use-creation-draft';
import { uiFetch } from '@/lib/uiClient';
import type { CaptureAction } from '@/components/configuracion/captureUiTypes';
import { getCyclePaymentAmounts, getCyclePaymentState } from '@/lib/calculations/cardCyclePayments';

export const table = <DataTable data={[{ id: 'a', amount: 12.50 }]} columns={[{
  header: 'Monto', accessorKey: 'amount', cell: ({ row }) => {
    // @ts-expect-error La fila conserva el contrato del dato, sin propiedades ajenas.
    void row.original.concept;
    return row.original.amount;
  },
}]} />;
export const number = <Input type="number" formatNumber onChange={(event: ChangeEvent<HTMLInputElement>) => { void event.target.valueAsNumber; }} />;
// @ts-expect-error El selector entrega un ID textual, nunca un índice numérico.
export const selector = <ResponsiveSelect options={[]} onValueChange={(value: number) => { void value; }} />;
// @ts-expect-error La referencia del input corresponde al elemento HTML que recibe el foco.
export const wrongRef = <Input ref={{ current: null } as RefObject<HTMLDivElement | null>} />;
export function useDraftContract() {
  useCreationDraft({ name: 'typed', userId: 'owner', enabled: true, values: { amount: '12.50' }, setters: {
    // @ts-expect-error Un borrador textual no puede restaurarse usando un setter booleano.
    amount: (value: boolean) => { void value; },
  } });
}
export async function responseContract() {
  const data = await (await uiFetch('/api/expenses?concept=Compra')).json();
  data.expenses.forEach(expense => {
    const amount: string | number = expense.amount;
    // @ts-expect-error Las fechas HTTP siguen siendo texto; no son objetos Date.
    const date: Date = expense.date;
    void [amount, date];
  });
  // @ts-expect-error La respuesta de gastos no contiene una colección de ingresos.
  const incomes: unknown[] = data.incomes;
  void incomes;
}
export async function installmentPaymentsContract() {
  const data = await (await uiFetch('/api/installment-purchases/payments?purchaseId=example')).json();
  if (data.receivable) {
    const balance: number = data.receivable.pendingBalance;
    const amount: string | number = data.receivable.originalAmount;
    void [balance, amount];
  }
  // @ts-expect-error El detalle de pagos contiene una compra y su cuenta, no el listado de compras.
  void data.purchases;
}
// @ts-expect-error Resolver un pago exige el corte y la evidencia del pago, no solo la acción.
export const incompletePayment: CaptureAction = { action: 'registerPayment' };
export const captureBalance = getCyclePaymentAmounts({ statementAmount: '1000', paidAmount: '250' });
// @ts-expect-error El estado de calendario sí exige las fechas reales del corte.
export const incompleteCalendarState = getCyclePaymentState({ statementAmount: '1000', paidAmount: '250' });

export function resourceStateContract(state: import('@/hooks/use-capture-resource').CaptureResourceState<{ id: string }>) {
  if (state.status === 'ready') { const id: string = state.data.id; void id; }
  if (state.status === 'idle') {
    // @ts-expect-error Sin consulta, todavía no existe contenido de la respuesta.
    void state.data.id;
  }
}
