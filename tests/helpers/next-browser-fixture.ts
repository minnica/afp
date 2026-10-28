import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import type createNextServer from 'next';
import { copyNextConfiguration, generateNextTypes } from './next-fixture';
import { fixtureConnection, fixtureDatabase } from './fixture-database';

interface BrowserFixtureOptions {
  kind: 'money' | 'capture';
  port: number;
}

// Comparte exclusivamente infraestructura; las API de dominio siguen siendo reales.
export async function runNextBrowserFixture({ kind, port }: BrowserFixtureOptions) {
  const connectionString = fixtureConnection();
  if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('Puerto de fixture no válido.');
  const root = path.resolve(__dirname, '../..');
  const qaDir = fs.mkdtempSync(path.join(os.tmpdir(), `afp-${kind}-qa-`));
  const origin = `http://127.0.0.1:${port}`;
  const productionFixture = process.env.AFP_CAPTURE_TEST_PRODUCTION === '1';
  const servers: Server[] = [];
  let db: Awaited<ReturnType<typeof fixtureDatabase>> | undefined;
  let app: ReturnType<typeof createNextServer> | undefined;
  let stop: (() => void) | undefined;
  const stopped = new Promise<void>(resolve => { stop = resolve; });
  const onSignal = () => stop?.();
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  try {
    for (const name of ['node_modules', 'public']) fs.symlinkSync(path.join(root, name), path.join(qaDir, name), 'dir');
    fs.cpSync(path.join(root, 'src'), path.join(qaDir, 'src'), { recursive: true });
    copyNextConfiguration(qaDir);
    process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-public-key';
    process.env.DATABASE_URL = connectionString;
    process.env.DIRECT_URL = connectionString;
    // Next y Prisma se cargan después de preparar el entorno local.
    db = await fixtureDatabase(connectionString);
    const { default: next } = await import('next');
    const user = { id: kind === 'money' ? '00000000-0000-4000-8000-000000000094' : '00000000-0000-4000-8000-000000000091',
      aud: 'authenticated', email: `${kind}-qa@example.test` };
    const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 2000000000, role: 'authenticated' })).toString('base64url')}.fake`;
    generateNextTypes(qaDir);
    if (productionFixture) {
      const built = spawnSync(path.join(root, 'node_modules/.bin/next'), ['build', '--webpack'], {
        cwd: qaDir, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 180000,
      });
      if (built.status !== 0) throw new Error(`Falló la compilación del fixture local: ${built.stderr}\n${built.stdout}`);
    }
    app = next({ dev: !productionFixture, webpack: true, dir: qaDir, hostname: '127.0.0.1', port,
      conf: { devIndicators: false, allowedDevOrigins: ['127.0.0.1'], experimental: { externalDir: true } } });
    await db.user.upsert({ where: { id: user.id }, create: { id: user.id, email: user.email }, update: {} });
    await app.prepare();
    const handle = app.getRequestHandler();
    const handler = async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', origin);
      const send = (body: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
      if (url.pathname === '/auth/v1/token' || (kind === 'money' && url.pathname === '/qa-login')) return send({ access_token: token, refresh_token: 'fake-refresh', expires_in: 3600, token_type: 'bearer', user });
      if (url.pathname === '/auth/v1/user') return req.headers.authorization === `Bearer ${token}` || req.headers.authorization === 'Bearer capture-instrumentation' ? send(user) : send({ message: 'Invalid token' }, 401);
      if (url.pathname.startsWith('/auth/')) return send({});
      if (url.pathname === '/api/setup-user') return send({ ok: true });
      if (url.pathname === '/api/settings' && (kind === 'capture' || process.env.AFP_UI_TEST_REAL_SETTINGS !== '1')) return send({ categories: [], people: [], incomeTypes: [] });
      if (url.pathname === '/api/dashboard' && process.env.AFP_CAPTURE_TEST_REAL_DASHBOARD !== '1') return send({ importantNotices: [], cardUsageWaiversCurrent: [], cardUsageWaiverHistory: [] });
      if (url.pathname === '/api/notice-dismissals') return send({ dismissals: [] });
      return handle(req, res);
    };
    const listener = (req: IncomingMessage, res: ServerResponse) => {
      void handler(req, res).catch((error: unknown) => { console.error(error); res.destroy(); });
    };
    const server = http.createServer(listener);
    servers.push(server);
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
    const key = process.env.AFP_CAPTURE_TEST_KEY;
    const certificate = process.env.AFP_CAPTURE_TEST_CERTIFICATE;
    if (key && certificate) {
      const secure = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(certificate) }, listener);
      servers.push(secure);
      secure.listen(port + 1, '127.0.0.1');
      await once(secure, 'listening');
      console.log(`Capture QA HTTPS ready on ${port + 1}`);
    }
    const warmups = kind === 'money' ? [['/api/money', 'GET']] : [
      ['/api/captures/events', 'POST'], ['/api/captures/device', 'GET'], ['/api/captures/pairings', 'PATCH'], ['/api/captures/devices', 'GET'],
    ];
    for (const [route, method] of warmups) {
      const response = await fetch(`${origin}${route}`, { method });
      if (response.status !== 401) throw new Error(`Fallo preparando ${route}: HTTP ${response.status}`);
    }
    console.log('Fixture directory:', qaDir);
    console.log(kind === 'money' ? `Money/UI QA ready on ${port}; real API and local PostgreSQL.` : 'Capture API ready on 4208; protected routes compiled.');
    await stopped;
  } finally {
    try {
      await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
        if (!server.listening) { resolve(); return; }
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      })));
    } finally {
      try { await app?.close(); }
      finally {
        try { await db?.$disconnect(); }
        finally {
          fs.rmSync(qaDir, { recursive: true, force: true });
          process.removeListener('SIGTERM', onSignal);
          process.removeListener('SIGINT', onSignal);
          console.log('Fixture cerrado y directorio temporal eliminado.');
        }
      }
    }
  }
}
