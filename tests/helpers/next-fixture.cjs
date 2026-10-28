const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');

function copyNextConfiguration(target) {
  // Solo el programa web: los tsconfig de pruebas referencian archivos ausentes
  // en el fixture. Nunca copiar .env ni tipos generados de otra compilación.
  for (const name of fs.readdirSync(root)) {
    if (name === 'tsconfig.json' || (name.endsWith('.d.ts') && name !== 'next-env.d.ts') || ['package.json', 'postcss.config.mjs'].includes(name)) {
      fs.copyFileSync(path.join(root, name), path.join(target, name));
    }
  }
  if (fs.existsSync(path.join(root, 'types'))) fs.cpSync(path.join(root, 'types'), path.join(target, 'types'), { recursive: true });
}
function generateNextTypes(target) {
  const result = spawnSync(path.join(root, 'node_modules/.bin/next'), ['typegen'], {
    cwd: target, env: process.env, encoding: 'utf8', timeout: 60000,
  });
  if (result.status !== 0) throw new Error(`Falló next typegen del fixture: ${result.stderr}\n${result.stdout}`);
}
module.exports = { copyNextConfiguration, generateNextTypes };
