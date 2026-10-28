const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const { captureAmount, captureOperationTime, interpretCapture, captureParsers } = sourceLoader()('src/lib/captureParsers.ts');
const fixture = (sourcePackage='com.bancomer.mbanking', fields={}) => ({sourcePackage, receivedAt:'2026-10-21T23:59:00Z',fields:{
 'android.title':sourcePackage==='com.bancomer.mbanking'?'Compra aprobada':'Pago realizado',
 'android.text':`Importe: MXN 1,234.50\nComercio: COMERCIO FICTICIO\nTarjeta ${sourcePackage==='com.bancomer.mbanking'?'física':'Wallet'}: *0123\nFecha: 21/10/2026 13:14:15\nReferencia bancaria: FICTICIA-00001`,...fields}});

test('analizadores: importes exactos sin sumar ni convertir mediante punto flotante',()=>{
 for(const [input,expected] of [['0.01','0.01'],['1,234.50','1234.50'],['9999999999.99','9999999999.99'],['0001.00','1.00']])assert.equal(captureAmount(input),expected);
 for(const input of ['0.00','-1.00','10','1.001','1e2','1,23.00','10000000000.00',12.34,null])assert.equal(captureAmount(input),null);
});
test('analizadores: fecha de operación México, día bancario independiente de recepción, calendario y DST',()=>{
 const time=captureOperationTime('20/10/2026 23:59:00');assert.equal(time.operationAt,'2026-10-21T05:59:00.000Z');assert.equal(time.date,'2026-10-20');
 for(const date of ['31/02/2026 12:00:00','29/02/2025 12:00:00','21/10/2026 25:00:00','03/04/2022 02:30:00','31/10/2021 01:30:00'])assert.equal(captureOperationTime(date),null,date);
 assert.ok(captureOperationTime('29/02/2024 12:00:00'));
});
test('analizadores: BBVA y Wallet sintéticos conservan tipo, referencia, ceros iniciales y versión sin afirmar cobertura real',()=>{
 for(const parser of captureParsers.filter(parser=>!parser.evidence)){const result=interpretCapture(fixture(parser.sourcePackage));assert.equal(result.reason,'PURCHASE');assert.equal(result.parserKey,parser.key);assert.equal(result.verified,false);assert.equal(result.proposal.amount,'1234.50');assert.equal(result.proposal.alias.value,'0123');assert.equal(result.proposal.date,'2026-10-21');}
});
test('BBVA débito: cargo a cuenta confirmado fuera del piloto no propone una compra de crédito',()=>{
 const result=interpretCapture({sourcePackage:'com.bancomer.mbanking',receivedAt:'2026-10-21T23:00:00Z',fields:{'android.title':'Aviso de cargo en tu cuenta','android.text':'Tienes un cargo a tu cuenta *0123 de $123.45. Resto ficticio para anonimizar el aviso.'}});
 assert.equal(result.parserKey,'bbva.account-charge.es.v1');assert.equal(result.reason,'ACCOUNT_DEBIT_REVIEW');assert.equal(result.verified,false);
 assert.equal(result.proposal.movementType,'ACCOUNT_DEBIT');assert.equal(result.proposal.amount,'123.45');
 for(const field of ['alias','cardId','date','currency','operationAt','destination','statementPeriod'])assert.equal(result.proposal[field],undefined);
 for(const sourcePackage of ['com.nu.production','com.google.android.apps.walletnfcrel'])assert.equal(interpretCapture({sourcePackage,fields:{'android.text':'Tienes un cargo a tu cuenta *0123 de $123.45. Resto ficticio.'}}).reason,'UNKNOWN_FORMAT');
});
test('BBVA incompleto: texto contradictorio, importe inválido y movimiento especial no proponen una compra',()=>{
 const event={sourcePackage:'com.bancomer.mbanking',fields:{'android.text':'Tienes un cargo a tu cuenta *0123 de $123.45. Resto ficticio.'}};
 assert.equal(interpretCapture({...event,fields:{...event.fields,'android.bigText':event.fields['android.text'].replace('123.45','999.99')}}).reason,'CONFLICTING_FIELDS');
 assert.equal(Object.keys(interpretCapture({...event,fields:{'android.text':event.fields['android.text'].replace('123.45','1,23.45')}}).proposal).length,0);
 assert.equal(interpretCapture({...event,fields:{...event.fields,'android.subText':'devolución'}}).reason,'SPECIAL_MOVEMENT');
});
test('analizadores: desconocidos, importes incompletos y campos contradictorios nunca admiten una compra',()=>{
 assert.equal(interpretCapture(fixture('mx.hsbc.hsbcmexico')).reason,'UNKNOWN_FORMAT');
 assert.equal(interpretCapture({sourcePackage:'com.bancomer.mbanking',fields:{'android.text':'Aviso desconocido sin título'}}).reason,'UNKNOWN_FORMAT');
 for(const text of ['Compra aprobada por $123.45',fixture().fields['android.text']+'\nOtro importe: 100.00','',fixture().fields['android.text'].replace('MXN','MX$')])assert.equal(interpretCapture(fixture(undefined,{'android.text':text})).reason,'INCOMPLETE_FORMAT');
 assert.equal(interpretCapture(fixture(undefined,{'android.bigText':'Otro cuerpo'})).reason,'CONFLICTING_FIELDS');
 assert.equal(interpretCapture(fixture(undefined,{'android.text':fixture().fields['android.text'].replace('física','Wallet')})).reason,'INVALID_CARD_KIND');
});
test('analizadores: MSI, retenciones, devoluciones, cancelaciones, abonos, rechazos, pedidos, promociones y OTP van a revisión',()=>{
 for(const marker of ['MSI','preautorización','retención','devolución','reembolso','cancelación','abono','rechazado','envío','pedido recibido','promoción','código de acceso'])assert.equal(interpretCapture(fixture(undefined,{'android.subText':marker})).reason,'SPECIAL_MOVEMENT',marker);
 assert.equal(interpretCapture(fixture(undefined,{'android.text':fixture().fields['android.text'].replace('MXN','USD')})).reason,'FOREIGN_CURRENCY');
});
test('analizadores: publicación y recepción no completan fecha ausente y una operación futura queda bloqueada',()=>{
 const input=fixture();input.fields['android.text']=input.fields['android.text'].replace('Fecha: 21/10/2026 13:14:15','Fecha: 22/10/2026 13:14:15');assert.equal(interpretCapture(input).reason,'FUTURE_OPERATION');
 input.fields['android.text']=input.fields['android.text'].replace(/\nFecha:[^\n]+/,'');assert.equal(interpretCapture(input).reason,'INCOMPLETE_FORMAT');
});
