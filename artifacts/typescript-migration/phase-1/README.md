# Fase 1: herramientas y pruebas compatibles con TypeScript

Implementación local del [plan](../../../docs/plan-migracion-typescript.md), sobre el commit registrado en [execution.json](execution.json), el **27 de octubre de 2026, America/Mexico_City** (28 de octubre UTC). La aplicación sigue en JS/JSX; esta fase prepara las herramientas para tipar transferencias en la fase 2. No cambia fuentes de `src/`, esquema, SQL, contratos HTTP, reglas financieras ni formatos persistidos. No hubo despliegue.

## Implementación

- `tsconfig.json` sustituye a `jsconfig.json`, conserva `@/*` y añade `strict`, `noUncheckedIndexedAccess`, `isolatedModules`, resolución `bundler` y los tipos generados de Next. `allowJs: true` / `checkJs: false` mantienen el legado; sus interiores no están comprobados estáticamente. `skipLibCheck` omite la comprobación interna de declaraciones de dependencias, conforme a la configuración habitual de Next; no omite errores de la aplicación.
- Dependencias directas: TypeScript 6.0.3, tipos de Node 22.20.5 y React/React DOM 19.3.0, esbuild 0.28.2 y dotenv 18.0.9. `dotenv` era un import directo de `prisma.config.ts` sin dependencia declarada; fue necesario declararlo para la instalación limpia. Las versiones de Next, React y Prisma no cambiaron. `allowBuilds` autoriza únicamente esbuild además de los paquetes antes permitidos.
- `pnpm typecheck` genera Prisma y tipos de Next antes de `tsc --noEmit`. `pnpm test:types` hace lo mismo para `tsconfig.type-tests.json`. Los siete casos negativos de `tests/types/toolchain.tsx` comprueban entrada/salida Zod, selecciones Prisma, props React, índices y nulabilidad. Son contratos de infraestructura, no una declaración de que el piloto financiero ya esté tipado.
- ESLint aplica la configuración TS de Next y rechaza `any` explícito, usos inseguros y comentarios que ocultan errores sin explicación. Mantiene las reglas JS. Excluye `estados_cuenta/`, que contiene archivos privados y copias ajenas al código activo.
- `sourceLoader(mocks, globals)(file)` conserva su interfaz, caché por instancia y contexto ficticio. esbuild transforma módulos JS/TS/JSX/TSX a CommonJS en memoria; no comprueba tipos. Resuelve imports relativos, `@/`, índices, default, reexports e imports solo de tipos; los mocks tienen prioridad. Hay ocho nuevas pruebas de infraestructura, incluida la transformación ESM del fixture offline.
- Los paquetes externos admitidos están acotados. Prisma conserva enums/Decimal/SQL reales pero bloquea construir un cliente; el adaptador Supabase predeterminado también falla al invocarlo. Los tests deben proporcionar mocks para conexiones. El contexto no ofrece `fetch`, no hereda `process.env` ni carga `.env`. `vm` ejecuta fuentes confiables del repositorio; no constituye una barrera de seguridad para código hostil.
- Las 14 pruebas con eliminación de imports/exports ahora cargan módulos transformados. El caso de `public/sw.js` mantiene `vm` directo porque ese recurso seguirá siendo JS. `legacy-route-context.cjs` reúne exports y expone explícitamente los helpers privados que ya comprobaban los escenarios históricos. La prueba de headers de suscripciones consulta `Headers.get`, porque ahora ejecuta la envoltura real de `apiAuth` que antes se eliminaba al quitar imports.
- Los fixtures de Mi dinero/captura copian configuraciones TS, declaraciones propias y `types/` cuando exista; generan tipos nuevos con `next typegen`. No copian `.env` ni `next-env.d.ts` de otra compilación y conservan las restricciones de BD local. El fixture offline entrega un bundle ESM transformado con API ficticia e imports resueltos, también compatible con TS.
- `scripts/verify-database-reproduction.cjs` conserva su interfaz y ejecutor; su carga de `cardBalanceTracking.js` funciona con el cargador nuevo. No necesitó cambios.

## Validación

Los comandos, códigos de salida y tiempos están en [execution.json](execution.json). [collect.py](collect.py) utiliza una copia de los archivos versionados y nuevos no ignorados, sin `node_modules` ni `.env`, y ejecuta una instalación real con lockfile congelado. Solo recibe conexiones locales ficticias. Los logs contienen datos de pruebas, no credenciales ni registros personales.

