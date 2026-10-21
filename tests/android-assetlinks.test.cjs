const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFingerprint, createStatements, verifyStatements } = require("../scripts/android-assetlinks.cjs");

const fingerprint = "AB".repeat(32);

test("Digital Asset Links valida huellas SHA-256 y conserva la identidad de producción", () => {
  const statements = createStatements(fingerprint.toLowerCase());
  assert.equal(normalizeFingerprint(fingerprint), Array(32).fill("AB").join(":"));
  assert.equal(statements[0].target.package_name, "com.garatachia.afp");
  assert.equal(verifyStatements(statements, fingerprint), true);
  for (const value of [undefined, "", "AB", "GH".repeat(32), `${fingerprint}\n`]) {
    assert.throws(() => normalizeFingerprint(value));
  }
});

test("Digital Asset Links rechaza una firma, paquete o relación distintos y contenido inválido", () => {
  assert.equal(verifyStatements(createStatements(fingerprint), "CD".repeat(32)), false);
  for (const invalid of [null, {}, [], [null], [true], [{ relation: 1 }], [{ relation: "delegate_permission/common.handle_all_urls" }], [{ target: {} }]]) {
    assert.equal(verifyStatements(invalid, fingerprint), false);
  }
  const dev = createStatements(fingerprint);
  dev[0].target.package_name += ".dev";
  assert.equal(verifyStatements(dev, fingerprint), false);
  const noRelation = createStatements(fingerprint);
  noRelation[0].relation = [];
  assert.equal(verifyStatements(noRelation, fingerprint), false);
});
