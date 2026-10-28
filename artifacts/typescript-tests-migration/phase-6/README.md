# Fase 6 — Cierre de la migración de pruebas

Fase completada localmente el **28 de octubre de 2026**, sobre `05c553a37d074cc55b3f0bc6355fc44378a81d37`. La [ejecución final](reference/execution.json) registra instalación limpia, controles, PostgreSQL, navegador, seeds y limpieza. La migración independiente de pruebas queda cerrada en sus fases 0–6; el plan de la web conserva su cierre anterior.

## Configuración y ejecución finales

[tsconfig.tests.json](../../../tsconfig.tests.json) usa `allowJs: false`, sin `checkJs` temporal ni inclusiones CJS, y hereda `strict`, `noUncheckedIndexedAccess` y `noEmit`. [run-tests.ts](../../../tests/run-tests.ts) descubre exclusivamente `.test.ts` del primer nivel, en orden. Rechaza entradas `.test.cjs`, `.test.js`, `.test.mjs` y `.test.jsx`, incluso al seleccionar otra prueba, y conserva el rechazo de nombres base duplicados. No cambia `node:test`, tsx 4.23.15, el aislamiento compartido, el entorno ni la propagación de fallos/señales.

[discovery.json](reference/discovery.json) confirma **109 pruebas TS y cero CJS**. Los helpers, seeds y contratos negativos no se descubren como pruebas. Los comandos finales son:

```bash
pnpm test
pnpm test latest-request.test.ts source-loader.test.ts
node --import tsx tests/run-tests.ts --list
```

`db:verify` importa el mismo ejecutor TS y utiliza exactamente la misma suite. Los archivos CJS generados en directorios temporales por las pruebas del ejecutor/cargador son fixtures de compatibilidad: no son módulos activos pendientes.

## Inventario y auditoría

[migration-audit.json](reference/migration-audit.json) relaciona **los 117 archivos CJS originales con sus 117 destinos TS**, todos presentes en el programa estricto. También comprueba inclusión y reglas ESLint de **131 módulos activos** —109 pruebas, 21 helpers y el ejecutor—, **trece archivos de contratos negativos** y **tres declaraciones específicas de scripts CJS**. No queda ninguna prueba/helper activo en JS/CJS ni módulo de pruebas fuera de su programa. El nuevo [auditor](../../../tests/helpers/migration-audit.ts) también está tipado y lintado; no añade escenarios de comportamiento ni se descubre automáticamente.

El auditor recorre el AST y los comentarios reales para identificar `any`, conversiones dobles, supresiones y declaraciones comodín. **Cero infracciones**. Los **125 casos con `@ts-expect-error` explicado** permanecen exclusivamente en `tests/types/` y pasan `test:types`; no se ejecutan con Node.

[assertion-review.json](assertion-review.json) justifica cada una de las **catorce conversiones locales**; las otras **462 son `as const`**. Se revisaron las claves de mapas locales, transformación JSON, proyecciones parciales, discriminación de uniones, llamadas mediante `Reflect.apply`, helpers privados de `vm`, delegates de avisos, inicializador React y el cliente Prisma extendido real del piloto. La referencia de elemento incompatible pertenece únicamente a un caso negativo estático. Estas conversiones no completan datos omitidos ni presentan persistencia parcial como un cliente Prisma íntegro.

Las fronteras conservadas tienen una finalidad de prueba concreta:

