// Solo datos ficticios y PostgreSQL local. La salida contiene una credencial
// desechable para enviar avisos al servidor de navegador, nunca a producción.
import { fixtureConnection, fixtureDatabase } from './fixture-database';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
async function main() {
 const db = await fixtureDatabase(fixtureConnection());
 try {
 const userId = '00000000-0000-4000-8000-000000000091';
 await db.user.upsert({where:{id:userId},create:{id:userId,email:'capture-qa@example.test'},update:{}});
 const cards=[];
 for(const [name,source,amount] of [['BANAMEX 1','BANAMEX_NOTICE','123.45'],['MERCADOPAGO','MERCADOPAGO_NOTICE','67.89']] as const) {
  const card=await db.card.create({data:{userId,name,usualCutDay:10,usualDueDay:30,creditLimit:2000,usedBalance:1000,balanceAsOf:new Date('2026-10-23'),balanceTracking:{version:1,day:'2026-10-23',startedAt:'2026-10-23T06:00:00.000Z',captureId:randomUUID(),baseExposureCents:'0'}}});
  await db.cardCycle.create({data:{userId,cardId:card.id,month:10,year:2026,startDate:new Date('2026-09-11'),cutDate:new Date('2026-10-10'),dueDate:new Date('2026-10-30'),statementAmount:amount}});
  await db.capturePaymentPolicy.create({data:{userId,cardId:card.id,source,mode:'OBSERVATION',acceptedAt:new Date()}});
  cards.push(card);
 }
 const firstCard = cards[0];
 if (!firstCard) throw new Error('Falta la primera tarjeta ficticia.');
 await db.captureCardAlias.create({data:{userId,cardId:firstCard.id,sourcePackage:'com.citibanamex.banamexmobile',kind:'PHYSICAL',value:'0123',verifiedAt:new Date(),evidence:'Ficticia para prueba local'}});
 const secret=randomBytes(32).toString('base64url');
 const device=await db.captureDevice.create({data:{userId,secretHash:createHash('sha256').update(secret).digest('hex'),approvedAt:new Date(),name:'Receptores ficticios'}});
 fs.writeFileSync(process.env.AFP_RECEIVER_TEST_CONTEXT || '/tmp/afp-receiver-browser-context.json',JSON.stringify({authorization:`Capture ${device.id}.${secret}`,deviceId:device.id,userId}),{mode:0o600});
 console.log('Fixture local listo: dos tarjetas, dos cortes y reglas en observación.');
} finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
