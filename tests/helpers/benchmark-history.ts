import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fixtureConnection } from './fixture-database';
import { financialLoader, testHandler, testReply } from './financial-fixtures';
import { record, array } from './dynamic-values';

const connectionString = fixtureConnection();
const modes = ['dashboard', 'header', 'cycles', 'detail', 'expenses', 'bootstrap'] as const;
type Mode = typeof modes[number];
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? String(item) : item));
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;

async function worker() {
  const [, , , modeValue, variant, owner, cycleId, baseline] = process.argv;
  if (!owner || !cycleId || !baseline || !modes.includes(modeValue as Mode)) throw new Error('Argumentos incompletos.');
  const mode = modeValue as Mode;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: [{ level: 'query', emit: 'event' }] });
  let queries = 0, databaseBytes = 0, peakHeap = 0;
  client.$on('query', () => { queries++; });
  const sample = () => { peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed); };
  const db = client.$extends({ query: { async $allOperations({ args, query }) {
    const result: unknown = await query(args); databaseBytes += bytes(result); sample(); return result;
  } } });
  const load = financialLoader({ '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: { json: testReply } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) } }) },
  });
  const resource = mode === 'header' && variant === 'after' ? 'dashboard/summary' : mode === 'header' ? 'dashboard' : mode === 'cycles' || mode === 'detail' ? 'card-cycles' : mode === 'bootstrap' ? 'gastos/bootstrap' : mode;
  const baselineFile = resource === 'gastos/bootstrap' ? 'bootstrap.ts' : `${resource}.ts`;
  const file = variant === 'before' ? path.join(baseline, baselineFile) : `src/app/api/${resource}/route.ts`;
  const handler = testHandler(record(load(file)).GET);
  const url = `http://localhost/api/${resource}?clientDate=2026-10-29&${mode === 'detail' ? `cycleId=${cycleId}` : mode === 'cycles' ? 'year=2026' : mode === 'expenses' || mode === 'bootstrap' ? 'startDate=2026-10-01' : ''}`;
  const run = async () => {
    const result = await handler({ url, headers: new Headers({ authorization: 'Bearer synthetic' }) });
    if (result.status !== 200) throw new Error(JSON.stringify(result));
    sample(); return bytes(result.body);
  };
  try {
    await run();
    const samples: { ms: number; queries: number; responseBytes: number; databaseBytes: number; retainedHeapBytes: number; observedHeapGrowthBytes: number }[] = [];
    for (let i = 0; i < 5; i++) {
      global.gc?.(); queries = 0; databaseBytes = 0; peakHeap = process.memoryUsage().heapUsed;
      const startHeap = peakHeap, start = performance.now();
      const responseBytes = await run();
      samples.push({ ms: performance.now() - start, queries, responseBytes, databaseBytes, retainedHeapBytes: Math.max(0, process.memoryUsage().heapUsed - startHeap), observedHeapGrowthBytes: Math.max(0, peakHeap - startHeap) });
    }
    process.stdout.write(JSON.stringify({ mode, variant, repetitions: 5, p50Ms: percentile(samples.map(s => s.ms), 0.5), p95Ms: percentile(samples.map(s => s.ms), 0.95),
      queries: [...new Set(samples.map(s => s.queries))], responseBytes: samples[0]!.responseBytes, databaseBytes: samples[0]!.databaseBytes,
      p95ObservedHeapGrowthBytes: percentile(samples.map(s => s.observedHeapGrowthBytes), 0.95), maxRssKiB: process.resourceUsage().maxRSS, samples }));
  } finally { await client.$disconnect(); }
}

