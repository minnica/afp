import assert from 'node:assert/strict';
import { test } from 'node:test';
import { present, sparseCalculations, uncheckedFixture } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const helpers = sparseCalculations(sourceLoader()("src/lib/cardUsagePresentation.ts"));
const row = (name: string, cutDate: string | null, year = 2026, month = 10) => ({ card: { name }, selectedCycle: { cutDate, year, month } });

test("cortes próximos primero, fechas ausentes al final y empates por nombre", () => {
  const items = [row("Sin fecha", null), row("Noviembre", "2026-11-08"), row("B", "2026-10-18"), row("A", "2026-10-18")];
  const before = JSON.stringify(items);
  assert.deepEqual(Array.from(uncheckedFixture(helpers.sortUsageByCutDate, items), (item) => present(item.card).name), ["A", "B", "Noviembre", "Sin fecha"]);
  assert.deepEqual(Array.from(uncheckedFixture(helpers.sortUsageByCutDate, items, "desc"), (item) => present(item.card).name), ["Noviembre", "A", "B", "Sin fecha"]);
  assert.equal(JSON.stringify(items), before);
});

test("historial distingue años, deduplica períodos y ofrece el más reciente primero", () => {
  const options = uncheckedFixture(helpers.usageHistoryOptions, [row("A", "2026-12-08", 2026, 12), row("B", "2026-12-18", 2026, 12), row("A", "2027-01-08", 2027, 1)]);
  assert.deepEqual(Array.from(options, (option) => option.value), ["2027-01", "2026-12"]);
  assert.equal(present(options[0]).label, "Enero de 2027");
});

test("renovaciones de Turbo se ordenan junto a los cortes por su fecha límite", () => {
  const nu = { card: { name: "Nu" }, requirementType: "PURCHASE_FREQUENCY", renewBy: "2026-10-17" };
  const items = [row("Después", "2026-10-18"), nu, row("Antes", "2026-10-16")];
  assert.deepEqual(Array.from(uncheckedFixture(helpers.sortUsageByCutDate, items), (item) => present(item.card).name), ["Antes", "Nu", "Después"]);
  assert.equal(uncheckedFixture(helpers.usageHistoryPeriod, nu), "");
});

test("fecha de corte respeta el día almacenado y hoy, mañana y días restantes", () => {
  const today = new Date(Date.UTC(2026, 9, 13, 23, 45) + 6 * 3600000);
  assert.equal(uncheckedFixture(helpers.formatUsageCutDate, row("A", "2026-10-13T00:00:00Z"), today), "Corte: 13 oct · hoy");
  assert.equal(uncheckedFixture(helpers.formatUsageCutDate, row("A", "2026-10-14T00:00:00Z"), today), "Corte: 14 oct · mañana");
  assert.equal(uncheckedFixture(helpers.formatUsageCutDate, row("A", "2026-10-18T00:00:00Z"), today), "Corte: 18 oct · en 5 días");
  assert.equal(uncheckedFixture(helpers.formatUsageCutDate, { ...row("A", "2026-10-08"), periodVerified: true }, today, true), "Corte: 8 oct");
  assert.equal(uncheckedFixture(helpers.formatUsageCutDate, { card: { name: "A" } }, today), "Período sin registrar");
});
