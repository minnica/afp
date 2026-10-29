# A10 · Dependencias de seguridad · 29 de octubre de 2026

Actualización local sobre `ca53e80979df18e94bd989904134347ad0c34cfa`. [Hallazgo actualizado](../informe.md#A10). Node.js 22.23.2, pnpm 10.33.0 y PostgreSQL 16 desechable, inicializado con las 42 migraciones existentes. Datos ficticios y Auth simulada; sin publicación ni cambios de servicios remotos.

## Resultado y alcance

El registro volvió a responder. Antes de actualizar confirmó **7 avisos de producción y 10 en el árbol completo**: además de los ocho del 27/10, aparecen deepmerge y systeminformation. Después quedan **0 de producción y 1 bajo de desarrollo**, sin críticos, altos ni moderados. A10 conserva el seguimiento de ese aviso sin parche; no se declara un árbol completo libre de avisos.

| Dependencia | Antes | Después | Alcance |
| --- | --- | --- | --- |
| next / eslint-config-next | 16.3.8 | **16.4.3**, versiones exactas alineadas | Tres avisos de Next; versión estable de la misma versión mayor. |
| fast-uri | 3.1.8 | **3.1.9** | Cuatro avisos; actualización transitiva dentro del rango compatible, incluidas las cadenas de producción. |
| body-parser | 2.3.0 | **2.4.0** | Aviso de denegación de servicio en herramientas de desarrollo. |
| systeminformation | 5.33.15 | **5.33.18** | Aviso de inyección de comandos Windows en herramientas de desarrollo. |

Se conservan React/React DOM 19.2.4, Prisma/Client/adapter-pg 7.10.1, Sharp 0.35.5 y shadcn 4.22.0 en desarrollo. El cambio se limita a dos versiones directas y sus dependencias de Next, más tres transitivas. Se retira una supresión `react-hooks/exhaustive-deps` de Gastos que la versión nueva considera innecesaria; no se cambia el efecto. Sin overrides, exclusiones de avisos, `audit --fix`, saltos mayores ni cambios de `allowBuilds`.

| Auditoría nueva | Antes | Después | Evidencia |
| --- | --- | --- | --- |
| Producción | 2 críticos, 1 alto, 2 moderados, 2 bajos; salida 1 | **0 avisos; salida 0** | [Antes](audit-prod-before.json) · [Después](audit-prod-after.json) |
| Árbol completo | 2 críticos, 3 altos, 2 moderados, 3 bajos; salida 1 | **1 bajo; salida 1** | [Antes](audit-all-before.json) · [Después](audit-all-after.json) |

[Cadenas anteriores](dependency-paths-before.json) · [Cadenas finales](dependency-paths-after.json) · [Actualización Next](update-next.log) · [ESLint](update-eslint.log) · [Transitivas](update-transitives.log).

## Aviso que permanece abierto

`GHSA-gcqx-w48m-w2h4`, alteración del prototipo del objeto devuelto por `deepmerge@4.3.1`, aparece con severidad **baja en el registro auditado**. Llega por `shadcn → deepmerge` y `shadcn → @shadcn/registry → deepmerge`. No tiene dependientes de producción: [`pnpm why deepmerge --prod --json`](deepmerge-prod.json) devuelve `[]` y la auditoría de producción no lo incluye. No se ha demostrado una ruta explotable en AFP; esa ausencia de evidencia tampoco corrige la biblioteca.

El registro devuelve **4.3.1 como última versión** y ningún parche en el aviso. Shadcn 4.23.0 también declara `deepmerge: ^4.3.1`; actualizar la CLI por sí sola no lo elimina. [Versión publicada de deepmerge](deepmerge-latest.json) · [Dependencia de shadcn 4.23.0](shadcn-latest-deepmerge.json). El [hilo del proveedor](https://github.com/TehShrike/deepmerge/issues/273) contiene discusión y propuestas, pero no acredita una versión publicada corregida.

Hasta disponer de una corrección compatible, usar la CLI con configuraciones y registros revisados. Antes de actualizar componentes o publicar, volver a consultar ambas auditorías y comprobar si shadcn elimina la dependencia o existe un parche. El aviso sigue visible, sin downgrade a una versión no acreditada como segura, reemplazo incompatible ni supresión. Este es el pendiente de dependencias de A10; su publicación también queda pendiente.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Instalación limpia | **Correcta** en directorio temporal sin `node_modules` ni `.env`, con `pnpm install --frozen-lockfile` y generación Prisma. [Log](install-clean.log). La instalación fija en el checkout también pasa [offline](install-frozen.log). El primer intento limpio offline falló por tarballs anteriores ausentes del store; [intento conservado](install-clean-offline.log). Se resolvió descargando con el lockfile congelado, sin modificarlo. |
| Tipos | Web, pruebas/helpers y contratos negativos correctos. [Web](typecheck.log) · [Pruebas](typecheck-tests.log) · [Contratos](test-types.log). |
| ESLint | Cero errores y **dos advertencias previas**: función `loadSubscriptions` sin uso y compatibilidad TanStack/React Compiler. [Final](lint.log). Se conserva el [primer resultado](lint-before-cleanup.log), que además detectó la directiva ahora retirada. |
| Regresiones | **934 correctas, cero fallos y cero omisiones**. PostgreSQL local real; Auth y Google simulados. No se añaden pruebas que solo reflejen números de versión. [Log](tests-local.log). |
| Build predeterminado | **`pnpm build` correcto con Turbopack**, Next.js 16.4.3 y comprobación TypeScript, sobre las correcciones posteriores a A09. Conexiones locales y Auth ficticia explícitas. [Log](build.log). Se conserva el bundler predeterminado. |
| HTTP del build | **49 métodos de 19 rutas** rechazan ausencia de credencial con 401, `private, no-store` y `Vary: Authorization`. `/` devuelve 307 a `/dashboard`; manifest 200. [Resultados](http-production.json) · [Diagnóstico reproducible](check-http.mjs) · [Servidor](start-production.log). |
| Navegador del build | Chromium: login a **390×844** y **1440×900**, alternancia Entrar/Crear cuenta; `/dashboard` vuelve a `/login` sin sesión. Sin errores de página ni mensajes de consola observados. [Móvil](login-mobile.png) · [Escritorio](login-desktop.png) · [Snapshot](login-mobile.json) · [Errores](browser-production-errors.json) · [Consola](browser-production-console.json). |
| Flujo privado | Fixture compilado con Webpack, API/BD reales y sesión ficticia: crear **Regresión A10, efectivo, $21.50** deja una fila y un recibo idempotente; API GET devuelve 200 y total **$171.50**, conservado en pantalla. [Captura](expense-desktop.png) · [Snapshot](expense-desktop.json) · [PostgreSQL](expense-database.json) · [Resumen](verification.json). [Sin errores de página](browser-fixture-errors.json). |
| Herramientas | CLI shadcn 4.22.0 ejecutable; Sharp 0.35.5 convierte el SVG existente a PNG 192×192 en memoria. [CLI](shadcn-version.log) · [Sharp](sharp.json). |
| BD y revisión | 42 migraciones existentes aplicadas; no cambia el esquema ni Prisma, por lo que no se repite `db:verify`. [Deploy local](migrations-local.log). `git diff --check` correcto. README, bitácora e informe actualizados; se conservan las evidencias anteriores. |

El primer fixture en modo desarrollo entró en recargas Fast Refresh repetidas y no completó la navegación tras el login. No se cuenta como aceptación: se cerró y se usó el modo de producción del fixture, que permitió completar el flujo privado. [Log del intento](browser-fixture.log) · [Fixture de producción](browser-fixture-production.log). Este último conserva el aviso previo de `pg` sobre consultas concurrentes; no hubo fallo del registro. No se atribuye la causa del Fast Refresh a un defecto de la aplicación sin una reproducción independiente.

## Reproducción

Instalar desde este lockfile y consultar el registro:

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --json
pnpm audit --json
```

La auditoría completa termina con código 1 mientras conserve el aviso descrito. Un fallo de red no constituye resultado de auditoría. Las versiones y avisos del registro pueden cambiar después de esta fecha.

Preparar PostgreSQL local desechable según el README, con base `afp_test_a10` en el puerto 55441. Fijar las conexiones en cada sesión de verificación; los valores siguientes son exclusivamente ficticios:

```bash
export DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a10
export DIRECT_URL="$DATABASE_URL"
export AFP_TEST_DATABASE_URL="$DATABASE_URL"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=afp-a10-fictitious-anon-key
pnpm exec prisma migrate deploy
pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
pnpm test
pnpm build
pnpm start --hostname 127.0.0.1 --port 4209
```

Con ese build en ejecución, desde otra terminal en la raíz:

```bash
node artifacts/auditoria-2026-10-15/a10-2026-10-29/check-http.mjs
```

Para el flujo privado, ejecutar `tests/helpers/seed-ui.ts` con `node --import tsx` y `AFP_TEST_DATABASE_URL` local; después iniciar `tests/helpers/money-browser-server.ts` con `AFP_CAPTURE_TEST_PRODUCTION=1`, `AFP_UI_TEST_REAL_SETTINGS=1` y `AFP_CAPTURE_TEST_REAL_DASHBOARD=1`. Abrir `http://127.0.0.1:4216/login`, entrar con `money-qa@example.test` y contraseña ficticia de al menos seis caracteres; crear en Gastos el registro de efectivo y categoría ficticia indicado. La interfaz pasa de tres gastos y $150.00 a cuatro y $171.50. Verificar una fila y un recibo del propietario ficticio en PostgreSQL. Cerrar los servidores y eliminar el contenedor desechable al terminar.

## Fuentes de parches y límites

Se contrastaron los rangos del registro con los avisos de los proveedores: [Next, imágenes](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [Next, Server Actions](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [Next, caché](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), [fast-uri](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg), [body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) y [systeminformation](https://github.com/sebhildebrandt/systeminformation/security/advisories/GHSA-3f7j-7jwc-fxfj). Next 16.4.3 es una [versión estable con correcciones adicionales](https://github.com/vercel/next.js/releases/tag/v16.4.3), posterior al mínimo 16.4.1 de los tres avisos.

Las auditorías describen el lockfile local y el registro consultado, no prueban explotabilidad ni ausencia de vulnerabilidades desconocidas. Las integraciones y el navegador privado usan Auth ficticia y PostgreSQL real desechable; no certifican Supabase Auth, Google, Android ni el despliegue remoto actuales. No se publican cambios ni se aplican migraciones en servicios compartidos. El seguimiento de deepmerge, la publicación y la aceptación con servicios reales siguen abiertos.