async function benchmark() {
  const previous: unknown = process.argv[2] === '--refresh-after' && process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null;
  const previousResults = previous ? array(record(previous).results).map(record) : [];
  const baseline = mkdtempSync(path.join(tmpdir(), 'afp-history-before-'));
  const commit = process.env.AFP_A13_BASE_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Commit base no válido.');
  for (const [name, source] of [['dashboard', 'dashboard'], ['card-cycles', 'card-cycles'], ['expenses', 'expenses'], ['bootstrap', 'gastos/bootstrap']]) {
    writeFileSync(path.join(baseline, `${name}.ts`), execFileSync('git', ['show', `${commit}:src/app/api/${source}/route.ts`]));
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const results: unknown[] = [];
  try {
    for (const size of [1000, 10000, 100000]) {
      const owner = await db.user.create({ data: { email: `benchmark-${randomUUID()}@example.test` } });
      try {
        const category = await db.category.create({ data: { userId: owner.id, name: 'Prueba sintética' } });
        const card = await db.card.create({ data: { userId: owner.id, name: 'Tarjeta sintética', usualCutDay: 31, usualDueDay: 20 } });
        await db.$executeRaw`INSERT INTO daily_expenses (id, "userId", "categoryId", "cardId", concept, date, amount, "paymentMethod", "updatedAt")
          SELECT 'bench-' || ${owner.id} || '-' || n, ${owner.id}, ${category.id}, ${card.id}, repeat('Comercio sintético ', 5),
            timestamp '2018-01-01' + (n % 2200) * interval '1 day', 100.01, 'CARD', now() FROM generate_series(1, ${size}::integer) n`;
        await db.dailyExpense.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ userId: owner.id, cardId: card.id, categoryId: category.id,
          concept: `Compra reciente ${i}`, amount: 10.01, paymentMethod: 'CARD' as const, date: new Date(`2026-10-${String(i % 28 + 1).padStart(2, '0')}`) })) });
        await db.cardCycle.createMany({ data: Array.from({ length: 120 }, (_, i) => ({ userId: owner.id, cardId: card.id, year: 2017 + Math.floor(i / 12), month: i % 12 + 1,
          startDate: new Date(Date.UTC(2017 + Math.floor(i / 12), i % 12, 1)), cutDate: new Date(Date.UTC(2017 + Math.floor(i / 12), i % 12 + 1, 0)),
          dueDate: new Date(Date.UTC(2017 + Math.floor(i / 12), i % 12 + 1, 20)), statementAmount: 0 })) });
        const cycle = await db.cardCycle.findFirstOrThrow({ where: { userId: owner.id, year: 2026, month: 10 } });
        await db.installmentPurchase.createMany({ data: Array.from({ length: Math.floor(size / 100) }, (_, i) => ({ userId: owner.id, categoryId: category.id, cardId: card.id,
          concept: `MSI histórica ${i}`, purchaseDate: new Date('2018-01-01'), months: 12, totalAmount: 1200, status: 'PAID_OFF' as const })) });
        for (const mode of modes) for (const variant of ['before', 'after']) {
          if (variant === 'before' && previousResults.length) { const saved = previousResults.find(row => row.historicalExpenses === size && row.mode === mode && row.variant === 'before'); if (!saved) throw new Error('Falta una medición base.'); results.push(saved); continue; }
          if (mode === 'header' && variant === 'before') { const prior = results.findLast(row => record(row).historicalExpenses === size && record(row).mode === 'dashboard' && record(row).variant === 'before'); results.push({ ...record(prior), mode: 'header', reusedDashboardBaseline: true }); continue; }
          const result: unknown = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--import', 'tsx', 'tests/helpers/benchmark-history.ts', '--worker', mode, variant, owner.id, cycle.id, baseline], {
            encoding: 'utf8', env: process.env, maxBuffer: 10 * 1024 * 1024,
          }));
          results.push({ historicalExpenses: size, ...record(result) });
          process.stderr.write(`${size} ${mode} ${variant}: ${record(result).p95Ms} ms\n`);
        }
      } finally { await db.user.delete({ where: { id: owner.id } }); }
    }
    process.stdout.write(JSON.stringify({ baselineCommit: commit, node: process.version, postgres: '16 (contenedor local)', measuredAt: new Date().toISOString(), baselineMeasuredAt: previous ? record(previous).measuredAt : undefined,
      methodology: 'Procesos independientes, un calentamiento y cinco repeticiones; p95 nearest-rank. Bytes JSON sin compresión. SQL contado por eventos Prisma; bytes devueltos por operaciones superiores, relaciones incluidas. Heap observado en fronteras de consultas/respuesta, no máximo absoluto. RSS máximo del proceso completo. Auth simulada; sin red HTTP ni navegador.', results }, null, 2));
  } finally { await db.$disconnect(); rmSync(baseline, { recursive: true, force: true }); }
}
void (process.argv[2] === '--worker' ? worker() : benchmark()).catch(error => { console.error(error); process.exitCode = 1; });
