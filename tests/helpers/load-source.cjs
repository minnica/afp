const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");

// Ejecuta módulos reales con adaptadores de red/BD explícitos, sin credenciales.
function sourceLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  return function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full);
    let source = fs.readFileSync(full, "utf8");
    const bindings = {};
    source = source.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];\r?\n/gm, (_, names, specifier) => {
      const dependency = mocks[specifier] || (!specifier.startsWith("@/") && !specifier.startsWith(".") ? require(specifier) : load(specifier.startsWith("@/")
        ? `src/${specifier.slice(2)}.js` : path.resolve(path.dirname(full), `${specifier}.js`)));
      for (const name of names.split(",").map(name => name.trim()).filter(Boolean)) {
        const [original, alias = original] = name.split(/\s+as\s+/);
        bindings[alias] = dependency[original];
      }
      return "";
    });
    const exported = [...source.matchAll(/^export (?:async )?(?:function|class|const) (\w+)/gm)].map(match => match[1]);
    source = source.replace(/^export /gm, "");
    const context = vm.createContext({
      URL, Headers, Date, AbortController, DOMException, setTimeout, clearTimeout,
      console, process: { env: {} }, ...globals, ...bindings,
    });
    const result = vm.runInContext(`${source}\n;({${exported.join(",")}})`, context, { filename: full });
    cache.set(full, result);
    return result;
  };
}
module.exports = { sourceLoader };
