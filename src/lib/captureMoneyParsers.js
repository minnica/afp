export const moneyParserKeys = ['nu.account-transfer.es.v1', 'bbva.atm-withdrawal.es.v1'];
export function moneyCaptureKind(movement) {
  return ['MONEY_TRANSFER', 'CASH_WITHDRAWAL'].includes(movement.proposal?.movementType) || moneyParserKeys.includes(movement.parserKey);
}
export function accountDebitNotice(movement) { return movement.parserKey === 'bbva.account-charge.es.v1' && movement.proposal?.movementType === 'ACCOUNT_DEBIT'; }

export function interpretMoneyNotice(event, parseAmount, notificationDate) {
  const fields = event.fields || {}, title = fields['android.title'] || '', body = fields['android.bigText'] || fields['android.text'] || '';
  if (event.sourcePackage === 'com.nu.production' && title === 'Transferencia exitosa') {
    const base = { parserKey: moneyParserKeys[0], verified: true, proposal: { movementType: 'MONEY_TRANSFER' } };
    if ((fields['android.bigText'] && fields['android.text'] && fields['android.bigText'] !== fields['android.text']) || (fields['android.title.big'] && fields['android.title.big'] !== title)) return { ...base, reason: 'CONFLICTING_FIELDS' };
    const match = body.match(/^Enviaste \$([\d,.]+) a ([^\r\n]{1,160})\.$/), amount = match && parseAmount(match[1]), date = notificationDate(event);
    if (!amount || !date) return { ...base, reason: 'INCOMPLETE_FORMAT' };
    return { ...base, reason: 'MONEY_POLICY_REQUIRED', proposal: { ...base.proposal, amount, ...date, destinationLabel: match[2], merchant: `Transferencia a ${match[2]}` } };
  }
  // Detección conservadora para proponer el próximo retiro. Sin muestra real
  // revisada nunca habilita automatización: ni "cargo a cuenta" ni importe bastan.
  const text = [...new Set(Object.values(fields))].join('\n');
  if (event.sourcePackage !== 'com.bancomer.mbanking' || !/\bretir(?:o|aste)\b/i.test(text) || !/\b(?:efectivo|cajero|ATM)\b/i.test(text)) return null;
  const base = { parserKey: moneyParserKeys[1], verified: false, proposal: { movementType: 'CASH_WITHDRAWAL', merchant: 'Retiro de efectivo BBVA' } };
  if (/rechaz|cancel|fallid|no se pudo|c[oó]digo|solicitud|para retirar|USD|EUR/i.test(text)) return { ...base, reason: 'SPECIAL_MOVEMENT' };
  const amounts = [...new Set([...text.matchAll(/\$\s*([\d,]+\.\d{2})(?!\d)/g)].map(m => parseAmount(m[1])).filter(Boolean))];
  const aliases = [...new Set([...text.matchAll(/(?:cuenta|tarjeta|TDD)\s*\*{0,4}(\d{4})\b/gi)].map(m => m[1]))];
  const date = notificationDate(event);
  if (amounts.length !== 1 || aliases.length !== 1 || !date || /comisi[oó]n|IVA/i.test(text)) return { ...base, reason: 'INCOMPLETE_FORMAT' };
  return { ...base, reason: 'WITHDRAWAL_SAMPLE_REQUIRED', proposal: { ...base.proposal, amount: amounts[0], accountLast4: aliases[0], ...date } };
}
