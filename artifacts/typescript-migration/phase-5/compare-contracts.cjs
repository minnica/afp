// Compare synthetic fixtures with the JavaScript implementation at baseCommit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const manifest = require('./execution.json');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'afp-phase5-reference-'));
const plain = value => JSON.parse(JSON.stringify(value));
try {
  const archive = execFileSync('git', ['archive', manifest.baseCommit, 'src/lib'], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', temporary], { input: archive });
  fs.mkdirSync(path.join(temporary, 'tests/helpers'), { recursive: true });
  fs.copyFileSync(path.join(root, 'tests/helpers/load-source.cjs'), path.join(temporary, 'tests/helpers/load-source.cjs'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'));
  const previous = require(path.join(temporary, 'tests/helpers/load-source.cjs')).sourceLoader;
  const current = require(path.join(root, 'tests/helpers/load-source.cjs')).sourceLoader;
  const oldParsers = previous()('src/lib/captureParsers.js');
  const newParsers = current()('src/lib/captureParsers.ts');
  const fixtures = path.join(root, 'tests/fixtures/captures');
  const captures = [];
  for (const name of fs.readdirSync(fixtures).filter(name => name.endsWith('.json')).sort()) {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
    if (!fixture.event) continue;
    const before = plain(oldParsers.interpretCapture(fixture.event));
    assert.deepEqual(plain(newParsers.interpretCapture(fixture.event)), before, name);
    captures.push({ fixture: name, interpretation: before });
  }
  const environment = { process: { env: { AFP_APP_ORIGIN: 'https://example.test',
    GOOGLE_CALENDAR_CLIENT_ID: 'fictitious', GOOGLE_CALENDAR_CLIENT_SECRET: 'fictitious',
    CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64') } } };
  const oldConfig = previous({}, environment)('src/lib/calendar/config.js');
  const newConfig = current({}, environment)('src/lib/calendar/config');
  const ciphertext = oldConfig.encryptSecret('historical-fictitious-token', 'synthetic-owner');
  assert.equal(newConfig.decryptSecret(ciphertext, 'synthetic-owner'), 'historical-fictitious-token');
  const reverse = newConfig.encryptSecret('new-fictitious-token', 'synthetic-owner');
  assert.equal(oldConfig.decryptSecret(reverse, 'synthetic-owner'), 'new-fictitious-token');
  assert.throws(() => newConfig.decryptSecret(ciphertext, 'another-owner'));
  const oldEvents = previous()('src/lib/calendar/events.js');
  const newEvents = current()('src/lib/calendar/events');
  const data = { cards: [{ id: 'synthetic-card', name: 'Tarjeta ficticia', usualCutDay: 10, usualDueDay: 28 }],
    cycles: [{ id: 'synthetic-cycle', cardId: 'synthetic-card', year: 2026, month: 10,
      cutDate: new Date('2026-10-10T12:00:00Z'), dueDate: new Date('2026-10-28T12:00:00Z'),
      statementAmount: 100.25, paidAmount: 30.10, postCutCreditAmount: 0, datesConfirmedAt: new Date('2026-10-10T12:00:00Z') }],
    subscriptions: [], receivables: [], payables: [] };
  const settings = { types: ['cuts', 'cardPayments'], showAmounts: true, reminders: true };
  const now = new Date('2026-10-28T12:00:00Z');
  const agenda = plain(oldEvents.buildCalendarEvents(data, settings, now));
  assert.deepEqual(plain(newEvents.buildCalendarEvents(data, settings, now)), agenda);
  const connection = { id: 'synthetic-connection', preferences: settings };
  const payloads = agenda.events.map(event => {
    const original = plain(oldEvents.googleEvent(event, connection, 'https://example.test'));
    assert.deepEqual(plain(newEvents.googleEvent(event, connection, 'https://example.test')), original);
    return original;
  });
  const report = { baseCommit: manifest.baseCommit, captures, agenda, payloads, encryption: {
    format: 'v1.AES-256-GCM', historicalCiphertext: ciphertext,
    previousToCurrent: true, currentToPrevious: true, ownerBinding: true,
  } };
  fs.writeFileSync(path.join(__dirname, 'compatibility.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${captures.length} capture interpretations identical; encrypted v1 credentials compatible in both directions.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
