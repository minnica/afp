// Observa node:test sin envolver tests, cambiar su aislamiento ni cargar la app.
const path = require('node:path');

module.exports = async function* report(source) {
  for await (const { type, data } of source) {
    if (!['test:start', 'test:pass', 'test:fail'].includes(type)) continue;
    yield JSON.stringify({
      event: type,
      file: data.file ? path.relative(process.cwd(), data.file).split(path.sep).join('/') : null,
      line: data.line ?? null,
      column: data.column ?? null,
      name: data.name,
      nesting: data.nesting,
      testNumber: data.testNumber ?? null,
      durationMs: data.details?.duration_ms ?? null,
      kind: data.details?.type ?? null,
      skip: data.skip ?? false,
      todo: data.todo ?? false,
    }) + '\n';
  }
};
