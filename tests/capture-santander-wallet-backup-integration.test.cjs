const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.ts');
const wallet = require('./fixtures/captures/wallet-santander-purchase.es.v2.json');
const bank = require('./fixtures/captures/santander-card-purchase.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Santander Wallet de respaldo: legado vinculado, fecha aceptada y un gasto con API/PostgreSQL', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const [user, other] = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `santander-backup-${name}-${randomUUID()}@example.test` } })));
  const mocks = { '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null }, error: null }) } }) },
  };
  const load = sourceLoader(mocks), protocol = load('src/lib/captureProtocol.ts'), parsers = load('src/lib/captureParsers.ts');
  const config = load('src/lib/captureConfiguration.ts'), reconciliation = load('src/lib/captureReconciliation.ts');
  const eventsRoute = load('src/app/api/captures/events/route.ts'), route = load('src/app/api/captures/movements/route.ts');
  const oldReceive = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: event => {
    const parsed = parsers.interpretCapture(event), { date, dateSource, reference, ...proposal } = parsed.proposal;
    void date; void dateSource; void reference;
    return { parserKey: 'wallet.santander-purchase.es.v1', verified: false, reason: 'INCOMPLETE_FORMAT',
      proposal: { ...proposal, evidenceOnly: true, missingFields: ['operationDate'] } };
  } } })('src/lib/captureService.ts');
  const [card, sibling] = await Promise.all(['Santander ficticia', 'Otra Santander ficticia'].map(name => db.card.create({ data: { userId: user.id, name, usualCutDay: 25, usualDueDay: 15 } })));
  const category = await db.category.create({ data: { userId: user.id, name: 'Compras ficticias' } });
  const secret = randomBytes(32).toString('base64url'), device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(secret) } });
  const credential = { id: device.id, secretHash: device.secretHash }, bankKey = 'santander.card-purchase.es.v1', walletKey = 'wallet.santander-purchase.es.v2';
  const input = (fixture, amount = '123.45', postedAt) => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1,
    eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    ...(postedAt ? { postedAt, receivedAt: new Date(new Date(postedAt).getTime() + 1000).toISOString() } : {}),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([k,v]) => [k,v.replaceAll('123.45',amount)])) });
  const read = e => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: e.eventId } }, include: { movement: true } });
  const post = e => eventsRoute.POST(new Request('http://localhost/api/captures/events', { method: 'POST', headers: { authorization: `Capture ${device.id}.${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(e) }));
  const send = async e => { assert.equal((await post(e)).status, 200); return (await read(e)).movement; };
  const resolve = (body, token = 'owner') => route.PATCH(new Request('http://localhost/api/captures/movements', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const validate = (id, token) => resolve({ id, action: 'validateWalletBackup' }, token);
  const mode = (parserKey, value = 'AUTOMATIC', datePolicy) => config.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const count = () => db.dailyExpense.count({ where: { userId: user.id } });
  const legacy = async (amount = '123.45', postedAt) => { const e = input(wallet, amount, postedAt); await oldReceive.receiveCaptureEvent(db, credential, e); return read(e); };
  const reviewedBank = async amount => {
    const m = await send(input(bank, amount)), p = m.proposal;
    if (m.expenseId) return m;
    assert.equal((await resolve({ id:m.id,action:'correct',expectedCorrection:'null',correction:{cardId:card.id,amount:p.amount,date:p.date,currency:p.currency,merchant:p.merchant,categoryId:category.id} })).status,200);
    const r = await resolve({ id:m.id,action:'register' }); assert.equal(r.status,200); return r.body.movement;
  };
  const point = async m => { const period = { cardId:card.id,startDate:m.proposal.date,endDate:m.proposal.date }, view = await reconciliation.captureStatement(db,user.id,period), r = view.records.find(r=>r.id===m.expenseId);
    await reconciliation.reconcileCaptureStatement(db,user.id,{...period,action:'confirm',type:r.type,recordId:r.id,fingerprint:r.fingerprint}); };
  let pilot, oldWallet, bankMode;
  try {
    for (const [c, kind, value, sourcePackage] of [[card,'DIGITAL','0123',bank.event.sourcePackage],[card,'PHYSICAL','0123',bank.event.sourcePackage],
      [card,'WALLET','4242',wallet.event.sourcePackage],[sibling,'PHYSICAL','0456',bank.event.sourcePackage]]) {
      await config.configureCapture(db,user.id,{action:'alias',cardId:c.id,kind,value,sourcePackage,verified:true,evidence:'Datos ficticios locales'});
    }
    await t.test('validar legado exige vínculo y cotejo previo; no crea dinero ni hereda la fecha aceptada del banco', async () => {
      oldWallet = await legacy(); assert.equal((await validate(oldWallet.movementId)).status,409);
      pilot = await reviewedBank('123.45'); assert.equal(await count(),1);
      assert.equal((await resolve({id:oldWallet.movementId,action:'link',expenseId:pilot.expenseId})).status,200);
      assert.equal((await validate(oldWallet.movementId)).status,409);
      await point(pilot); bankMode=await mode(bankKey);
      await assert.rejects(mode(walletKey,'AUTOMATIC','NOTIFICATION_POSTED_AT'),e=>e.status===409);
    });
    await t.test('validación expresa idempotente conserva gasto, estado terminal, recibo e interpretación originales', async () => {
      await db.captureMovement.update({where:{id:oldWallet.movementId},data:{analysisHistory:[{key:protocol.captureHash('prior-analysis'),note:'Análisis histórico ficticio que debe conservarse'}]}});
      const before = await read({eventId:oldWallet.eventId}), expense = await db.dailyExpense.findUnique({where:{id:pilot.expenseId}});
      assert.equal((await validate(oldWallet.movementId,'other')).status,404); assert.equal((await validate(oldWallet.movementId,'invalid')).status,401);
      const responses=await Promise.all(Array.from({length:8},()=>validate(oldWallet.movementId)));
      for(const r of responses){assert.equal(r.status,200);assert.deepEqual(r.body,responses[0].body);}
      const after=await read({eventId:oldWallet.eventId}); assert.deepEqual({...after,movement:null},{...before,movement:null});
      assert.equal(after.movement.status,'LINKED');assert.equal(after.movement.reason,before.movement.reason);assert.deepEqual(after.movement.resolvedAt,before.movement.resolvedAt);
      assert.equal(after.movement.expenseId,pilot.expenseId);assert.equal(after.movement.parserKey,walletKey);assert.equal(after.movement.analysisHistory.length,2);
      assert.deepEqual(after.movement.analysisHistory[0],before.movement.analysisHistory[0]);
      assert.equal(after.movement.analysisHistory[1].validation,'LINKED_WALLET_BACKUP');assert.equal(after.movement.proposal.dateSource,'NOTIFICATION_POSTED_AT');
      assert.equal(after.movement.proposal.operationAt,undefined);assert.equal(after.interpretation.reason,'INCOMPLETE_FORMAT');
      assert.deepEqual(await db.dailyExpense.findUnique({where:{id:pilot.expenseId}}),expense);assert.equal(await count(),1);
      await assert.rejects(mode(walletKey),e=>e.status===409);await assert.rejects(mode(walletKey,'AUTOMATIC','BANK_OPERATION'),e=>e.status===409);
      await mode(walletKey,'AUTOMATIC','NOTIFICATION_POSTED_AT');assert.deepEqual(await db.captureAutomation.findUnique({where:{id:bankMode.id}}),bankMode);
    });
    await t.test('solo Wallet: ocho entregas y respuesta perdida crean un gasto pendiente con la fecha del aviso', async () => {
      const before=await count(),event=input(wallet,'201.01'),responses=await Promise.all(Array.from({length:8},()=>post(event)));
      for(const r of responses){assert.equal(r.status,200);assert.deepEqual(r.body,responses[0].body);}assert.deepEqual((await post(event)).body,responses[0].body);
      const m=(await read(event)).movement,expense=await db.dailyExpense.findUnique({where:{id:m.expenseId}});
      assert.equal(m.status,'REGISTERED');assert.equal(expense.reconciliationStatus,'PENDING');assert.equal(expense.cardId,card.id);assert.equal(String(expense.amount),'201.01');
      assert.equal(m.proposal.dateSource,'NOTIFICATION_POSTED_AT');assert.equal(await count(),before+1);
    });
    await t.test('ambas fuentes en ambos órdenes conservan un gasto y la segunda evidencia queda por revisar', async () => {
      for(const [index,order]of [['bank','wallet'],['wallet','bank']].entries()){
        const before=await count(),amount=`30${index}.01`,first=order[0],second=order[1],fixtures={bank,wallet},a=await send(input(fixtures[first],amount)),b=await send(input(fixtures[second],amount));
        assert.equal(a.status,'REGISTERED');assert.equal(b.reason,'POSSIBLE_DUPLICATE');assert.equal(b.expenseId,null);assert.equal(await count(),before+1);
        assert.equal(a.proposal.dateSource,first==='bank'?'BANK_OPERATION':'NOTIFICATION_POSTED_AT');
        assert.equal((await resolve({id:b.id,action:'link',expenseId:a.expenseId})).status,200);assert.equal(await count(),before+1);
      }
    });
    await t.test('llegadas concurrentes de ambas fuentes conservan un gasto sin asociación por hora o importe', async () => {
      const before=await count(),events=[input(wallet,'303.03'),input(bank,'303.03')];await Promise.all(events.map(post));
      const movements=await Promise.all(events.map(async e=>(await read(e)).movement));assert.equal(movements.filter(m=>m.expenseId).length,1);
      assert.equal(movements.filter(m=>m.reason==='POSSIBLE_DUPLICATE').length,1);assert.equal(await count(),before+1);
    });
    await t.test('banco tardío de otro día no duplica ni cambia silenciosamente la fecha guardada por Wallet', async () => {
      const before=await count(),w=await send(input(wallet,'304.04','2026-10-21T06:01:00Z')),expense=await db.dailyExpense.findUnique({where:{id:w.expenseId}});
      const b=await send(input(bank,'304.04'));assert.equal(b.proposal.date,'2026-10-20');assert.equal(b.reason,'POSSIBLE_DUPLICATE');
      assert.equal(expense.date.toISOString().slice(0,10),'2026-10-21');assert.deepEqual(await db.dailyExpense.findUnique({where:{id:w.expenseId}}),expense);assert.equal(await count(),before+1);
    });
    await t.test('compras iguales, avisos revisados, gasto manual y borrado conservan revisión y datos personales', async () => {
      const before=await count();assert.equal((await send(input(wallet,'201.01'))).reason,'POSSIBLE_DUPLICATE');assert.equal(await count(),before);
      const event=input(wallet,'401.01');const m=await send(event);const next={...input(wallet,'402.02'),notificationKeyHash:event.notificationKeyHash};assert.equal((await send(next)).reason,'NOTIFICATION_REVISION');
      const manual=await db.dailyExpense.create({data:{userId:user.id,cardId:card.id,categoryId:category.id,date:new Date('2026-10-20T12:00:00Z'),amount:'403.03',paymentMethod:'CARD',concept:'Concepto personal ficticio',notes:'Nota personal ficticia',cashContributionAmount:2}});
      const pending=await send(input(wallet,'403.03'));assert.equal(pending.reason,'POSSIBLE_DUPLICATE');await resolve({id:pending.id,action:'link',expenseId:manual.id});
      assert.deepEqual(await db.dailyExpense.findUnique({where:{id:manual.id}}),manual);
      await load('src/lib/captureProcessing.ts').archiveCapturedExpense(db,await db.dailyExpense.findUnique({where:{id:m.expenseId}}));await db.dailyExpense.delete({where:{id:m.expenseId}});
      const afterDelete=await count();await post(event);assert.equal((await send(input(wallet,'401.01'))).reason,'POSSIBLE_DUPLICATE');assert.equal(await count(),afterDelete);
    });
    await t.test('validación rechaza otra fecha, corrección personal, gasto sin banco y fuentes distintas sin alterar el gasto', async () => {
      const wrongDate=await legacy('123.45','2026-10-21T06:00:01Z');await resolve({id:wrongDate.movementId,action:'link',expenseId:pilot.expenseId});
      const response=await validate(wrongDate.movementId);assert.equal(response.status,409);assert.match(response.body.error,/fecha/i);
      const corrected=await legacy();await resolve({id:corrected.movementId,action:'correct',expectedCorrection:'null',correction:{cardId:card.id,amount:'123.45',date:'2026-10-20',currency:'MXN',merchant:'Corrección personal ficticia',categoryId:category.id}});
      await resolve({id:corrected.movementId,action:'link',expenseId:pilot.expenseId});assert.equal((await validate(corrected.movementId)).status,409);
      assert.equal((await validate(pilot.id)).status,409);
      const manual=await db.dailyExpense.create({data:{userId:user.id,cardId:card.id,categoryId:category.id,date:new Date('2026-10-20T12:00:00Z'),amount:'501.01',paymentMethod:'CARD',concept:'Sin evidencia bancaria ficticia',reconciliationStatus:'CONFIRMED',reconciledAt:new Date()}});
      const unbacked=await legacy('501.01');await resolve({id:unbacked.movementId,action:'link',expenseId:manual.id});const prior=await db.dailyExpense.findUnique({where:{id:manual.id}});
      assert.equal((await validate(unbacked.movementId)).status,409);assert.deepEqual(await db.dailyExpense.findUnique({where:{id:manual.id}}),prior);
    });
    await t.test('alias ambiguo, token NFC, moneda extranjera y producto desconocido no registran compras', async () => {
      const before=await count(),foreign=input(wallet,'601.01');foreign.fields['android.text']=foreign.fields['android.text'].replace('MXN','USD');assert.equal((await send(foreign)).reason,'FOREIGN_CURRENCY');
      const nfc=input(wallet,'602.02');nfc.fields['android.text']=nfc.fields['android.text'].replace('0123','4242');assert.equal((await send(nfc)).reason,'UNKNOWN_CARD');
      const unknown=input(wallet,'603.03');unknown.fields['android.text']=unknown.fields['android.text'].replace('LikeU','Otro producto');assert.equal((await send(unknown)).reason,'UNKNOWN_FORMAT');
      const alias=await db.captureCardAlias.create({data:{userId:user.id,cardId:sibling.id,sourcePackage:bank.event.sourcePackage,kind:'PHYSICAL',value:'0123'}});
      assert.equal((await send(input(wallet,'604.04'))).reason,'AMBIGUOUS_CARD');await db.captureCardAlias.delete({where:{id:alias.id}});assert.equal(await count(),before);
    });
    await t.test('volver Wallet a observación no frena al banco; una corrección personal sigue bloqueando duplicados', async () => {
      await mode(walletKey,'OBSERVATION');const before=await count(),w=await send(input(wallet,'701.01'));assert.equal(w.status,'OBSERVED');
      const b=await send(input(bank,'701.01'));assert.equal(b.status,'REGISTERED');assert.equal(await count(),before+1);
      const corrected=await send(input(wallet,'702.02'));await resolve({id:corrected.id,action:'correct',expectedCorrection:'null',correction:{cardId:card.id,amount:'702.02',date:'2026-10-20',currency:'MXN',merchant:'Corrección personal ficticia',categoryId:category.id}});
      assert.equal((await send(input(bank,'702.02'))).reason,'POSSIBLE_DUPLICATE');assert.equal(await count(),before+1);
      assert.deepEqual(await db.captureAutomation.findUnique({where:{id:bankMode.id}}),bankMode);assert.equal(await db.dailyExpense.count({where:{userId:other.id}}),0);
    });
  } finally { await db.user.deleteMany({where:{id:{in:[user.id,other.id]}}});await db.$disconnect(); }
});
