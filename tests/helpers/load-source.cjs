const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformSync } = require("esbuild");
const root = path.resolve(__dirname, "../..");
const extensions = [".js", ".ts", ".jsx", ".tsx"];
// Solo bibliotecas sin acceso a credenciales/red/BD. Los adaptadores se inyectan.
const allowedPackages = new Set(["zod", "date-fns", "date-fns/locale", "clsx", "tailwind-merge", "react", "react/jsx-runtime", "lucide-react", "next/server", "node:crypto", "node:buffer", "node:timers/promises"]);

function resolveSource(file) {
  const full = path.resolve(root, file);
  const extension = path.extname(full);
  // Una extensión explícita identifica ese archivo; nunca sustituir JS por TS.
  if (extension) {
    if (extensions.includes(extension) && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    throw new Error(`Módulo no encontrado: ${file}`);
  }
  const candidates = [...extensions.map(ext => full + ext), ...extensions.map(ext => path.join(full, `index${ext}`))]
    .filter(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (candidates.length !== 1) throw new Error(`${candidates.length ? "Módulo ambiguo" : "Módulo no encontrado"}: ${file}${candidates.length ? ` (${candidates.join(", ")})` : ""}`);
  return candidates[0];
}

function transformSource(source, filename, format = "cjs") {
  return transformSync(source, {
    sourcefile: filename, loader: path.extname(filename).slice(1), format,
    target: "es2022", jsx: "automatic", sourcemap: "inline",
  }).code;
}

// Ejecuta fuentes de confianza del repositorio; vm no es un sandbox de seguridad.
// Conserva mocks prioritarios, caché por cargador y process.env ficticio.
function sourceLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  return function load(file, exposed = []) {
    const full = resolveSource(file);
    const key = `${full}:${exposed.join(",")}`;
    if (cache.has(key)) return cache.get(key).exports;
    const loadedModule = { exports: {} };
    cache.set(key, loadedModule);
    const requireSource = specifier => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        return load(specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : path.resolve(path.dirname(full), specifier));
      }
      // Tipos/Decimal/SQL reales; conexiones deshabilitadas salvo mock del test.
      if (specifier === "@prisma/client") return { ...require(specifier), PrismaClient: class {
        constructor() { throw new Error("PrismaClient requiere un mock explícito"); }
      } };
      if (specifier === "@supabase/supabase-js") return {
        createClient() { throw new Error("Supabase requiere un mock explícito"); },
      };
      if (!allowedPackages.has(specifier)) throw new Error(`Dependencia sin mock explícito: ${specifier} (${full})`);
      return require(specifier);
    };
    try {
      const source = fs.readFileSync(full, "utf8");
      // Acceso explícito para pruebas históricas de funciones privadas, sin quitar imports.
      if (exposed.some(name => !/^[A-Za-z_$][\w$]*$/.test(name))) throw new Error("Nombre de export de prueba inválido");
      const code = transformSource(source + (exposed.length ? `\nexport { ${exposed.join(", ")} };` : ""), full);
      const context = vm.createContext({
        URL, Headers, Date, AbortController, DOMException, setTimeout, clearTimeout,
        console, process: { env: {} }, ...globals,
        module: loadedModule, exports: loadedModule.exports, require: requireSource,
      });
      vm.runInContext(code, context, { filename: full });
      return loadedModule.exports;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  };
}
module.exports = { sourceLoader, resolveSource, transformSource };
