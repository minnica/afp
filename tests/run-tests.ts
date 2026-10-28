import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

// Solo entradas ejecutables del primer nivel. Los contratos de tipos, helpers y
// seeds nunca se descubren como pruebas. Rechazar entradas JS evita ocultar
// escenarios si se reintroduce accidentalmente un archivo anterior a la migración.
export function discoverTests(directory = __dirname, selectedFiles: readonly string[] = []): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const legacyFiles = entries
    .filter(entry => entry.isFile() && /.+\.test\.(?:cjs|mjs|js|jsx)$/.test(entry.name))
    .map(entry => entry.name).sort();
  const files = entries
    .filter(entry => entry.isFile() && /.+\.test\.ts$/.test(entry.name))
    .map(entry => entry.name).sort();
  for (const file of legacyFiles) {
    const name = file.replace(/\.(?:cjs|mjs|js|jsx)$/, '');
    if (files.includes(`${name}.ts`)) throw new Error(`Nombre de prueba duplicado: ${name}`);
  }
  if (legacyFiles.length) throw new Error(`Pruebas sin migrar a TypeScript: ${legacyFiles.join(', ')}`);
  if (!files.length) throw new Error(`No se encontraron pruebas en ${directory}`);
  const discovered = files.map(file => path.resolve(directory, file));
  const selected = new Set<string>();
  for (const file of selectedFiles) {
    // Admite el nombre, una ruta relativa al cwd o una ruta absoluta exacta.
    const full = path.resolve(path.basename(file) === file ? directory : process.cwd(), file);
    if (!discovered.includes(full)) throw new Error(`Prueba no descubierta: ${file}`);
    if (selected.has(full)) throw new Error(`Prueba seleccionada más de una vez: ${file}`);
    selected.add(full);
  }
  return selected.size ? discovered.filter(file => selected.has(file)) : discovered;
}

export function runTests({
  directory = __dirname,
  selectedFiles = [],
  env = process.env,
  executable = process.execPath,
}: {
  directory?: string;
  selectedFiles?: readonly string[];
  env?: NodeJS.ProcessEnv;
  executable?: string;
} = {}): number {
  const files = discoverTests(directory, selectedFiles);
  const result = spawnSync(executable, [
    '--import', 'tsx', '--test', '--experimental-test-isolation=none', ...files,
  ], { cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit' });
  if (result.error) throw new Error(`No se pudo iniciar node:test: ${result.error.message}`, { cause: result.error });
  if (result.signal) throw new Error(`node:test terminó por señal ${result.signal}`);
  if (result.status === null) throw new Error('node:test terminó sin código de salida');
  return result.status;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const list = args[0] === '--list';
    const selectedFiles = list ? args.slice(1) : args;
    if (selectedFiles.some(arg => arg.startsWith('-'))) throw new Error('Uso: pnpm test [--list] [archivo.test.ts …]');
    if (list) console.log(JSON.stringify(discoverTests(__dirname, selectedFiles).map(file => path.relative(process.cwd(), file))));
    else process.exitCode = runTests({ selectedFiles });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
