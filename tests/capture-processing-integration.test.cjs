const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString=process.env.AFP_TEST_DATABASE_URL;

test('Fase 4 PostgreSQL: interpretación, resoluciones y escritura financiera atómica', {skip:!connectionString}, async t=>{
 const url=new URL(connectionString);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&/^\/afp_test\w*$/.test(url.pathname)&&!url.search);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString})});
 const user=await db.user.create({data:{email:`phase4-${randomUUID()}@example.test`}});
 const other=await db.user.create({data:{email:`phase4-other-${randomUUID()}@example.test`}});
 const base=sourceLoader()('src/lib/captureParsers.js');
 const session={a:user,b:other};
 const mocks={
  '@/lib/prisma':{prisma:db},
  'next/server':{NextResponse:{json:(body,options={})=>({body:JSON.parse(JSON.stringify(body)),status:options.status||200,headers:new Headers(options.headers)})}},
  '@supabase/supabase-js':{createClient:()=>({auth:{getUser:async token=>({data:{user:session[token]},error:session[token]?null:new Error('expired')})}})},
 };
 // Solo este cargador de pruebas simula formatos comprobados. No existe un
 // interruptor de entorno o de cliente que permita saltar el bloqueo real.
 const load=sourceLoader({...mocks,'@/lib/captureParsers':{...base,captureParsers:base.captureParsers.map(parser=>({...parser,verified:true})),interpretCapture:event=>({...base.interpretCapture(event),verified:true})}});
 const realLoad=sourceLoader(mocks);
 const protocol=load('src/lib/captureProtocol.js'), service=load('src/lib/captureService.js');
 const configuration=load('src/lib/captureConfiguration.js'), processing=load('src/lib/captureProcessing.js');
 const expenses=load('src/app/api/expenses/route.js');
 const request=(body={},query='',token='a',method='POST')=>new Request(`http://localhost/api/test?userId=${other.id}&${query}`,{method,headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(!['GET','HEAD'].includes(method)?{body:JSON.stringify(body)}:{})});
 let sequence=0;
 const event=(options={})=>protocol.validateCaptureEvent({contractVersion:1,eventId:randomUUID(),sourcePackage:options.source||'com.bancomer.mbanking',
  notificationKeyHash:options.key||createHash('sha256').update(randomUUID()).digest('hex'),postedAt:'2026-10-21T20:00:00Z',receivedAt:'2026-10-21T20:00:01Z',
  fields:{'android.title':options.source==='com.google.android.apps.walletnfcrel'?'Pago realizado':'Compra aprobada',
   'android.text':`Importe: ${options.currency||'MXN'} ${options.amount||`${++sequence}.01`}\nComercio: ${options.merchant||'COMERCIO FICTICIO'}\nTarjeta ${options.source==='com.google.android.apps.walletnfcrel'?'Wallet':options.kind||'física'}: *${options.alias||'0123'}\nFecha: 21/10/2026 13:00:00${options.reference?`\nReferencia bancaria: ${options.reference}`:''}`,
   ...(options.fields||{})}});
 const secret=randomBytes(32).toString('base64url');
 const device=await db.captureDevice.create({data:{name:'Ficticio Fase4',userId:user.id,secretHash:protocol.captureHash(secret),approvedAt:new Date()}});
 const credential={id:device.id,secretHash:protocol.captureHash(secret)};
 const category=await db.category.create({data:{userId:user.id,name:'Categoría ficticia'}});
 const card=await db.card.create({data:{userId:user.id,name:'BBVA',usualCutDay:25,usualDueDay:15}});
 const card2=await db.card.create({data:{userId:user.id,name:'HSBC 1',usualCutDay:25,usualDueDay:15}});
 const send=async (input, loader=load)=>{
  const route=loader('src/app/api/captures/events/route.js');
  const response=await route.POST(new Request('http://localhost/api/captures/events',{method:'POST',headers:{authorization:`Capture ${device.id}.${secret}`,'Content-Type':'application/json'},body:JSON.stringify(input)}));
  assert.equal(response.status,200,JSON.stringify(response.body));
  const stored=await db.captureEvent.findUnique({where:{deviceId_eventId:{deviceId:device.id,eventId:input.eventId}},include:{movement:true}});
  return {response,movement:stored.movement,stored};
 };
 const enable=async(cardId=card.id,parserKey='bbva.purchase.es.v1')=>configuration.configureCapture(db,user.id,{action:'automation',cardId,parserKey,mode:'AUTOMATIC'});
 const inventory=alias=>({version:1,cards:[{name:'BBVA',bankPackage:'com.bancomer.mbanking',physical:[alias],digital:['0456'],wallet:['0789'],verified:true,evidence:'Ejemplo ficticio revisado por test'}]});
 let autoExpense;
 try {
 await t.test('rutas administrativas rechazan anónimos y credencial nativa antes de leer el cuerpo',async()=>{
  for(const name of ['configuration','movements'])for(const method of ['GET','PATCH'])for(const authorization of [null,`Capture ${device.id}.${secret}`,'Bearer invalid']){
   const response=await realLoad(`src/app/api/captures/${name}/route.js`)[method]({headers:new Headers(authorization?{authorization}:{}),get body(){throw new Error('No leer');}});assert.equal(response.status,401);
  }
 });
 await t.test('importación por nombres existentes, sin renombrar, conserva ceros y separa física/digital/Wallet',async()=>{
  const result=await configuration.configureCapture(db,user.id,{action:'importAliases',inventory:inventory('0123')});assert.equal(result.imported,3);
  assert.equal(await db.captureCardAlias.count({where:{userId:user.id}}),3);
  await configuration.configureCapture(db,user.id,{action:'importAliases',inventory:inventory('0123')});assert.equal(await db.captureCardAlias.count({where:{userId:user.id}}),3);
  const missing=inventory('0123');missing.cards[0].name='No existe';await assert.rejects(configuration.configureCapture(db,user.id,{action:'importAliases',inventory:missing}),e=>e.status===404);
  const before=await db.captureCardAlias.count();const partial=inventory('0999');partial.cards.push({...partial.cards[0],name:'Inexistente'});
  await assert.rejects(configuration.configureCapture(db,user.id,{action:'importAliases',inventory:partial}));assert.equal(await db.captureCardAlias.count(),before);
 });
 await t.test('registro real bloquea activación sin muestras verificadas y queda en observación aun con alias conocidos',async()=>{
  await assert.rejects(realLoad('src/lib/captureConfiguration.js').configureCapture(db,user.id,{action:'automation',cardId:card.id,parserKey:'bbva.purchase.es.v1',mode:'AUTOMATIC'}),e=>e.status===409);
  const row=await send(event(),realLoad);assert.equal(row.movement.status,'OBSERVED');assert.equal(row.movement.reason,'UNVERIFIED_FORMAT');assert.equal(await db.dailyExpense.count({where:{userId:user.id}}),0);
 });
 await t.test('formato habilitado solo para tarjeta concreta crea gasto MXN Por conciliar y Por clasificar',async()=>{
  await enable();const input=event({amount:'123.45'});const row=await send(input);assert.equal(row.movement.status,'REGISTERED');
  autoExpense=await db.dailyExpense.findUnique({where:{id:row.movement.expenseId},include:{category:true}});
  assert.equal(autoExpense.amount.toFixed(2),'123.45');assert.equal(autoExpense.reconciliationStatus,'PENDING');assert.equal(autoExpense.category.name,'Por clasificar');assert.equal(autoExpense.cardId,card.id);
  assert.equal(autoExpense.date.toISOString(),'2026-10-21T12:00:00.000Z');assert.equal(row.movement.proposal.operationAt,'2026-10-21T19:00:00.000Z');
  assert.equal(autoExpense.personId,null);assert.equal(autoExpense.receivableAccountId,null);assert.equal(String(autoExpense.cashContributionAmount),'0');
  assert.equal((await expenses.GET(request({},'startDate=2026-10-21','a','GET'))).body.expenses.some(item=>item.id===autoExpense.id&&item.reconciliationStatus==='PENDING'),true);
 });
 await t.test('diez entregas simultáneas y respuesta perdida mantienen evento, movimiento y gasto únicos',async()=>{
  const input=event({amount:'22.22'});const rows=await Promise.all(Array.from({length:10},()=>send(input)));
  assert.equal(new Set(rows.map(row=>row.movement.id)).size,1);for(const row of rows)assert.deepEqual(row.response.body,rows[0].response.body);
  assert.equal(await db.dailyExpense.count({where:{userId:user.id,amount:'22.22'}}),1);
  const conflicting={...input,fields:{'android.title':'Otra cosa'}};await assert.rejects(service.receiveCaptureEvent(db,credential,conflicting),e=>e.status===409);
 });
 await t.test('dos compras legítimas iguales requieren decisión explícita y conservan multiplicidad',async()=>{
  const first=await send(event({amount:'33.33'}));const second=await send(event({amount:'33.33'}));assert.equal(second.movement.reason,'POSSIBLE_DUPLICATE');
  assert.equal(await db.dailyExpense.count({where:{userId:user.id,amount:'33.33'}}),1);
  const distinct=await processing.resolveCaptureMovement(db,user.id,{id:second.movement.id,action:'distinct'});assert.equal(distinct.status,'REGISTERED');
  await processing.resolveCaptureMovement(db,user.id,{id:second.movement.id,action:'distinct'});assert.equal(await db.dailyExpense.count({where:{userId:user.id,amount:'33.33'}}),2);
  assert.notEqual(first.movement.expenseId,distinct.expenseId);
 });
 await t.test('BBVA y Wallet solo se unen automáticamente con referencia bancaria inequívoca',async()=>{
  await enable(card.id,'wallet.purchase.es.v1');const first=await send(event({amount:'44.44',reference:'FICTICIA-CANAL-44'}));
  const second=await send(event({source:'com.google.android.apps.walletnfcrel',alias:'0789',amount:'44.44',reference:'FICTICIA-CANAL-44'}));assert.equal(second.movement.id,first.movement.id);
  assert.equal(await db.captureEvent.count({where:{movementId:first.movement.id}}),2);
  const conflict=await send(event({amount:'44.45',reference:'FICTICIA-CANAL-44'}));assert.equal(conflict.movement.reason,'REFERENCE_CONFLICT');assert.equal(conflict.movement.expenseId,null);
  const approximate=await send(event({source:'com.google.android.apps.walletnfcrel',alias:'0789',amount:'44.44'}));assert.equal(approximate.movement.reason,'POSSIBLE_DUPLICATE');
 });
 await t.test('alias ausente, ambiguo y sin verificar bloquean registros; otra tarjeta del mismo banco no se habilita',async()=>{
  assert.equal((await send(event({alias:'9999'}))).movement.reason,'UNKNOWN_CARD');
  await db.captureCardAlias.create({data:{userId:user.id,cardId:card2.id,sourcePackage:'com.bancomer.mbanking',kind:'PHYSICAL',value:'0123',verifiedAt:new Date()}});
  assert.equal((await send(event())).movement.reason,'AMBIGUOUS_CARD');
  await db.captureCardAlias.deleteMany({where:{userId:user.id,cardId:card2.id,value:'0123'}});
  await db.captureCardAlias.create({data:{userId:user.id,cardId:card2.id,sourcePackage:'com.bancomer.mbanking',kind:'PHYSICAL',value:'2222'}});
  assert.equal((await send(event({alias:'2222'}))).movement.reason,'UNVERIFIED_ALIAS');
  await db.captureCardAlias.updateMany({where:{userId:user.id,cardId:card2.id},data:{verifiedAt:new Date()}});
  assert.equal((await send(event({alias:'2222'}))).movement.reason,'OBSERVATION');
 });
 await t.test('regla exacta asigna categoría; cambiar el nombre del comercio no genera vínculos aproximados',async()=>{
  await configuration.configureCapture(db,user.id,{action:'rule',cardId:card.id,merchant:'Tienda Sintética',categoryId:category.id});
  const row=await send(event({amount:'55.55',merchant:'TIENDA SINTETICA'}));assert.equal((await db.dailyExpense.findUnique({where:{id:row.movement.expenseId}})).categoryId,category.id);
  const unrelated=await send(event({amount:'55.56',merchant:'OTRA TIENDA'}));assert.notEqual((await db.dailyExpense.findUnique({where:{id:unrelated.movement.expenseId}})).categoryId,category.id);
 });
 await t.test('manual seguido de aviso permite vincular sin cambiar notas, categoría ni aportaciones',async()=>{
  const manual=await expenses.POST(request({date:'2026-10-21',concept:'Corrección personal',amount:'66.66',paymentMethod:'CARD',cardId:card.id,categoryId:category.id,notes:'Nota personal',cashContributionAmount:10}));assert.equal(manual.status,200);
  const row=await send(event({amount:'66.66'}));assert.equal(row.movement.reason,'POSSIBLE_DUPLICATE');
  const before=await db.dailyExpense.findUnique({where:{id:manual.body.expense.id}});
  const linked=await processing.resolveCaptureMovement(db,user.id,{id:row.movement.id,action:'link',expenseId:before.id});assert.equal(linked.status,'LINKED');assert.deepEqual(await db.dailyExpense.findUnique({where:{id:before.id}}),before);
 });
 await t.test('aviso seguido de alta manual identifica posible duplicado sin perder el UUID offline',async()=>{
  const body={operationId:randomUUID(),date:'2026-10-21',concept:'Compra manual',amount:'123.45',paymentMethod:'CARD',cardId:card.id,categoryId:category.id};
  assert.equal((await expenses.POST(request(body))).status,409);assert.equal(await db.expenseOperation.count({where:{userId:user.id,operationId:body.operationId}}),0);
  assert.equal((await expenses.POST(request({...body,confirmDistinctCapture:true}))).status,200);
 });
 await t.test('eliminación manual conserva huella y un aviso tardío permanece en revisión',async()=>{
  const manual=await expenses.POST(request({date:'2026-10-21',concept:'Compra eliminada',amount:'77.77',paymentMethod:'CARD',cardId:card.id,categoryId:category.id}));
  assert.equal((await expenses.DELETE(request({},`id=${manual.body.expense.id}`,'a','DELETE'))).status,200);
  assert.ok(await db.expenseTombstone.findUnique({where:{expenseId:manual.body.expense.id}}));
  const row=await send(event({amount:'77.77'}));assert.equal(row.movement.reason,'POSSIBLE_DUPLICATE');assert.ok(row.movement.proposal.candidates.some(candidate=>candidate.type==='DELETED'));
 });
 await t.test('reeditar o borrar un gasto nunca se revierte por reentrega ni por otra evidencia exacta',async()=>{
  const input=event({amount:'88.88',reference:'FICTICIA-CORRECCION'});const row=await send(input);
  await db.dailyExpense.update({where:{id:row.movement.expenseId},data:{concept:'Mi nombre',amount:'80.00',cashContributionAmount:'10.00'}});
  await send(input);await send(event({source:'com.google.android.apps.walletnfcrel',alias:'0789',amount:'88.88',reference:'FICTICIA-CORRECCION'}));
  let saved=await db.dailyExpense.findUnique({where:{id:row.movement.expenseId}});assert.equal(saved.concept,'Mi nombre');assert.equal(saved.amount.toFixed(2),'80.00');assert.equal(saved.cashContributionAmount.toFixed(2),'10.00');
  assert.equal((await expenses.DELETE(request({},`id=${saved.id}`,'a','DELETE'))).status,200);await send(input);
  const replay=await send(event({amount:'88.88',reference:'FICTICIA-CORRECCION'}));assert.equal(replay.movement.originalExpenseId,saved.id);assert.equal(replay.movement.expenseId,null);
  assert.equal(await db.dailyExpense.count({where:{userId:user.id,amount:'88.88'}}),0);
 });
 await t.test('actualizar una notificación no crea otra compra y requiere resolución',async()=>{
  const input=event({amount:'99.99'});await send(input);
  const updated=event({key:input.notificationKeyHash,amount:'100.99'});assert.equal((await send(updated)).movement.reason,'NOTIFICATION_REVISION');
 });
 await t.test('suscripción explícita reutiliza su unicidad mensual y no duplica una ocurrencia existente u omitida',async()=>{
  const sub=await db.subscription.create({data:{userId:user.id,name:'Suscripción ficticia',amount:'101.01',paymentMethod:'CARD',cardId:card.id,categoryId:category.id,chargeDay:1,startMonth:10,startYear:2026}});
  await configuration.configureCapture(db,user.id,{action:'rule',cardId:card.id,merchant:'SUSCRIPCION FICTICIA',categoryId:category.id,subscriptionId:sub.id});
  const first=await send(event({amount:'101.01',merchant:'SUSCRIPCION FICTICIA'}));assert.equal(first.movement.status,'REGISTERED');
  const expense=await db.dailyExpense.findUnique({where:{id:first.movement.expenseId}});assert.equal(expense.subscriptionId,sub.id);assert.equal(expense.reconciliationStatus,'PENDING');
  const second=await send(event({amount:'102.02',merchant:'SUSCRIPCION FICTICIA'}));assert.equal(second.movement.reason,'SUBSCRIPTION_CONFLICT');assert.equal(second.movement.expenseId,null);
  assert.equal(await db.subscriptionCharge.count({where:{subscriptionId:sub.id,month:'2026-10'}}),1);
 });
 await t.test('movimientos especiales, moneda extranjera y formatos desconocidos quedan visibles sin alterar gastos',async()=>{
  const count=await db.dailyExpense.count({where:{userId:user.id}});
  for(const input of [event({currency:'USD'}),event({source:'mx.hsbc.hsbcmexico'}),event({fields:{'android.subText':'MSI'}})]){
   const row=await send(input);assert.equal(row.movement.status,'REVIEW');assert.equal(row.movement.expenseId,null);
  }
  assert.equal(await db.dailyExpense.count({where:{userId:user.id}}),count);
 });
 await t.test('fallo después del gasto revierte evento, movimiento y todos los efectos financieros',async()=>{
  const input=event({amount:'103.03'});
  const failing={$transaction:fn=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='dailyExpense')return new Proxy(target.dailyExpense,{get(model,method){if(method==='create')return async args=>{await model.create(args);throw new Error('rollback real');};return model[method];}});return target[key];}})))};
  await assert.rejects(service.receiveCaptureEvent(failing,credential,input),/rollback real/);
  assert.equal(await db.captureEvent.count({where:{deviceId:device.id,eventId:input.eventId}}),0);assert.equal(await db.dailyExpense.count({where:{userId:user.id,amount:'103.03'}}),0);
 });
 await t.test('conversión a MSI sustituye gasto en una transacción, conserva correcciones y es idempotente',async()=>{
  const row=await send(event({amount:'1200.00'}));await db.dailyExpense.update({where:{id:row.movement.expenseId},data:{concept:'Compra corregida',notes:'Referencia personal'}});
  const before=await db.installmentPurchase.count({where:{userId:user.id}});
  const result=await Promise.all(Array.from({length:4},()=>processing.resolveCaptureMovement(db,user.id,{id:row.movement.id,action:'convertToInstallments',months:12})));
  assert.equal(new Set(result.map(movement=>movement.installmentPurchaseId)).size,1);assert.equal(await db.installmentPurchase.count({where:{userId:user.id}}),before+1);
  assert.equal(await db.dailyExpense.count({where:{id:row.movement.expenseId}}),0);
  const purchase=await db.installmentPurchase.findUnique({where:{id:result[0].installmentPurchaseId}});assert.equal(purchase.concept,'Compra corregida');assert.equal(purchase.notes,'Referencia personal');assert.equal(purchase.reconciliationStatus,'PENDING');assert.equal(purchase.totalAmount.toFixed(2),'1200.00');
  const repeat=await send(event({amount:'1200.00'}));assert.equal(repeat.movement.reason,'POSSIBLE_DUPLICATE');
 });
 await t.test('rollback de conversión MSI restaura gasto, movimiento y ausencia de compra',async()=>{
  const row=await send(event({amount:'1300.00'}));const before=await db.captureMovement.findUnique({where:{id:row.movement.id}});
  const failing={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='dailyExpense')return new Proxy(target.dailyExpense,{get(model,method){if(method==='delete')return async args=>{await model.delete(args);throw new Error('fallo MSI');};return model[method];}});return target[key];}})),options)};
  await assert.rejects(processing.resolveCaptureMovement(failing,user.id,{id:row.movement.id,action:'convertToInstallments',months:6}),/fallo MSI/);
  assert.deepEqual(await db.captureMovement.findUnique({where:{id:row.movement.id}}),before);assert.ok(await db.dailyExpense.findUnique({where:{id:row.movement.expenseId}}));
  assert.equal(await db.installmentPurchase.count({where:{userId:user.id,totalAmount:'1300.00'}}),0);assert.equal(await db.expenseTombstone.count({where:{expenseId:row.movement.expenseId}}),0);
 });
 await t.test('MSI no convierte gastos con aportaciones o vínculos personales',async()=>{
  const row=await send(event({amount:'1400.00'}));await db.dailyExpense.update({where:{id:row.movement.expenseId},data:{cashContributionAmount:'100.00'}});
  await assert.rejects(processing.resolveCaptureMovement(db,user.id,{id:row.movement.id,action:'convertToInstallments',months:6}),e=>e.status===409);
  assert.ok(await db.dailyExpense.findUnique({where:{id:row.movement.expenseId}}));
 });
 await t.test('volver a observación detiene solo la automatización de ese formato',async()=>{
  await configuration.configureCapture(db,user.id,{action:'automation',cardId:card.id,parserKey:'bbva.purchase.es.v1',mode:'OBSERVATION'});
  const observed=await send(event({amount:'1500.00'}));assert.equal(observed.movement.status,'OBSERVED');assert.equal(observed.movement.expenseId,null);
  const wallet=await send(event({source:'com.google.android.apps.walletnfcrel',alias:'0789',amount:'1501.00'}));assert.equal(wallet.movement.status,'REGISTERED');
  await enable();
 });
 await t.test('categoría eliminada de una regla queda en revisión sin rechazar la recepción',async()=>{
  const temp=await db.category.create({data:{userId:user.id,name:'Categoría temporal ficticia'}});
  await configuration.configureCapture(db,user.id,{action:'rule',cardId:card.id,categoryId:temp.id,merchant:'REGLA DESACTUALIZADA'});
  await db.category.delete({where:{id:temp.id}});const row=await send(event({amount:'1502.00',merchant:'REGLA DESACTUALIZADA'}));assert.equal(row.movement.reason,'RULE_UNAVAILABLE');assert.equal(row.movement.expenseId,null);
 });
 await t.test('suscripción omitida y evidencia bancaria impiden crear otro cargo',async()=>{
  for(const skipped of [true,false]){
   const name=skipped?'OMITIDA FICTICIA':'DOCUMENTADA FICTICIA';
   const sub=await db.subscription.create({data:{userId:user.id,name,amount:'1510.00',paymentMethod:'CARD',cardId:card.id,categoryId:category.id,chargeDay:1,startMonth:10,startYear:2026}});
   await configuration.configureCapture(db,user.id,{action:'rule',cardId:card.id,merchant:name,categoryId:category.id,subscriptionId:sub.id});
   if(skipped)await db.subscriptionCharge.create({data:{userId:user.id,subscriptionId:sub.id,month:'2026-10',status:'SKIPPED'}});
   else await db.cardCycle.create({data:{userId:user.id,cardId:card.id,month:10,year:2026,startDate:new Date('2026-10-01'),cutDate:new Date('2026-10-25'),dueDate:new Date('2026-11-15'),usageReconciliation:{version:1,source:'ficticio.pdf',sourceSha256:'a'.repeat(64),startDate:'2026-10-01',cutDate:'2026-10-25',subscriptionCharges:[{subscriptionId:sub.id,date:'2026-10-10',amount:'1511.00'}]}}});
   const row=await send(event({merchant:name,amount:skipped?'1510.00':'1511.00'}));assert.equal(row.movement.reason,'SUBSCRIPTION_CONFLICT');assert.equal(row.movement.expenseId,null);
  }
 });
 await t.test('consumo mínimo excluye capturas y MSI por conciliar pero el cálculo de corte sí los incluye',async()=>{
  const calc=load('src/lib/calculations/cardUsageWaivers.js');
  const day=new Date('2026-10-21T12:00:00Z');
  const cycle={cardId:card.id,card:{usualCutDay:25},startDate:new Date('2026-10-01T12:00:00Z'),cutDate:new Date('2026-10-25T12:00:00Z'),month:10,year:2026};
  const pendingPurchase=await db.installmentPurchase.findFirst({where:{userId:user.id,reconciliationStatus:'PENDING'}});
  const [output]=calc.buildCardUsageWaivers({cards:[{...card,usagePolicy:{productKey:'HSBC_ZERO',verifiedAt:'2026-10-11'}}],cyclesWithAmounts:[cycle],expenses:[{...autoExpense,date:day}],subscriptions:[],purchases:[pendingPurchase],year:2026,month:10,now:day});
  assert.equal(output.eligibleSpend,0);assert.equal(output.remainingAmount,300);assert.equal(output.breakdown.projectedCharges.length,2);
  const financial=load('src/lib/calculations/cardCycles.js').calculateCycleAmount({cycle,expenses:[autoExpense],purchases:[pendingPurchase]});
  assert.equal(financial.calculatedAmount,223.45);assert.equal(financial.expensesAmount,123.45);assert.equal(financial.purchasesAmount,100);

 });
 await t.test('dos cuentas no comparten alias, reglas, resoluciones, páginas ni datos financieros',async()=>{
  const list=await load('src/app/api/captures/movements/route.js').GET(request({},'','b','GET'));assert.equal(list.status,200);assert.equal(list.body.movements.length,0);
  const owned=await db.captureMovement.findFirst({where:{userId:user.id}});await assert.rejects(processing.resolveCaptureMovement(db,other.id,{id:owned.id,action:'discard'}),e=>e.status===404);
  await assert.rejects(configuration.configureCapture(db,other.id,{action:'rule',cardId:card.id,merchant:'X',categoryId:category.id}),e=>e.status===404);
  const config=await configuration.captureConfiguration(db,other.id);assert.equal(config.aliases.length,0);
  const page=await load('src/app/api/captures/movements/route.js').GET(request({},`cursor=${owned.id}`,'b','GET'));assert.equal(page.status,404);
  assert.equal((await load('src/app/api/captures/configuration/route.js').PATCH(request({action:'automation',cardId:card.id,parserKey:'bbva.purchase.es.v1',mode:'AUTOMATIC',userId:user.id},'','b','PATCH'))).status,400);
 });
 }finally{
  await db.captureEvent.deleteMany({where:{userId:user.id}});await db.captureMovement.deleteMany({where:{userId:user.id}});
  await db.user.deleteMany({where:{id:{in:[user.id,other.id]}}});
  await db.captureRateLimit.deleteMany({where:{key:protocol.captureHash(`device:${device.id}`)}});
  await db.$disconnect();
 }
});
