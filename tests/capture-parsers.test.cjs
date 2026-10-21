const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const { captureAmount, captureOperationTime, interpretCapture, captureParsers } = sourceLoader()('src/lib/captureParsers.js');
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
 for(const parser of captureParsers){const result=interpretCapture(fixture(parser.sourcePackage));assert.equal(result.reason,'PURCHASE');assert.equal(result.parserKey,parser.key);assert.equal(result.verified,false);assert.equal(result.proposal.amount,'1234.50');assert.equal(result.proposal.alias.value,'0123');assert.equal(result.proposal.date,'2026-10-21');}
});
test('analizadores: desconocidos, importes incompletos y campos contradictorios nunca admiten una compra',()=>{
 assert.equal(interpretCapture(fixture('mx.hsbc.hsbcmexico')).reason,'UNKNOWN_FORMAT');
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
