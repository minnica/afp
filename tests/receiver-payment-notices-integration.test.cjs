const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const fixtures = {
 bank: require('./fixtures/captures/banamex-card-payment.es.v1.json').event,
 mercado: require('./fixtures/captures/mercadopago-card-payment.es.v1.json').event,
 debit: require('./fixtures/captures/bbva-debit-card-charge.es.v1.json').event,
};
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('pagos Banamex/Mercado Pago: API real, reglas, saldos, aislamiento, concurrencia y duplicados', { skip: !connectionString }, async t => {
 const url = new URL(connectionString);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
 const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
 async function scenario(name, fn) {
  await t.test(name, async () => {
   const user = await db.user.create({data:{email:`receiver-${randomUUID()}@example.test`}});
   const other = await db.user.create({data:{email:`other-${randomUUID()}@example.test`}});
   try {
    const syncs = [];
    const load = sourceLoader({
     '@/lib/prisma':{prisma:db}, '@/lib/calendar/schedule':{scheduleCalendarSync:id=>syncs.push(id)},
     'next/server':{NextResponse:{json:(body,options={})=>({body:JSON.parse(JSON.stringify(body)),status:options.status||200,headers:new Headers(options.headers)})}},
     '@supabase/supabase-js':{createClient:()=>({auth:{getUser:async token=>({data:{user:token==='owner'?user:token==='other'?other:null}})}})},
    });
    const protocol=load('src/lib/captureProtocol.ts');
    const card = await db.card.create({data:{userId:user.id,name:'Banamex ficticia',usualCutDay:10,usualDueDay:30}});
    const mercado = await db.card.create({data:{userId:user.id,name:'Mercado ficticia',usualCutDay:10,usualDueDay:30}});
    const sibling = await db.card.create({data:{userId:user.id,name:'Segunda tarjeta',usualCutDay:10,usualDueDay:30}});
    const foreign = await db.card.create({data:{userId:other.id,name:'Tarjeta ajena',usualCutDay:10,usualDueDay:30}});
    const cycleData={userId:user.id,month:10,year:2026,startDate:new Date('2026-09-11'),cutDate:new Date('2026-10-10'),dueDate:new Date('2026-10-30')};
    const cycle = await db.cardCycle.create({data:{...cycleData,cardId:card.id,statementAmount:'123.45'}});
    const mpCycle = await db.cardCycle.create({data:{...cycleData,cardId:mercado.id,statementAmount:'67.89'}});
    const alias = await db.captureCardAlias.create({data:{userId:user.id,cardId:card.id,sourcePackage:fixtures.bank.sourcePackage,kind:'PHYSICAL',value:'0123',verifiedAt:new Date(),evidence:'Ficticia'}});
    await db.captureCardAlias.create({data:{userId:other.id,cardId:foreign.id,sourcePackage:fixtures.bank.sourcePackage,kind:'PHYSICAL',value:'9123',verifiedAt:new Date(),evidence:'Ficticia'}});
    const policies=[];
    for(const [ownCard,source] of [[card,'BANAMEX_NOTICE'],[mercado,'MERCADOPAGO_NOTICE']]) policies.push(await db.capturePaymentPolicy.create({data:{userId:user.id,cardId:ownCard.id,source,mode:'AUTOMATIC',acceptedAt:new Date()}}));
    const secret=randomBytes(32).toString('base64url');
    const device=await db.captureDevice.create({data:{userId:user.id,approvedAt:new Date(),secretHash:protocol.captureHash(secret),name:'Teléfono ficticio'}});
    const auth=`Capture ${device.id}.${secret}`;
    const routes={events:load('src/app/api/captures/events/route.ts'),cycles:load('src/app/api/card-cycles/route.ts'),cards:load('src/app/api/cards/route.ts'),movements:load('src/app/api/captures/movements/route.ts')};
    const event=(kind='bank',replacements=[])=>({...fixtures[kind],contractVersion:1,eventId:randomUUID(),notificationKeyHash:protocol.captureHash(randomUUID()),fields:Object.fromEntries(Object.entries(fixtures[kind].fields).map(([k,v])=>[k,replacements.reduce((text,[a,b])=>text.replaceAll(a,b),v)]))});
    const post=(input,authorization=auth)=>routes.events.POST(new Request('http://localhost/api/captures/events',{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify(input)}));
    const movement=async(input,deviceId=device.id)=>(await db.captureEvent.findUnique({where:{deviceId_eventId:{deviceId,eventId:input.eventId}},include:{movement:true}})).movement;
    const send=async input=>{const r=await post(input);assert.equal(r.status,200,JSON.stringify(r.body));return movement(input)};
    const readCycle=(id=cycle.id)=>db.cardCycle.findUnique({where:{id}});
    const request=(body={},query='',token='owner')=>({url:'http://localhost/api/test?'+query,headers:new Headers({authorization:'Bearer '+token}),json:async()=>body});
    const count=()=>db.cardCyclePayment.count({where:{userId:user.id}});
    await fn({db,user,other,load,card,mercado,sibling,foreign,cycle,mpCycle,alias,policies,device,auth,protocol,routes,event,post,movement,send,readCycle,request,count,syncs});
   }finally{await db.user.delete({where:{id:user.id}});await db.user.delete({where:{id:other.id}})}
  });
 }
 try {
  await scenario('ocho entregas y reintento: un abono por receptor, cortes pagados, crédito actualizado y cero gastos/ingresos',async c=>{
   const {db,user,routes,request,card,mercado,event,post,send,readCycle,mpCycle,count,load,syncs}=c;
   for(const ownCard of [card,mercado]) {
    const r=await routes.cards.PATCH(request({id:ownCard.id,action:'UPDATE_CREDIT_BALANCE',creditLimit:2000,usedBalance:1000,balanceAsOf:'2026-10-23',balanceCaptureId:randomUUID(),expectedBalanceCaptureId:null}));
    assert.equal(r.status,200,JSON.stringify(r.body));
   }
   const input=event();const replies=await Promise.all(Array.from({length:8},()=>post(input)));
   for(const r of replies){assert.equal(r.status,200);assert.deepEqual(r.body,replies[0].body)}
   assert.deepEqual((await post(input)).body,replies[0].body);
   const mp=await send(event('mercado'));assert.equal(mp.reason,'PAYMENT_AUTOMATIC');
   assert.equal(mp.correction.dateSource,'NOTIFICATION_POSTED_AT');
   assert.equal((await c.movement(input)).correction.dateSource,'BANK_OPERATION');
   assert.equal((await readCycle()).status,'PAID');assert.equal(String((await readCycle()).paidAmount),'123.45');
   assert.equal((await readCycle(mpCycle.id)).status,'PAID');assert.equal(await count(),2);
   assert.equal((await send(event('debit'))).reason,'ACCOUNT_DEBIT_REVIEW');
   const generic={...event('debit'),fields:{'android.title':'Aviso de cargo en tu cuenta','android.text':'Tienes un cargo a tu cuenta *0123 de $123.45. Resto ficticio.'}};
   assert.equal((await send(generic)).reason,'ACCOUNT_DEBIT_REVIEW');assert.equal(await count(),2);
   const response=await routes.cycles.GET(request({},'month=10&year=2026'));assert.equal(response.status,200);
   for(const row of response.body.cycles){assert.equal(row.paymentStatus,'PAID');assert.equal(row.pendingAmount,0)}
   const balances=(await routes.cards.GET(request())).body.cards;
   assert.equal(balances.find(r=>r.id===card.id).usedBalance,'876.55');assert.equal(balances.find(r=>r.id===mercado.id).usedBalance,'932.11');
   assert.equal(await db.dailyExpense.count({where:{userId:user.id}}),0);assert.equal(await db.income.count({where:{userId:user.id}}),0);
   assert.ok(syncs.length>=2&&syncs.every(id=>id===user.id));
   const config=await load('src/lib/captureConfiguration.ts').captureConfiguration(db,user.id);
   assert.ok(config.paymentPolicies.some(p=>p.source==='BANAMEX_NOTICE'));assert.ok(!config.parsers.some(p=>p.key==='banamex.card-payment.es.v1'));
  });
  await scenario('sin regla, en observación o sin aceptación: conserva el aviso sin sumar dinero',async c=>{
   await c.db.capturePaymentPolicy.delete({where:{id:c.policies[0].id}});
   assert.equal((await c.send(c.event())).reason,'PAYMENT_POLICY_REQUIRED');
   await c.db.capturePaymentPolicy.update({where:{id:c.policies[1].id},data:{mode:'OBSERVATION',acceptedAt:null}});
   assert.equal((await c.send(c.event('mercado'))).reason,'PAYMENT_POLICY_REQUIRED');assert.equal(await c.count(),0);
   await assert.rejects(c.load('src/lib/captureConfiguration.ts').configureCapture(c.db,c.user.id,{action:'paymentAutomation',id:c.policies[1].id,mode:'AUTOMATIC'}),e=>e.status===409);
   await assert.rejects(c.load('src/lib/captureConfiguration.ts').configureCapture(c.db,c.user.id,{action:'automation',cardId:c.card.id,parserKey:'banamex.card-payment.es.v1',mode:'AUTOMATIC'}),e=>e.status===409);
  });
  await scenario('Banamex: alias ausente, sin verificar o compartido entre tarjetas impide elegir por importe',async c=>{
   await c.db.captureCardAlias.update({where:{id:c.alias.id},data:{verifiedAt:null}});
   assert.equal((await c.send(c.event())).reason,'UNVERIFIED_ALIAS');
   await c.db.captureCardAlias.update({where:{id:c.alias.id},data:{verifiedAt:new Date()}});
   await c.db.captureCardAlias.create({data:{userId:c.user.id,cardId:c.sibling.id,sourcePackage:fixtures.bank.sourcePackage,kind:'PHYSICAL',value:'9123',verifiedAt:new Date()}});
   assert.equal((await c.send(c.event())).reason,'AMBIGUOUS_CARD');
   assert.equal((await c.send(c.event('bank',[['JOY BANAMEX 123','JOY BANAMEX 999']]))).reason,'UNKNOWN_CARD');assert.equal(await c.count(),0);
  });
  await scenario('reglas de otra Banamex y dos reglas Mercado Pago no asignan una tarjeta por su saldo',async c=>{
   await c.db.capturePaymentPolicy.update({where:{id:c.policies[0].id},data:{cardId:c.sibling.id}});
   assert.equal((await c.send(c.event())).reason,'PAYMENT_POLICY_REQUIRED');
   await c.db.capturePaymentPolicy.create({data:{userId:c.user.id,cardId:c.sibling.id,source:'MERCADOPAGO_NOTICE',mode:'AUTOMATIC',acceptedAt:new Date()}});
   assert.equal((await c.send(c.event('mercado'))).reason,'PAYMENT_POLICY_REQUIRED');assert.equal(await c.count(),0);
  });
  await scenario('Banamex: abono parcial deja saldo y dos abonos distintos concurrentes liquidan una vez',async c=>{
   await c.db.cardCycle.update({where:{id:c.cycle.id},data:{statementAmount:'300'}});
   assert.equal((await c.send(c.event())).reason,'PAYMENT_AUTOMATIC');
   const state=c.load('src/lib/calculations/cardCyclePayments.ts').getCyclePaymentState(await c.readCycle());
   assert.equal(state.paymentStatus,'PARTIALLY_PAID');assert.equal(state.pendingAmount,176.55);
   await Promise.all([c.send(c.event('bank',[['123.45','100.00']])),c.send(c.event('bank',[['123.45','76.55']]))]);
   assert.equal((await c.readCycle()).status,'PAID');assert.equal(String((await c.readCycle()).paidAmount),'300');assert.equal(await c.count(),3);
  });
  await scenario('Mercado Pago total inconsistente, exceso y pagos manuales ya incluidos requieren revisión',async c=>{
   assert.equal((await c.send(c.event('mercado',[['67.89','50.00']]))).reason,'PAYMENT_TOTAL_MISMATCH');
   assert.equal((await c.send(c.event('mercado',[['67.89','100.00']]))).reason,'PAYMENT_EXCESS_REVIEW');
   await c.db.cardCycle.update({where:{id:c.cycle.id},data:{paidAmount:10,paidAt:new Date('2026-10-23')}});
   assert.equal((await c.send(c.event())).reason,'PAYMENT_MANUAL_TOTAL');assert.equal(await c.count(),0);
  });
  await scenario('sin estado capturado, dos cortes pendientes o corte futuro no se asigna un período',async c=>{
   await c.db.cardCycle.update({where:{id:c.cycle.id},data:{statementAmount:null}});
   assert.equal((await c.send(c.event())).reason,'PAYMENT_CYCLE_REQUIRED');
   await c.db.cardCycle.update({where:{id:c.cycle.id},data:{statementAmount:123.45,cutDate:new Date('2026-11-10')}});
   assert.equal((await c.send(c.event())).reason,'PAYMENT_CYCLE_REQUIRED');
   await c.db.cardCycle.create({data:{userId:c.user.id,cardId:c.mercado.id,month:9,year:2026,startDate:new Date('2026-08-11'),cutDate:new Date('2026-09-10'),dueDate:new Date('2026-09-30'),statementAmount:10}});
   assert.equal((await c.send(c.event('mercado'))).reason,'PAYMENT_CYCLE_REQUIRED');assert.equal(await c.count(),0);
  });
  await scenario('otro teléfono o UUID, mismo importe cercano: no duplica; actualización del aviso con otro importe se revisa',async c=>{
   await c.db.cardCycle.update({where:{id:c.cycle.id},data:{statementAmount:500}});
   const input=c.event();await c.send(input);
   const secret=randomBytes(32).toString('base64url');const second=await c.db.captureDevice.create({data:{userId:c.user.id,approvedAt:new Date(),secretHash:c.protocol.captureHash(secret),name:'Otro teléfono'}});
   const duplicate=c.event();assert.equal((await c.post(duplicate,`Capture ${second.id}.${secret}`)).status,200);
   assert.equal((await c.movement(duplicate,second.id)).reason,'PAYMENT_POSSIBLE_DUPLICATE');
   assert.equal((await c.send({...c.event('bank',[['123.45','50.00']]),notificationKeyHash:input.notificationKeyHash})).reason,'NOTIFICATION_REVISION');
   assert.equal(await c.count(),1);assert.equal(String((await c.readCycle()).paidAmount),'123.45');
   const next={...c.event('bank',[['123.45','50.00'],['00:10:00 AM','00:25:00 AM'],['001234','001235'],['654321','654322']]),notificationKeyHash:input.notificationKeyHash,postedAt:'2026-10-23T06:25:03Z',receivedAt:'2026-10-23T06:25:04Z'};
   assert.equal((await c.send(next)).reason,'PAYMENT_AUTOMATIC');assert.equal(await c.count(),2);
  });
  await scenario('comprobante BBVA posterior al aviso recibido conserva revisión y no suma el mismo pago',async c=>{
   await c.db.cardCycle.update({where:{id:c.cycle.id},data:{statementAmount:500}});await c.send(c.event());
   await c.db.capturePaymentPolicy.create({data:{userId:c.user.id,cardId:c.card.id,source:'BBVA_RECEIPT',destinationLast4:'0009',mode:'AUTOMATIC',acceptedAt:new Date()}});
   const text=require('./fixtures/captures/bbva-payment-receipt.es.v1.json').text;
   const input={...c.event(),sourcePackage:'com.garatachia.afp.paymentreceipts',fields:{'receipt.text':text,'receipt.contentHash':c.protocol.captureHash(text),'receipt.mimeType':'image/png'}};
   const result=await c.load('src/lib/captureService.ts').receiveCaptureEvent(c.db,{id:c.device.id,secretHash:c.device.secretHash},input);
   const row=await c.db.captureEvent.findUnique({where:{id:result.event.id},include:{movement:true}});
   assert.equal(row.movement.reason,'PAYMENT_POSSIBLE_DUPLICATE');assert.equal(await c.count(),1);
  });
  await scenario('revertir conserva recibo; reenvío y aviso equivalente no vuelven a aplicar el abono',async c=>{
   const input=c.event(),m=await c.send(input);
   await c.load('src/lib/captureProcessing.ts').resolveCaptureMovement(c.db,c.user.id,{id:m.id,action:'reversePayment'});
   assert.equal(Number((await c.readCycle()).paidAmount),0);
   await c.post(input);assert.equal(Number((await c.readCycle()).paidAmount),0);
   assert.equal((await c.send(c.event())).reason,'PAYMENT_POSSIBLE_DUPLICATE');assert.equal(Number((await c.readCycle()).paidAmount),0);
  });
  await scenario('pausa, credenciales inválidas y propietario ajeno conservan el aislamiento',async c=>{
   assert.equal((await c.post(c.event(),'')).status,401);assert.equal((await c.post(c.event(),'Capture invalid')).status,401);
   await c.db.captureDevice.update({where:{id:c.device.id},data:{pausedAt:new Date()}});
   assert.equal((await c.post(c.event())).status,403);
   await c.db.captureDevice.update({where:{id:c.device.id},data:{pausedAt:null}});
   assert.equal((await c.post({...c.event(),userId:c.other.id})).status,400);
   const m=await c.send(c.event());
   const wrong=await c.routes.movements.PATCH(new Request('http://localhost/api/captures/movements',{method:'PATCH',headers:{authorization:'Bearer other','Content-Type':'application/json'},body:JSON.stringify({id:m.id,action:'reversePayment'})}));
   assert.equal(wrong.status,404);assert.equal((await c.readCycle()).status,'PAID');
   await assert.rejects(c.load('src/lib/captureConfiguration.ts').configureCapture(c.db,c.other.id,{action:'paymentAutomation',id:c.policies[0].id,mode:'OBSERVATION'}),e=>e.status===404);
  });
  await scenario('fallo después de crear el abono revierte evento, recibo y total en PostgreSQL',async c=>{
   const broken={$transaction:op=>c.db.$transaction(tx=>op(new Proxy(tx,{get(target,key){if(key==='cardCycle')return new Proxy(target.cardCycle,{get(model,method){if(method==='update')return async()=>{throw Error('Fallo de persistencia simulado')};return model[method]}});return target[key]}})))};
   await assert.rejects(c.load('src/lib/captureService.ts').receiveCaptureEvent(broken,{id:c.device.id,secretHash:c.device.secretHash},c.event()),/Fallo de persistencia simulado/);
   assert.equal(await c.count(),0);assert.equal(await c.db.captureEvent.count({where:{userId:c.user.id}}),0);assert.equal((await c.readCycle()).paidAmount,null);
  });
  await scenario('activar no reprocesa antiguos; reinterpretar conserva historia y tampoco registra dinero',async c=>{
   await c.db.capturePaymentPolicy.update({where:{id:c.policies[0].id},data:{mode:'OBSERVATION'}});
   const input=c.event(),m=await c.send(input);
   await c.load('src/lib/captureConfiguration.ts').configureCapture(c.db,c.user.id,{action:'paymentAutomation',id:c.policies[0].id,mode:'AUTOMATIC'});
   await c.post(input);assert.equal(await c.count(),0);
   const interpreted=await c.load('src/lib/captureProcessing.ts').resolveCaptureMovement(c.db,c.user.id,{id:m.id,action:'reinterpret'});
   assert.equal(interpreted.reason,'PAYMENT_REVIEW');assert.equal(interpreted.analysisHistory.length,1);assert.equal(await c.count(),0);
   assert.equal((await c.send(c.event())).reason,'PAYMENT_AUTOMATIC');assert.equal(await c.count(),1);
  });
 }finally{await db.$disconnect()}
});
