// Ejecutar solo al publicar esta función y autorizar su activación.
// DIRECT_URL, CRON_SECRET y AFP_ORIGIN deben corresponder al mismo entorno.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const command = `
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'afp_capture_fallback_url'),
  headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
    'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'afp_capture_fallback_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 60000
)
WHERE EXISTS (SELECT 1 FROM public.capture_movements
  WHERE reason = 'BANK_FALLBACK_WAIT' AND status = 'REVIEW' AND "fallbackDueAt" <= now());`;

async function configure(db, origin, secret) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('AFP_ORIGIN debe ser el origen HTTPS público de AFP.');
  if (!secret || secret.length < 32) throw new Error('CRON_SECRET debe coincidir con Vercel y tener al menos 32 caracteres.');
  // No instala extensiones ni altera permisos: comprobar disponibilidad primero.
  const [extensions] = await db.$queryRaw`SELECT to_regclass('cron.job') IS NOT NULL AND to_regclass('vault.secrets') IS NOT NULL AND to_regnamespace('net') IS NOT NULL AS ready`;
  if (!extensions.ready) throw new Error('Faltan pg_cron, pg_net o Vault en este entorno.');
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(705197042)::text`;
    for (const [name, value] of [['afp_capture_fallback_url', `${url.origin}/api/cron/capture-bank-fallback`], ['afp_capture_fallback_secret', secret]]) {
      const rows = await tx.$queryRaw`SELECT id FROM vault.secrets WHERE name = ${name}`;
      if (rows.length > 1) throw new Error('Hay secretos repetidos; revisa Vault.');
      if (rows.length) await tx.$queryRaw`SELECT vault.update_secret(${rows[0].id}::uuid, ${value}::text)::text`;
      else await tx.$queryRaw`SELECT vault.create_secret(${value}::text, ${name}::text)`;
    }
    // El nombre hace la programación idempotente. No modifica el cron de Calendar.
    await tx.$queryRaw`SELECT cron.schedule('afp-capture-bank-fallback', '* * * * *', ${command})`;
    return { configured: true, interval: '1 minute', requests: 'only when due' };
  });
}
module.exports = { command, configure };
if (require.main === module) {
  if (!process.env.DIRECT_URL) throw new Error('Falta DIRECT_URL.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
  configure(db, process.env.AFP_ORIGIN, process.env.CRON_SECRET)
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('No se pudo configurar el respaldo. Revisa origen, secreto y extensiones sin imprimir credenciales.'); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
