import { captureFields, captureProposal } from './captureJson';
import type { CaptureKindInput, CaptureInterpretation, CaptureNotice, NotificationDate, ParseAmount } from './captureTypes';
export const incomeParserKeys = ['bbva.payroll.es.v1', 'bbva.account-deposit.es.v1'];
export function incomeCaptureKind(value: CaptureKindInput) { return incomeParserKeys.includes(value.parserKey ?? '') || captureProposal(value.proposal).movementType === 'INCOME'; }

export function interpretIncomeNotice(event: CaptureNotice, amount: ParseAmount, notificationDate: NotificationDate): CaptureInterpretation | null {
  if (event.sourcePackage !== 'com.bancomer.mbanking') return null;
  const fields = captureFields(event.fields), body = fields['android.bigText'] || fields['android.text'] || '';
  // Nómina: gramática real observada, anonimizada en las pruebas. No trae importe.
  const payroll = body.match(/^Abono de n[oó]mina a TDD (\d{4}) (\d{1,2}) ([a-z]+) (\d{2}):(\d{2})h\s*$/i);
  // Candidato conservador: exige muestra propia registrada para automatizar.
  // No se presenta como formato bancario verificado por pruebas sintéticas.
  const deposit = body.match(/^(?:Tienes un (?:abono|dep[oó]sito) a tu cuenta|Abono a tu cuenta) \*(\d{4,5}) de \$([\d,.]+)(?:\. Esta información te ayuda a tener control en tus finanzas\. Abre para más detalles\.(?: \d{1,2} de [a-z]+ de \d{4}, \d{2}:\d{2} h)?|\s*)$/i);
  if (!payroll && !deposit) return null;
  const parserKey = payroll ? incomeParserKeys[0]! : incomeParserKeys[1]!;
  const proposal = { movementType: 'INCOME', incomeKind: payroll ? 'PAYROLL' : 'DEPOSIT', merchant: payroll ? 'Nómina BBVA' : 'Ingreso BBVA', accountSuffix: (payroll || deposit)![1]! };
  const base = { parserKey, verified: Boolean(payroll), proposal };
  if ((fields['android.bigText'] && fields['android.text'] && fields['android.bigText'] !== fields['android.text']) || (fields['android.title.big'] && fields['android.title.big'] !== fields['android.title'])) return { ...base, reason: 'CONFLICTING_FIELDS' };
  const date = notificationDate(event);
  if (!date) return { ...base, reason: 'INVALID_FIELDS' };
  if (payroll) {
    const month = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'].indexOf(payroll[3]!.toLowerCase()) + 1;
    const printed = `${date.date.slice(0, 4)}-${String(month).padStart(2, '0')}-${payroll[2]!.padStart(2, '0')}`;
    const parsedDay = new Date(`${printed}T12:00:00Z`);
    if (!month || Number(payroll[4]) > 23 || Number(payroll[5]) > 59 || !Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== printed || Math.abs(Date.parse(`${date.date}T12:00:00Z`) - parsedDay.getTime()) > 7 * 86400000) return { ...base, reason: 'INVALID_FIELDS' };
  }
  const value = deposit && amount(deposit[2]);
  if (deposit && !value) return { ...base, reason: 'INVALID_FIELDS' };
  return { ...base, reason: value ? 'INCOME_POLICY_REQUIRED' : 'INCOME_AMOUNT_REQUIRED', proposal: { ...proposal, ...date, ...(payroll ? { payrollPeriod: `${date.date.slice(0, 7)}:${Number(payroll[2]) <= 15 ? '1' : '2'}` } : {}), ...(value ? { amount: value } : {}), missingFields: value ? ['currency', 'account', 'incomeType'] : ['amount', 'currency', 'account', 'incomeType'] } };
}