| Comprobación | Resultado | Tiempo |
| --- | --- | --- |
| [Instalación limpia con lockfile](install.log) | Correcto | 18.989 s |
| [Tipos de aplicación](typecheck.log) | Correcto | 4.487 s |
| [Contratos de tipos](type-contracts.log) | Correcto | 3.097 s |
| [Lint (0 errores, 1 advertencia)](lint.log) | Correcto | 16.239 s |
| [Migraciones locales](migrate.log) | Correcto | 4.952 s |
| [Suite completa y reconstrucción de BD](database-verification.log) | Correcto | 60.558 s |
| [Comparación de 12 respuestas](transfer-reference.log) | Correcto | 0.613 s |
| [Build Turbopack](build.log) | Correcto | 11.135 s |
| [Fixture Mi dinero (Webpack/HTTP)](money-fixture.log) | Correcto | 35.629 s |
| [Fixture captura (Webpack/HTTP)](capture-fixture.log) | Correcto | 35.529 s |
| [Fixture offline (ESM/HTTP)](offline-fixture.log) | Correcto | 0.505 s |
| [Error TS deliberado: typecheck](typecheck-negative.log) | Rechazado como se esperaba | 4.219 s |
| [Error TS deliberado: build](build-negative.log) | Rechazado como se esperaba | 5.131 s |

Las 820 pruebas de la referencia anterior conservan sus escenarios; la suite alcanza **828 correctas, cero fallos y cero omisiones**. `db:verify` reconstruye desde vacío y actualiza desde las 13 migraciones históricas, verificando **42 migraciones y 45 tablas con RLS**. Los hashes de esquema y SQL coinciden con la fase 0. Las **12 respuestas del piloto** se comparan contra el JSON anterior sin regenerarlo.

Los fixtures de Mi dinero y captura arrancan con build Webpack aislado, regeneran sus tipos y sirven HTML por HTTP. Su preparación comprueba los rechazos `401`; Mi dinero también responde a una lectura autenticada con Auth ficticia y PostgreSQL real local. Offline sirve el módulo ESM y su API ficticia; su compilación TS se ejecuta en la prueba de infraestructura. Esto verifica arranque, transporte y transformación, no interacciones visuales ni proveedores externos reales.

## Incidencias y límites

- La instalación inicial dejó de encontrar `dotenv/config`: se corrigió declarando la dependencia directa. Tras cambios en los peers de Prisma se regeneró el cliente antes de validar; no se cambió Prisma.
- Lint termina sin errores y muestra **una advertencia `react-hooks/incompatible-library`** en `src/components/ui/data-table.jsx` (`useReactTable`). La fase 0 no la había reportado; apareció con las herramientas instaladas en esta fase sobre código sin cambios. No se silencia ni se modifica la tabla como parte de la migración.
- Se conserva la advertencia de `pg` sobre consultas concurrentes en un cliente en las integraciones. Prisma anuncia una versión mayor disponible, sin actualizarla. No afectan los resultados registrados.
- El build y `typecheck` se probaron también con un error TS deliberado en la copia temporal: deben fallar. Los archivos con el error nunca se incorporan al repositorio.
- El fallback histórico `.js` → otra extensión solo se usa si el archivo exacto falta y hay un único candidato; las búsquedas sin extensión rechazan ambigüedades. Retirarlo en la fase 7. Los nuevos renombres deben actualizar sus referencias literales.
- El acceso explícito a funciones privadas de las pruebas históricas es un puente de pruebas. Al migrar esos módulos, conservar los escenarios y sustituirlo por contratos/exportaciones apropiados sin exponer helpers innecesarios en la API de producción.
- No se certifican Google, Supabase remoto, Android físico ni flujos de navegador autenticados completos. La fase 2 sigue pendiente. Las pruebas de tipos no cubren automáticamente el interior del JavaScript restante.

## Reproducción

Requisitos: Node 22.23.2, pnpm 10.33.0, Python 3 y Podman (o PostgreSQL local equivalente). Se necesita espacio para una instalación limpia y los puertos locales 4216, 4208 y 4192 libres. No ejecutar sobre una BD compartida.

```bash
podman run --rm -d --name afp-ts-phase1 \
  -e POSTGRES_PASSWORD=afp_test_only -e POSTGRES_DB=afp_test_ts1 \
  -p 127.0.0.1::5432 \
  docker.io/library/postgres@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571
podman exec afp-ts-phase1 pg_isready -U postgres -d afp_test_ts1
podman port afp-ts-phase1 5432
```

Esperar a que PostgreSQL esté listo y sustituir `PUERTO` por el publicado:

```bash
AFP_TEST_DATABASE_URL='postgresql://postgres:afp_test_only@127.0.0.1:PUERTO/afp_test_ts1' \
  python3 artifacts/typescript-migration/phase-1/collect.py
podman stop afp-ts-phase1
```

El recolector detiene cada servidor y elimina la instalación temporal al terminar, también ante un fallo. Detener el contenedor incluso si una comprobación falla. Los logs y metadatos de esta carpeta se sobrescriben al repetir; revisar sus diferencias antes de versionarlos. Los directorios temporales internos de los fixtures pueden conservarse para diagnóstico, como ocurría antes de esta fase.
