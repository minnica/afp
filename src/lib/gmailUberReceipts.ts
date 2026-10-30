import type { CaptureInterpretation, CaptureNotice, OperationTime, ParseAmount } from './captureTypes';
import { captureFields } from './captureJson';

export const uberReceiptParserKey = 'gmail.uber-receipt.es.v1';
const clean = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ').replace(/\r/g, '');

// Gmail is a mailbox, not a bank. Never admit unrelated emails to the queue.
export function isUberGmailNotice(fields: Record<string, string>) {
  return [fields['android.title'], fields['android.title.big']].some(value => value === 'Recibos de Uber')
    && Object.values(fields).some(value => /^Tu viaje del [^\n]{1,120} con Uber(?:\n|$)/m.test(clean(value)));
}

export function parseGmailUberReceipt(event: CaptureNotice, amount: ParseAmount, operationTime: OperationTime): CaptureInterpretation {
  const fields = captureFields(event.fields ?? {});
  const base = { parserKey: uberReceiptParserKey, verified: true, proposal: {} };
  if (!isUberGmailNotice(fields)) return { ...base, reason: 'UBER_RECEIPT_INCOMPLETE' };
  const body = clean(fields['android.bigText'] || fields['android.text'] || '');
  const totals = [...body.matchAll(/\bTotal\s*,?\s*MXN\s+([\d,.]+)/g)].map(match => amount(match[1]));
  const dates = [...body.matchAll(/(\d{2})\/(\d{2})\/(20\d{2})\s*[,\.]?\s*(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/gi)]
    .map(match => {
      const hour = Number(match[4]);
      if (hour < 1 || hour > 12) return null;
      const converted = hour % 12 + (match[6]!.toLowerCase() === 'p' ? 12 : 0);
      return operationTime(`${match[1]}/${match[2]}/${match[3]} ${String(converted).padStart(2, '0')}:${match[5]}:00`);
    });
  if (!totals.length || !dates.length || totals.some(value => !value) || dates.some(value => !value)) {
    return { ...base, reason: 'UBER_RECEIPT_INCOMPLETE' };
  }
  const total = totals[0]!, date = dates[0]!;
  if (new Set(totals).size !== 1 || new Set(dates.map(value => value?.operationAt)).size !== 1) return { ...base, reason: 'CONFLICTING_FIELDS' };
  if (/\b(?:USD|EUR|US\$)\b/.test(body)) return { ...base, reason: 'FOREIGN_CURRENCY' };
  if (!Number.isFinite(new Date(event.receivedAt).getTime()) || new Date(date.operationAt).getTime() > new Date(event.receivedAt).getTime() + 300000) {
    return { ...base, reason: 'FUTURE_OPERATION' };
  }
  const suffixes = [...body.matchAll(/\b(?:Visa|Mastercard|American Express)\s+[•*]{2,4}(\d{4})\b/g)].map(match => match[1]!);
  if (new Set(suffixes).size > 1) return { ...base, reason: 'AMBIGUOUS_CARD' };
  const tips = [...body.matchAll(/Monto\s+propina\s+MXN\s+([\d,.]+)/gi)].map(match => amount(match[1]));
  if (tips.some(value => !value) || new Set(tips).size > 1 || (tips[0] && Number(tips[0]) >= Number(total))) return { ...base, reason: 'CONFLICTING_FIELDS' };
  const updated = /Gracias por el monto extra|Monto\s+propina/.test(body);
  return { ...base, reason: suffixes.length ? 'PURCHASE' : 'UBER_RECEIPT_CARD_REQUIRED', proposal: {
    ...date, dateSource: 'RECEIPT_OPERATION', amount: total, currency: 'MXN', merchant: 'Uber',
    ...(suffixes[0] ? { printedAlias: { value: suffixes[0], digits: 4 } } : {}),
    uberReceipt: { tripAt: date.operationAt, updated, ...(tips[0] ? { tipAmount: tips[0] } : {}) },
    missingFields: suffixes.length ? [] : ['card'],
  } };
}
