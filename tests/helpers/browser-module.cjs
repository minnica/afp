const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { resolveSource } = require('./load-source.cjs');
async function buildBrowserModule(entry, mocks = {}) {
  const result = await build({
    entryPoints: [resolveSource(entry)], bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2022',
    plugins: [{ name: 'isolated-browser-source', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'mock' };
        if (args.kind === 'entry-point') return { path: args.path };
        if (args.path.startsWith('@/')) return { path: resolveSource(`src/${args.path.slice(2)}`) };
        if (args.path.startsWith('.')) return { path: resolveSource(path.resolve(args.resolveDir, args.path)) };
        throw new Error(`Dependencia de navegador sin mock: ${args.path}`);
      });
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
      builder.onLoad({ filter: /\.[jt]sx?$/, namespace: 'file' }, args => ({
        contents: fs.readFileSync(args.path, 'utf8'), loader: path.extname(args.path).slice(1), resolveDir: path.dirname(args.path),
      }));
    } }],
  });
  return result.outputFiles[0].text;
}
module.exports = { buildBrowserModule };
