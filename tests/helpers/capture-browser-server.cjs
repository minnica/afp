// Interfaz/API reales; Auth ficticia y PostgreSQL local desechable. No carga .env.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const root = path.resolve(__dirname, '../..');
const os = require('node:os');
const qaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afp-capture-qa-'));
const connectionString = process.env.AFP_TEST_DATABASE_URL;
const productionFixture = process.env.AFP_CAPTURE_TEST_PRODUCTION === '1';
if (!connectionString) throw new Error('Falta AFP_TEST_DATABASE_URL.');
const database = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(database.hostname) || !/^\/afp_test[a-zA-Z0-9_]*$/.test(database.pathname) || database.search) throw new Error('Solo permite PostgreSQL local afp_test.');
for (const name of ['node_modules', 'public']) {
  if (!fs.existsSync(path.join(qaDir, name))) fs.symlinkSync(path.join(root, name), path.join(qaDir, name), 'dir');
}
fs.cpSync(path.join(root, 'src'), path.join(qaDir, 'src'), { recursive: true });
for (const name of ['package.json', 'jsconfig.json', 'postcss.config.mjs']) fs.copyFileSync(path.join(root, name), path.join(qaDir, name));
const origin = 'http://127.0.0.1:4208';
process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-public-key';
process.env.DATABASE_URL = connectionString;
process.env.DIRECT_URL = process.env.DATABASE_URL;
const { PrismaClient } = require('../../node_modules/@prisma/client');
const { PrismaPg } = require('../../node_modules/@prisma/adapter-pg');
const next = require('../../node_modules/next');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const user = { id: '00000000-0000-4000-8000-000000000091', aud: 'authenticated', email: 'capture-qa@example.test' };
const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 2000000000, role: 'authenticated' })).toString('base64url')}.fake`;
if (productionFixture) {
  // Compilación aislada: no copia .env ni permite una BD remota. Evita que HMR
  // reinicie interacciones durante pruebas simultáneas de navegador/teléfono.
  const built = require('node:child_process').spawnSync(path.join(root, 'node_modules/.bin/next'), ['build', '--webpack'], {
    cwd: qaDir, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 180000,
  });
  if (built.status !== 0) throw new Error(`Falló la compilación del fixture local: ${built.stderr}\n${built.stdout}`);
}
const app = next({ dev: !productionFixture, webpack: true, dir: qaDir, hostname: '127.0.0.1', port: 4208,
  conf: { devIndicators: false, allowedDevOrigins: ['127.0.0.1'], experimental: { externalDir: true } } });
async function main() {
  await db.user.upsert({ where: { id: user.id }, create: { id: user.id, email: user.email }, update: {} });
  await app.prepare();
  const handle = app.getRequestHandler();
  const handler = async (req, res) => {
    const url = new URL(req.url, origin);
    const send = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/auth/v1/token') return send({ access_token: token, refresh_token: 'fake-refresh', expires_in: 3600, token_type: 'bearer', user });
    if (url.pathname === '/auth/v1/user') return req.headers.authorization === `Bearer ${token}` || req.headers.authorization === 'Bearer capture-instrumentation' ? send(user) : send({ message: 'Invalid token' }, 401);
    if (url.pathname.startsWith('/auth/')) return send({});
    if (url.pathname === '/api/setup-user') return send({ ok: true });
    if (url.pathname === '/api/settings') return send({ categories: [], people: [], incomeTypes: [] });
    if (url.pathname === '/api/dashboard') return send({ importantNotices: [], cardUsageWaiversCurrent: [], cardUsageWaiverHistory: [] });
    if (url.pathname === '/api/notice-dismissals') return send({ dismissals: [] });
    return handle(req, res);
  };
  http.createServer(handler).listen(4208, '127.0.0.1', async () => {
    // Compilar secuencialmente antes de la prueba evita carreras del servidor de desarrollo.
    for (const [route, method] of [['events', 'POST'], ['device', 'GET'], ['pairings', 'PATCH'], ['devices', 'GET']]) {
      const response = await fetch(`${origin}/api/captures/${route}`, { method });
      if (response.status !== 401) throw new Error(`Fallo preparando ${route}: HTTP ${response.status}`);
    }
    console.log('Capture API ready on 4208; protected routes compiled.');
  });
  if (process.env.AFP_CAPTURE_TEST_KEY && process.env.AFP_CAPTURE_TEST_CERTIFICATE) https.createServer({ key: fs.readFileSync(process.env.AFP_CAPTURE_TEST_KEY), cert: fs.readFileSync(process.env.AFP_CAPTURE_TEST_CERTIFICATE) }, handler)
    .listen(4209, '127.0.0.1', () => console.log('Capture QA HTTPS ready on 4209'));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
