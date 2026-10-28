import { transformSync,type Format,type Loader } from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import type { SourceGlobals,SourceMocks,SourceModules } from './source-contracts';
const nativeRequire: (specifier: string) => unknown = createRequire(__filename);
const root = path.resolve(__dirname, "../..");
const extensions = [".js", ".ts", ".jsx", ".tsx"];
// Solo bibliotecas sin acceso a credenciales/red/BD. Los adaptadores se inyectan.
const allowedPackages = new Set(["zod", "date-fns", "date-fns/locale", "clsx", "tailwind-merge", "react", "react/jsx-runtime", "lucide-react", "next/server", "node:crypto", "node:buffer", "node:timers/promises"]);

export function resolveSource(file: string): string {
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
  const candidate = candidates[0];
  if (!candidate) throw new Error(`Módulo no encontrado: ${file}`);
  return candidate;
}

export function sourceLanguage(filename: string): Loader {
  const extension = path.extname(filename).slice(1);
  switch (extension) {
    case 'js': case 'ts': case 'jsx': case 'tsx': return extension;
    default: throw new Error(`Lenguaje de fuente no admitido: ${filename}`);
  }
}

export function transformSource(source: string, filename: string, format: Format = "cjs"): string {
  return transformSync(source, {
    sourcefile: filename, loader: sourceLanguage(filename), format,
    target: "es2022", jsx: "automatic", sourcemap: "inline",
  }).code;
}

// Ejecuta fuentes de confianza del repositorio; vm no es un sandbox de seguridad.
// Conserva mocks prioritarios, caché por cargador y process.env ficticio.
import { sourceExports } from './source-exports';

export function checkSourceExports(file: keyof SourceModules, value: unknown): void {
  checkPublicExports(path.resolve(root, file), value);
}

function checkPublicExports(full: string, value: unknown) {
  for (const [file, names] of Object.entries(sourceExports)) {
    if (full !== path.resolve(root, file)) continue;
    for (const [name, kind] of Object.entries(names)) {
      const exported: unknown = value && typeof value === 'object' && name in value ? Reflect.get(value, name) : undefined;
      if (typeof exported !== kind || exported === null) {
        throw new Error(`Export público inválido: ${file}#${name}`);
      }
    }
  }
}

export function sourceLoader(mocks: SourceMocks = {}, globals: SourceGlobals = {}) {
  const cache = new Map<string, { exports: unknown }>();
  // Única frontera estática de vm: la sobrecarga promete los exports de la ruta
  // real, cuya presencia se comprueba abajo. No demuestra su semántica. Las rutas
  // dinámicas y exports privados CJS conservan unknown, sin load<T> arbitrario.
  function load<P extends keyof SourceModules>(file: P, exposed?: readonly []): SourceModules[P];
  function load(file: string, exposed?: readonly string[]): unknown;
  function load(file: string, exposed: readonly string[] = []): unknown {
    const full = resolveSource(file);
    const key = `${full}:${exposed.join(",")}`;
    const cached = cache.get(key);
    if (cached) return cached.exports;
    const loadedModule: { exports: unknown } = { exports: {} };
    cache.set(key, loadedModule);
    const requireSource = (specifier: string): unknown => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        return load(specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : path.resolve(path.dirname(full), specifier));
      }
      // Tipos/Decimal/SQL reales; conexiones deshabilitadas salvo mock del test.
      if (specifier === "@prisma/client") {
        const prisma = nativeRequire(specifier);
        if (!prisma || typeof prisma !== 'object') throw new Error('Exports Prisma inválidos');
        return { ...prisma, PrismaClient: class {
        constructor() { throw new Error("PrismaClient requiere un mock explícito"); }
        } };
      }
      if (specifier === "@supabase/supabase-js") return {
        createClient() { throw new Error("Supabase requiere un mock explícito"); },
      };
      if (!allowedPackages.has(specifier)) throw new Error(`Dependencia sin mock explícito: ${specifier} (${full})`);
      return nativeRequire(specifier);
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
      checkPublicExports(full, loadedModule.exports);
      return loadedModule.exports;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  }
  return load;
}