| Frontera | Contrato y comprobación |
| --- | --- |
| Cargador `vm` | **97 rutas públicas**, cada una derivada de `typeof import` real; `source-exports` comprueba presencia/clase de exports. La sobrecarga acepta claves del mapa; rutas dinámicas y exports privados no registrados devuelven `unknown`, sin un `load<T>` arbitrario. Contratos negativos y escenarios del cargador verifican esos límites. |
| Proyecciones parciales y datos inválidos | Adaptadores centrales conservan campos ausentes y rechazos, derivando escalares, callbacks y resultados de funciones reales. Las respuestas ficticias tienen contratos propios; PostgreSQL, locks y rollback siguen siendo reales en integraciones. |
| Helpers privados | Lista cerrada por ruta en `legacy-route-context`; comprueba las funciones expuestas y mantiene firmas locales mínimas y escenarios financieros, sin exportarlas desde producción. |
| Scripts CJS externos | `android-assetlinks`, `audit-migration-history` y `configure-capture-bank-fallback-cron` conservan declaraciones adyacentes `.d.cts`, revisadas contra sus exports y ejercitadas por sus pruebas y contratos negativos. `verify-database-reproduction.cjs` sigue siendo una herramienta operativa y registra TS explícitamente. |

La comprobación de exports en `vm` acredita su forma, no demuestra toda su semántica. Las declaraciones CJS tampoco convierten su implementación a TypeScript; sus pruebas de ejecución complementan esos contratos. El service worker, configuraciones `.mjs`, scripts operativos y Android permanecen fuera del alcance original.

## Validación limpia

[collect.py](collect.py) crea una copia sin `.env`, `.next`, caché TypeScript ni `node_modules`; instala con el lockfile y crea su propio PostgreSQL **16.15**, ligado a `127.0.0.1` y fijado por digest. Node **22.23.2**, pnpm **10.33.0**, TypeScript **6.0.3**, tsx **4.23.15** y Prisma **7.10.1**. No hereda conexiones ni credenciales del shell.

| Control | Resultado | Duración |
| --- | --- | --- |
| Instalación con lockfile | Correcta | 3.0 s |
| Auditoría de tipos, inclusión y ESLint | 117 originales resueltos; 0 infracciones | 3.359 s |
| Migraciones | 42 aplicadas | 2.719 s |
| `pnpm typecheck` | Correcto | 11.946 s |
| `pnpm typecheck:tests` | Correcto | 14.212 s |
| `pnpm test:types` | 125 casos negativos explicados | 8.165 s |
| `pnpm lint` | 0 errores; 3 advertencias previas | 43.894 s |
| `pnpm test` | 871 correctas; 0 omisiones | 51.555 s |
| `pnpm build` | Correcto | 19.053 s |
| `pnpm db:verify` | Reconstrucción, actualización y 871 regresiones | 68.232 s |
| Observación de escenarios | Mismos 871 escenarios en orden | 53.634 s |
| Migración de BD de receptores | 42 aplicadas | 2.463 s |
| Seed de receptores | Datos y credencial temporal verificados | 0.451 s |
| Tres recorridos de navegador | Transferencia, Captura y offline correctos | 259.348 s |
| Cierre de fixtures dev | SIGINT, SIGTERM y fallo TLS correctos | 11.948 s |

La suite, la observación con reporteros y las regresiones de `db:verify` coinciden en sus **871 escenarios**, **572 de primer nivel y 299 subtests**, sin fallos, omisiones, cancelaciones ni TODO. [scenarios.json](reference/scenarios.json) conserva archivo, nombre, repetición, orden y jerarquía, y compara todas las fases previas: **854 / 862 / 863 / 866 / 867 / 870 escenarios preservados** de fases 0–5. [scenario-renames.json](scenario-renames.json) documenta los dos títulos de infraestructura actualizados al retirar la convivencia CJS; ambos conservan sus comprobaciones pertinentes. Se añade una regresión para impedir que entradas JS se oculten tras una selección TS. Ningún escenario financiero original se renombra, elimina o sustituye por inspección de fuentes.

La reconstrucción y actualización verifican **42 migraciones y 45 tablas con RLS**, checksums, catálogo equivalente, deploy repetible y conservación de registros. [hash-comparison.json](reference/hash-comparison.json) conserva **394 archivos protegidos**, **672 artefactos históricos** y **318 archivos de evidencias anteriores de pruebas**. No cambian producto, esquema, SQL, fixtures JSON, service worker, Android, dependencias ni servicios remotos.

## Navegador, seeds y cierre de recursos

