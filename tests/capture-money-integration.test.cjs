// Importes, identidades y cuentas ficticios; no contiene datos financieros personales.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {randomUUID,randomBytes}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const {sourceLoader}=require('./helpers/load-source.cjs');
const connectionString=process.env.AFP_TEST_DATABASE_URL;
test('captura de cuentas: transferencias Nu, débito confirmado y retiros sin duplicar dinero', {skip:!connectionString}, async t=>{
 const url=new URL(connectionString);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&/^\/afp_test\w*$/.test(url.pathname)&&!url.search);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString})});
 const users=await Promise.all(['a','b'].map(x=>db.user.create({data:{email:`money-capture-${x}-${randomUUID()}@example.test`}}))),[user,other]=users;
 const load=sourceLoader({'@/lib/prisma':{prisma:db},'@/lib/calendar/schedule':{scheduleCalendarSync(){}},'next/server':{NextResponse:{json:(body,opts={})=>({body:JSON.parse(JSON.stringify(body)),status:opts.status||200})}},'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async token=>({data:{user:token==='owner'?user:token==='other'?other:null}})}})}});
 const protocol=load('src/lib/captureProtocol.js'),service=load('src/lib/captureService.js'),processing=load('src/lib/captureProcessing.js');
 const configuration=load('src/lib/captureConfiguration.js'),money=load('src/lib/money/service.ts'),sources=load('src/lib/money/sources.ts');
 const movementsRoute=load('src/app/api/captures/movements/route.js'),expenseRoute=load('src/app/api/expenses/route.js');
 const createAccount=(owner,name,value)=>db.moneyAccount.create({data:{userId:owner.id,name,kind:'BANK',openingBalance:value,asOf:new Date('2026-10-24'),baseline:{}}});
 const nu=await createAccount(user,'Nu QA',10000),bbva=await createAccount(user,'BBVA QA',1000),foreign=await createAccount(other,'Ajena QA',50);
 const device=await db.captureDevice.create({data:{userId:user.id,name:'Ficticio',approvedAt:new Date(),secretHash:protocol.captureHash(randomBytes(32).toString('hex'))}}),credential={id:device.id,secretHash:device.secretHash};
 const make=(sourcePackage,fields,postedAt='2026-10-24T23:00:00Z',key=randomUUID())=>protocol.validateCaptureEvent({contractVersion:1,eventId:randomUUID(),sourcePackage,fields,notificationKeyHash:protocol.captureHash(key),postedAt,receivedAt:'2026-10-24T23:59:00Z'});
 const nuEvent=(amount,...rest)=>make('com.nu.production',{'android.title':'Transferencia exitosa','android.text':`Enviaste $${amount} a BBVA DEBITO.`},...rest);
 const debitEvent=amount=>make('com.bancomer.mbanking',{'android.title':'Aviso de cargo en tu cuenta','android.text':`Tienes un cargo a tu cuenta *0123 de $${amount}. Esta información te ayuda a tener control en tus finanzas.`});
 const send=async e=>{await service.receiveCaptureEvent(db,credential,e);return(await db.captureEvent.findUnique({where:{deviceId_eventId:{deviceId:device.id,eventId:e.eventId}},include:{movement:true}})).movement};
 const request=(body,query='',token='owner',method='PATCH')=>new Request(`http://localhost/api/captures/movements?${query}`,{method,headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const balances=async()=>sources.accountBalances((await money.loadMoneyData(db,user.id)).accounts,sources.buildSources(await money.loadMoneyData(db,user.id),'2026-10-26').events,'2026-10-26');
 const policy={action:'moneyPolicy',kind:'NU_TRANSFER',fromAccountId:nu.id,toAccountId:bbva.id,destinationLabel:'BBVA DEBITO',currency:'MXN',datePolicy:'NOTIFICATION_POSTED_AT',mode:'AUTOMATIC'};
 let transfer,firstExpense;
 try{
  await t.test('reglas son explícitas, aisladas y no se infieren de nombres',async()=>{
   await assert.rejects(configuration.configureCapture(db,user.id,{...policy,toAccountId:foreign.id}),e=>e.status===404);
   await assert.rejects(configuration.configureCapture(db,user.id,{...policy,toAccountId:nu.id}),e=>e.status===400);
   const before=await send(nuEvent('1,200.00'));assert.equal(before.status,'REVIEW');assert.equal(before.reason,'MONEY_POLICY_REQUIRED');assert.equal(await db.moneyTransfer.count({where:{userId:user.id}}),0);
   await configuration.configureCapture(db,user.id,policy);
   const reinterpreted=await processing.resolveCaptureMovement(db,user.id,{id:before.id,action:'reinterpret'});assert.equal(reinterpreted.reason,'MONEY_OBSERVATION');assert.equal(await db.moneyTransfer.count({where:{userId:user.id}}),0);
   transfer=await processing.resolveCaptureMovement(db,user.id,{id:before.id,action:'registerMoneyTransfer',money:{fromAccountId:nu.id,toAccountId:bbva.id,amount:'1200.00',date:'2026-10-24',concept:'Transferencia QA',currency:'MXN'}});assert.equal(transfer.status,'REGISTERED');
  });
  await t.test('nuevas transferencias e identidades concurrentes se aplican una sola vez',async()=>{
   const e=nuEvent('250.00');const results=await Promise.all(Array.from({length:4},()=>send(e)));assert.ok(results.every(x=>x.status==='REGISTERED'));
   assert.equal(await db.moneyTransfer.count({where:{userId:user.id}}),2);
   const replay=await send({...e,eventId:randomUUID()});assert.equal(replay.id,results[0].id);assert.equal(await db.moneyTransfer.count({where:{userId:user.id}}),2);
   const sameAmount=await send(nuEvent('250.00','2026-10-24T23:01:00Z'));assert.equal(sameAmount.reason,'MONEY_POSSIBLE_DUPLICATE');
   const b=await balances();assert.equal(Number(b.find(a=>a.id===nu.id).balance),8550);assert.equal(Number(b.find(a=>a.id===bbva.id).balance),2450);
   assert.equal(await db.income.count({where:{userId:user.id}}),0);assert.equal(await db.dailyExpense.count({where:{userId:user.id}}),0);
  });
  await t.test('solo los tres cargos confirmados se convierten en gasto de débito',async()=>{
   for(const amount of ['115.00','235.00','35.00']){
    const row=await send(debitEvent(amount));assert.equal(row.reason,'ACCOUNT_DEBIT_REVIEW');
    const input={id:row.id,action:'registerDebitExpense',money:{fromAccountId:bbva.id,amount,date:'2026-10-24',concept:'Compra QA',currency:'MXN'}};
    const result=await processing.resolveCaptureMovement(db,user.id,input);await processing.resolveCaptureMovement(db,user.id,input);firstExpense ||= result;
   }
   const rows=await db.dailyExpense.findMany({where:{userId:user.id}});assert.equal(rows.length,3);assert.ok(rows.every(r=>r.paymentMethod==='DEBIT'&&r.debitAccountId===bbva.id&&r.cardId===null));
   assert.equal(await db.cardCyclePayment.count({where:{userId:user.id}}),0);
   const next=await send(debitEvent('75.00'));assert.equal(next.status,'REVIEW');assert.equal(next.expenseId,null);assert.equal(await db.dailyExpense.count({where:{userId:user.id}}),3);
   const b=await balances();assert.equal(Number(b.find(a=>a.id===bbva.id).balance),2065);
  });
  await t.test('retiro manual idempotente disminuye la cuenta sin inventar aviso o gasto',async()=>{
   const count=await db.captureEvent.count({where:{userId:user.id}}),operationId=randomUUID();
   const payload={action:'WITHDRAWAL',operationId,accountId:bbva.id,amount:'880.42',date:'2026-10-24',concept:'Retiro QA'};
   const a=await money.mutateMoney(db,user.id,payload,'2026-10-26'),b=await money.mutateMoney(db,user.id,payload,'2026-10-26');assert.equal(a.id,b.id);
   assert.equal(await db.captureEvent.count({where:{userId:user.id}}),count);assert.equal(await db.dailyExpense.count({where:{userId:user.id}}),3);
   const accounts=await balances();assert.equal(Number(accounts.find(a=>a.id===bbva.id).balance),1184.58);
   assert.equal(accounts.reduce((n,a)=>n+Number(a.balance),0),9734.58);
   await money.mutateMoney(db,user.id,{action:'REVERSE_WITHDRAWAL',operationId:randomUUID(),id:a.id},'2026-10-26');assert.equal(Number((await balances()).find(a=>a.id===bbva.id).balance),2065);
  });
  await t.test('retiro futuro necesita muestra explícita comprobada; nunca se usa el cargo genérico',async()=>{
   const rule={action:'moneyPolicy',kind:'BBVA_WITHDRAWAL',fromAccountId:bbva.id,accountLast4:'0123',destinationLabel:'',currency:'MXN',datePolicy:'NOTIFICATION_POSTED_AT',mode:'AUTOMATIC'};
   await assert.rejects(configuration.configureCapture(db,user.id,rule),e=>e.status===409);
   await configuration.configureCapture(db,user.id,{...rule,mode:'OBSERVATION'});
   const notice=a=>make('com.bancomer.mbanking',{'android.title':'Retiro de efectivo','android.text':`Retiraste $${a} de tu cuenta *0123.`});
   const sample=await send(notice('100.00'));assert.equal(sample.status,'REVIEW');assert.equal(await db.moneyWithdrawal.count({where:{userId:user.id,reversedAt:null}}),0);
   await processing.resolveCaptureMovement(db,user.id,{id:sample.id,action:'registerMoneyWithdrawal',money:{fromAccountId:bbva.id,amount:'100.00',date:'2026-10-24',concept:'Retiro observado QA',currency:'MXN'}});
   await configuration.configureCapture(db,user.id,{...rule,verifiedMovementId:sample.id});
   const automatic=await send(notice('80.00'));assert.equal(automatic.status,'REGISTERED');assert.equal(automatic.reason,'MONEY_WITHDRAWAL_REGISTERED');
   const generic=await send(debitEvent('880.42'));assert.equal(generic.reason,'ACCOUNT_DEBIT_REVIEW');assert.equal(generic.status,'REVIEW');
   const samplePosting=await db.captureMoneyPosting.findUnique({where:{movementId:sample.id}});
   await money.mutateMoney(db,user.id,{action:'REVERSE_WITHDRAWAL',operationId:randomUUID(),id:samplePosting.withdrawalId},'2026-10-26');
   const paused=await db.captureMoneyPolicy.findUnique({where:{userId_kind_destinationLabel:{userId:user.id,kind:'BBVA_WITHDRAWAL',destinationLabel:''}}});assert.equal(paused.mode,'OBSERVATION');assert.equal(paused.verifiedMovementId,null);
   assert.equal((await send(notice('15.00'))).reason,'MONEY_OBSERVATION');
  });
  await t.test('una regla no registra avisos incompletos, contradictorios o anteriores a la referencia',async()=>{
   const before=await db.moneyTransfer.count({where:{userId:user.id}});
   const old=await send(nuEvent('12.30','2026-10-23T18:00:00Z'));assert.equal(old.reason,'MONEY_BEFORE_REFERENCE');
   const conflicting=nuEvent('12.30');conflicting.fields['android.bigText']='Enviaste $12.31 a BBVA DEBITO.';
   assert.equal((await send(conflicting)).reason,'CONFLICTING_FIELDS');
   const bad=nuEvent('12.30');bad.fields['android.text']='Tu transferencia sigue en proceso.';assert.equal((await send(bad)).reason,'INCOMPLETE_FORMAT');
   assert.equal(await db.moneyTransfer.count({where:{userId:user.id}}),before);
  });
  await t.test('gastos de débito conservan edición, borrado, cuenta, aislamiento e historial',async()=>{
   const category=await db.category.findFirst({where:{userId:user.id,name:'Por clasificar'}}),before=Number((await balances()).find(a=>a.id===bbva.id).balance);
   const payload={date:'2026-10-24',paymentMethod:'DEBIT',debitAccountId:bbva.id,amount:'9.50',concept:'Compra manual QA',categoryId:category.id};
   assert.equal((await expenseRoute.POST(request({...payload,debitAccountId:foreign.id},'','owner','POST'))).status,404);
   const created=await expenseRoute.POST(request(payload,'','owner','POST'));assert.equal(created.status,200);const id=created.body.expense.id;
   assert.equal(Number((await balances()).find(a=>a.id===bbva.id).balance),before-9.5);
   assert.equal((await expenseRoute.PATCH(request({...payload,id,amount:'1.50'}))).status,200);assert.equal(Number((await balances()).find(a=>a.id===bbva.id).balance),before-1.5);
   await assert.rejects(money.mutateMoney(db,user.id,{action:'ROUTE',operationId:randomUUID(),key:`expense:${id}`,accountId:nu.id,excluded:false}),e=>e.status===409);
   assert.equal((await expenseRoute.DELETE(request(null,`id=${id}`,'owner','DELETE'))).status,200);assert.equal(Number((await balances()).find(a=>a.id===bbva.id).balance),before);
   assert.equal((await expenseRoute.DELETE(request(null,`id=${firstExpense.expenseId}`,'owner','DELETE'))).status,200);
   await processing.resolveCaptureMovement(db,user.id,{id:firstExpense.id,action:'registerDebitExpense',money:{fromAccountId:bbva.id,amount:'115.00',date:'2026-10-24',concept:'Compra QA',currency:'MXN'}});
   assert.equal(await db.dailyExpense.findUnique({where:{id:firstExpense.expenseId}}),null);
   const posting=await db.captureMoneyPosting.findUnique({where:{movementId:firstExpense.id}});assert.equal(posting.originalRecordId,firstExpense.expenseId);assert.equal(posting.expenseId,null);
  });
  await t.test('un lote abortado revierte la regla, captura y retiro juntos',async()=>{
   const row=await send(nuEvent('63.21'));
   const counts=async()=>Promise.all([db.moneyTransfer.count({where:{userId:user.id}}),db.moneyWithdrawal.count({where:{userId:user.id}})]);
   // La transferencia previa ya fue registrada automáticamente: usar otro destino
   // conserva una muestra pendiente sin desactivar la regla existente.
   const pendingEvent=nuEvent('63.22');pendingEvent.fields['android.text']='Enviaste $63.22 a DESTINO QA.';
   const pending=await send(pendingEvent),before=await counts();
   await assert.rejects(db.$transaction(async tx=>{
    const scoped={$transaction:async fn=>fn(tx)};
    await configuration.configureCapture(scoped,user.id,{...policy,destinationLabel:'DESTINO QA'});
    await processing.resolveCaptureMovement(scoped,user.id,{id:pending.id,action:'registerMoneyTransfer',money:{fromAccountId:nu.id,toAccountId:bbva.id,amount:'63.22',date:'2026-10-24',concept:'Lote QA',currency:'MXN'}});
    await money.mutateMoney(scoped,user.id,{action:'WITHDRAWAL',operationId:randomUUID(),accountId:bbva.id,amount:'5.00',date:'2026-10-24',concept:'Lote QA'},'2026-10-26');
    throw Error('rollback QA');
   },{timeout:20000}),/rollback QA/);
   assert.deepEqual(await counts(),before);assert.equal((await db.captureMovement.findUnique({where:{id:pending.id}})).status,'REVIEW');
   assert.equal(await db.captureMoneyPolicy.count({where:{userId:user.id,destinationLabel:'DESTINO QA'}}),0);assert.equal(row.status,'REGISTERED');
  });
  await t.test('lecturas por tipo y referencias mantienen propietario y filtros antes de paginar',async()=>{
   const res=await movementsRoute.GET(request(null,'kind=MONEY','owner','GET'));assert.equal(res.status,200);assert.ok(res.body.movements.every(m=>m.kind==='MONEY'&&m.userId===user.id));
   assert.equal((await movementsRoute.GET(request(null,'kind=MONEY','other','GET'))).body.movements.length,0);
   const row=await send(debitEvent('42.00'));await assert.rejects(processing.resolveCaptureMovement(db,other.id,{id:row.id,action:'registerDebitExpense',money:{}}),e=>e.status===404);
   await assert.rejects(processing.resolveCaptureMovement(db,user.id,{id:row.id,action:'registerDebitExpense',money:{fromAccountId:foreign.id,amount:'42.00',date:'2026-10-24',concept:'Ajeno',currency:'MXN'}}),e=>e.status===404);
   const p=await db.captureMoneyPosting.findFirst({where:{movementId:firstExpense.id}});assert.ok(p);
  });
 }finally{await db.user.deleteMany({where:{id:{in:users.map(x=>x.id)}}});await db.$disconnect()}
});
