const fs = require("node:fs");
const path = require("node:path");

const productionPackage = "com.garatachia.afp";
const productionOrigin = "https://finanzas.garatachia.com";
const destination = path.resolve(__dirname, "../public/.well-known/assetlinks.json");

function normalizeFingerprint(value) {
  if (typeof value !== "string") throw new Error("Falta la huella SHA-256 pública del certificado de la APK.");
  const compact = value.replaceAll(":", "").toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(compact)) throw new Error("La huella debe ser SHA-256 (32 bytes hexadecimales).");
  return compact.match(/.{2}/g).join(":");
}

function createStatements(fingerprint) {
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: productionPackage,
      sha256_cert_fingerprints: [normalizeFingerprint(fingerprint)],
    },
  }];
}

function verifyStatements(statements, fingerprint) {
  const expected = normalizeFingerprint(fingerprint);
  return Array.isArray(statements) && statements.some(statement =>
    statement !== null && typeof statement === "object" &&
    Array.isArray(statement.relation) && statement.relation.includes("delegate_permission/common.handle_all_urls") &&
    statement.target?.namespace === "android_app" &&
    statement.target.package_name === productionPackage &&
    Array.isArray(statement.target.sha256_cert_fingerprints) &&
    statement.target.sha256_cert_fingerprints.some(value => {
      try { return normalizeFingerprint(value) === expected; } catch { return false; }
    }));
}

async function main(args) {
  const [mode, fingerprint] = args;
  const statements = createStatements(fingerprint);
  if (mode === "generate") {
    // Evita retirar identidades anteriores durante una rotación accidental.
    if (fs.existsSync(destination)) {
      const current = JSON.parse(fs.readFileSync(destination, "utf8"));
      if (!verifyStatements(current, fingerprint)) throw new Error("assetlinks.json ya existe con otra identidad. Revisa la rotación antes de reemplazarlo.");
      console.log("Digital Asset Links ya declara esta identidad; se conservaron todas las declaraciones existentes.");
      return;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(statements, null, 2)}\n`);
    console.log("Digital Asset Links generado para la APK de producción; falta publicarlo y verificarlo en el dominio.");
  } else if (mode === "check") {
    const response = await fetch(`${productionOrigin}/.well-known/assetlinks.json`, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(`Digital Asset Links no disponible como JSON público (HTTP ${response.status}).`);
    }
    if (!verifyStatements(await response.json(), fingerprint)) throw new Error("El dominio no declara esta identidad de producción.");
    console.log("El dominio publica la identidad esperada. Verifica también la apertura sin barra del navegador en el teléfono.");
  } else {
    throw new Error("Uso: node scripts/android-assetlinks.cjs generate|check <SHA256 público>");
  }
}

module.exports = { normalizeFingerprint, createStatements, verifyStatements };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
