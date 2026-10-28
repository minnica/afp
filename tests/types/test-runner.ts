import { discoverTests, runTests } from '../run-tests';

const files: string[] = discoverTests('tests', ['latest-request.test.ts']);
const status: number = runTests({ selectedFiles: files, env: { ...process.env, AFP_RUNNER_PROBE: 'fictitious' } });
void status;

// @ts-expect-error La selección exige rutas de archivo, no identificadores numéricos.
discoverTests('tests', [1]);
// @ts-expect-error El entorno del proceso solo acepta cadenas o valores ausentes.
runTests({ env: { ...process.env, AFP_RUNNER_PROBE: 42 } });
// @ts-expect-error La salida del ejecutor es un código, no un resultado financiero.
const invalid: string = runTests();
void invalid;
