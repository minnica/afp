import assert from 'node:assert/strict';

// Comprobaciones para los módulos temporales y el árbol JSX de vm. No asignan
// contratos de producción a una ruta desconocida ni ejecutan validación previa
// sobre los datos inválidos que recibe la aplicación.
export function record(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

export function call(value: unknown, ...args: unknown[]): unknown {
  assert.equal(typeof value, 'function');
  if (typeof value !== 'function') throw new Error('Se esperaba una función');
  const result: unknown = Reflect.apply(value, undefined, args);
  return result;
}