Se reutilizan sin cambios los recorridos TS de [browser.py](../phase-5/browser.py) y [dev-shutdown.py](../phase-5/dev-shutdown.py). Los nuevos resultados están en [reference/browser/](reference/browser/) y [reference/dev-shutdown/results.json](reference/dev-shutdown/results.json):

- Transferencia desde formulario hasta PostgreSQL: **$125.50**, cuentas/concepto coincidentes, `POST 200`, UUID y un recibo persistidos.
- Revisión ficticia de Captura: `PATCH 200`, concepto corregido y ningún gasto creado; nueve tarjetas, 24 alias y tres eventos ficticios verificados.
- Offline en dos pestañas: IndexedDB y Web Locks reales, respuesta perdida y UUID conservado al recuperar, cambio de cuenta sin perder pendientes, **un envío y una confirmación** al sincronizar concurrentemente; sin pendientes resucitados.
- Los tres servidores y los tres seeds se ejecutan con `node --import tsx`. El seed de receptores usa otra BD recién migrada: dos tarjetas, dos cortes, dos políticas en observación, un alias y un dispositivo. Se comprueban forma/permisos `0600` de su credencial temporal y se elimina sin guardarla en evidencia.
- Fixtures Next sin `.env` ni configuración de pruebas, con tipos y build propios. Sin errores de página, diálogos de recuperación inesperados ni desbordamiento horizontal en los recorridos.
- `SIGINT`, `SIGTERM` y fallo de arranque TLS cierran Next/HTTP/Prisma, terminan sus procesos y eliminan los directorios temporales. El recolector cierra navegador, servidores y contenedor desechable.

Auth y Google siguen simulados; no se conectan bancos, proveedores reales ni teléfonos. No se requiere APK nueva ni publicación.

## Avisos e incidencias

Persisten las tres advertencias previas de lint (`loadSubscriptions`, `activeReceivables` y TanStack/React Compiler) y el aviso previo de concurrencia de `pg`; no se silencian ni se modifican dependencias. [development-checks.json](development-checks.json) registra las dos correcciones de preparación del auditor: delimitar los contratos negativos a `tests/types/` y recibir como `unknown` la configuración devuelta por ESLint. Ocurrieron antes del cierre limpio; no requirieron alterar escenarios ni expectativas de AFP.

## Reproducción

Con dependencias del lockfile instaladas, Podman, Chrome y acceso a `npx agent-browser@0.27.0`, elegir un destino que no exista:

```bash
python3 artifacts/typescript-tests-migration/phase-6/collect.py /tmp/afp-tests-ts6-evidence-new
```

Los puertos 4192, 4208–4209 y 4216–4217 deben estar libres. El recolector conserva los logs al fallar y elimina sus recursos en `finally`. Para repetir solo la auditoría estática en una instalación preparada:

```bash
node --import tsx tests/helpers/migration-audit.ts /tmp/afp-tests-ts6-audit-new.json
```

[implementation-hashes.json](implementation-hashes.json) identifica los archivos de implementación y documentación entregados. Las herramientas históricas y sus logs/snapshots no se modifican; repetir sus cierres en estos commits:

| Evidencia anterior | Commit de reproducción |
| --- | --- |
| Fase 0 de pruebas | `700afcc842a0d7694972eb28dde04acf8779c8d5` |
| Fase 1 de pruebas | `c0a0a3798a92fc2c0b23281bb95b1a77e32c994f` |
| Fase 2 de pruebas | `dd81d4f80d6f52a32f5189f4412dfe2fdd9abcd1` |
| Fase 3 de pruebas | `429d747d75bd1a7fa7c99bbda5b096800f8f6c93` |
| Fase 4 de pruebas | `f7c76b956bcdafdf6daf8733a3e5da3ad0c5ef45` |
| Fase 5 de pruebas | `05c553a37d074cc55b3f0bc6355fc44378a81d37` |
| Ejecutores web dependientes de helpers CJS retirados | `6aad1ab` |
