import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(__dirname, '../..');

export function copyNextConfiguration(target: string) {
  // Solo el programa web: los tsconfig de pruebas referencian archivos ausentes
  // en el fixture. Nunca copiar .env ni tipos generados de otra compilación.
  for (const name of ['tsconfig.json', 'package.json', 'postcss.config.mjs']) {
    fs.copyFileSync(path.join(root, name), path.join(target, name));
  }
  if (fs.existsSync(path.join(root, 'types'))) fs.cpSync(path.join(root, 'types'), path.join(target, 'types'), { recursive: true });
}
export function generateNextTypes(target: string) {
  const result = spawnSync(path.join(root, 'node_modules/.bin/next'), ['typegen'], {
    cwd: target, env: process.env, encoding: 'utf8', timeout: 60000,
  });
  if (result.status !== 0) throw new Error(`Falló next typegen del fixture: ${result.stderr}\n${result.stdout}`);
}
