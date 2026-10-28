import { captureFields, captureProposal } from './captureJson';
import type { CaptureInterpretation, CaptureNotice, ParseAmount, NotificationDate, CaptureKindInput } from '@/lib/captureTypes';
export const moneyParserKeys = ['nu.account-transfer.es.v1', 'bbva.atm-withdrawal.es.v1'];
export function moneyCaptureKind(movement: CaptureKindInput) {
  return ['MONEY_TRANSFER', 'CASH_WITHDRAWAL'].includes(captureProposal(movement.proposal)?.movementType ?? "") || moneyParserKeys.includes(movement.parserKey ?? "");
}
export function accountDebitNotice(movement: CaptureKindInput) { return movement.parserKey === 'bbva.account-charge.es.v1' && captureProposal(movement.proposal)?.movementType === 'ACCOUNT_DEBIT'; }

export function interpretMoneyNotice(event: CaptureNotice, parseAmount: ParseAmount, notificationDate: NotificationDate): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {}, title = fields['android.title'] || '', body = fields['android.bigText'] || fields['android.text'] || '';
  if (event.sourcePackage === 'com.nu.production' && title === 'Transferencia exitosa') {
    const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: moneyParserKeys[0]!, verified: true, proposal: { movementType: 'MONEY_TRANSFER' } };
    if ((fields['android.bigText'] && fields['android.text'] && fields['android.bigText'] !== fields['android.text']) || (fields['android.title.big'] && fields['android.title.big'] !== title)) return { ...base, reason: 'CONFLICTING_FIELDS' };
    const match = body.match(/^Enviaste \$([\d,.]+) a ([^\r\n]{1,160})\.$/), amount = match && parseAmount(match[1]!), date = notificationDate(event);
    if (!amount || !date) return { ...base, reason: 'INCOMPLETE_FORMAT' };
    return { ...base, reason: 'MONEY_POLICY_REQUIRED', proposal: { ...base.proposal, amount, ...date, destinationLabel: match[2]!, merchant: `Transferencia a ${match[2]!}` } };
  }
  // Detección conservadora para proponer el próximo retiro. Sin muestra real
  // revisada nunca habilita automatización: ni "cargo a cuenta" ni importe bastan.
  const text = [...new Set(Object.values(fields))].join('\n');
  if (event.sourcePackage !== 'com.bancomer.mbanking' || !/\bretir(?:o|aste)\b/i.test(text) || !/\b(?:efectivo|cajero|ATM)\b/i.test(text)) return null;
  const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: moneyParserKeys[1]!, verified: false, proposal: { movementType: 'CASH_WITHDRAWAL', merchant: 'Retiro de efectivo BBVA' } };
  if (/rechaz|cancel|fallid|no se pudo|c[oó]digo|solicitud|para retirar|USD|EUR/i.test(text)) return { ...base, reason: 'SPECIAL_MOVEMENT' };
  const amounts = [...new Set([...text.matchAll(/\$\s*([\d,]+\.\d{2})(?!\d)/g)].map(m => parseAmount(m[1]!)).filter(Boolean))];
  const aliases = [...new Set([...text.matchAll(/(?:cuenta|tarjeta|TDD)\s*\*{0,4}(\d{4})\b/gi)].map(m => m[1]!))];
  const date = notificationDate(event);
  if (amounts.length !== 1 || aliases.length !== 1 || !date || /comisi[oó]n|IVA/i.test(text)) return { ...base, reason: 'INCOMPLETE_FORMAT' };
  return { ...base, reason: 'WITHDRAWAL_SAMPLE_REQUIRED', proposal: { ...base.proposal, amount: amounts[0], accountLast4: aliases[0], ...date } };
}

// La cuenta se conserva tal como aparece (cuatro o cinco cifras), sin inferir
// destinatario ni recortar la terminación. La regla del usuario decide el gasto.
export function interpretBbvaAccountCharge(event: CaptureNotice, parseAmount: ParseAmount, notificationDate: NotificationDate): CaptureInterpretation | null {
  if (event.sourcePackage !== 'com.bancomer.mbanking') return null;
  const fields = captureFields(event.fields ?? {}) || {}, body = fields['android.bigText'] || fields['android.text'] || '';
  const old = body.match(/^Tienes un cargo a tu cuenta \*(\d{4,5}) de \$([\d,.]+)\. /);
  const short = body.match(/^Cargo a tu cuenta \*(\d{4,5}) de \$([\d,]+\.\d{2})\s*$/);
  const match = old || short;
  if (!match) return null;
  const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: 'bbva.account-charge.es.v1', verified: false, proposal: {} };
  if (fields['android.bigText'] && fields['android.text'] && !body.startsWith(fields['android.text'])) return { ...base, reason: 'CONFLICTING_FIELDS' };
  const text = Object.values(fields).join('\n');
  if (/\b(?:USD|EUR|d[oó]lares)\b/i.test(text)) return { ...base, reason: 'FOREIGN_CURRENCY' };
  if (/cancel|devol|revers|rechaz|no se (?:aplic[oó]|realiz[oó])/i.test(text)) return { ...base, reason: 'SPECIAL_MOVEMENT' };
  const amount = parseAmount(match[2]!);
  if (!amount || (body.match(/\$/g) || []).length !== 1) return { ...base, reason: 'INVALID_FIELDS' };
  return { ...base, reason: 'ACCOUNT_DEBIT_REVIEW', proposal: {
    movementType: 'ACCOUNT_DEBIT', merchant: 'Cargo BBVA', amount, accountSuffix: match[1]!,
    ...notificationDate(event), paymentEvidence: 'SOURCE_DEBIT_ONLY',
    missingFields: ['destination', 'card', 'currency', 'statementPeriod', 'operationDate'],
  } };
}
