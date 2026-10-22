// Retira la antigua comprobación de cinco minutos. El cron diario vive en vercel.json.
// node --env-file=.env --env-file=.env.local scripts/configure-calendar-cron.cjs
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  if (!process.env.DIRECT_URL) throw new Error('Falta DIRECT_URL.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
  try {
    const [extension] = await db.$queryRaw`SELECT to_regclass('cron.job') IS NOT NULL AS installed`;
    if (!extension.installed) {
      console.log('No existe una tarea antigua de Calendar. Se usa sincronización por cambios y la revisión diaria de Vercel.');
      return;
    }
    const jobs = await db.$queryRaw`SELECT jobid FROM cron.job WHERE jobname = 'afp-google-calendar-sync'`;
    for (const job of jobs) await db.$queryRaw`SELECT cron.unschedule(${job.jobid}::bigint)`;
    console.log(`Tareas de cinco minutos retiradas: ${jobs.length}. Calendar se sincroniza por cambios; Vercel conserva la revisión diaria.`);
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('No se pudo retirar la tarea antigua. Revisa DIRECT_URL y los permisos de pg_cron.'); process.exitCode = 1; });
