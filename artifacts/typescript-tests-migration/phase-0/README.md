# Fase 0 — Referencia de pruebas y helpers

Referencia del commit `6c1b62634682150c71e37c59ad15dad6aaaa4244`, tomada el **28 de octubre de 2026**, antes de convertir las pruebas a TypeScript. Implementa la fase 0 del [plan](../../../docs/plan-migracion-tests-typescript.md). El código web, pruebas, helpers, dependencias, configuración, esquema y datos de fixtures conservan su contenido.

La referencia final está en [reference/](reference/). [baseline/](baseline/) conserva íntegro el primer intento: todos los controles de AFP pasaron, pero el cotejo de posiciones del recolector falló. No reemplaza ni modifica las evidencias de la migración web.

## Resultados y procedencia

[execution.json](reference/execution.json) registra commit, versiones, entorno, comandos completos, timestamps, duración, códigos de salida, limpieza y hashes de los archivos copiados. La copia se creó sin `.env`, `.next` ni caché de TypeScript y con Supabase ficticio. Se copiaron físicamente las dependencias ya instaladas; **no se presenta como una instalación limpia con pnpm**.

| Control | Evidencia y resultado | Duración |
| --- | --- | --- |
| Migración de PostgreSQL local vacío | [migrate.log](reference/migrate.log): 42 migraciones | 2,623 s |
| `pnpm typecheck` | [typecheck.log](reference/typecheck.log): correcto, sin `.next` previa | 11,560 s |
| `pnpm test:types` | [test-types.log](reference/test-types.log): correcto | 6,927 s |
| `pnpm lint` | [lint.log](reference/lint.log): cero errores, tres advertencias preexistentes | 27,210 s |
| `pnpm test` | [test.log](reference/test.log): 854 correctas; cero fallos, omisiones, cancelaciones y TODO | 46,179 s |
| Observación de escenarios con `node:test` | [test-scenarios.log](reference/test-scenarios.log): mismos 854 escenarios, con archivo y posición de cada declaración | 45,562 s |
| `pnpm build` | [build.log](reference/build.log): correcto, incluida comprobación TypeScript | 18,887 s |
| `pnpm db:verify` | [db-verify.log](reference/db-verify.log): reconstrucción y actualización desde 13 migraciones históricas, 42 migraciones finales, 45 tablas con RLS y 854 regresiones correctas | 65,196 s |

Node **22.23.2**, pnpm **10.33.0**, TypeScript **6.0.3**, esbuild **0.28.2**, Next **16.3.8**, Prisma **7.10.1** y PostgreSQL **16.15**. La imagen de PostgreSQL está fijada por digest en el recolector. Cada intento crea su propio contenedor y puerto limitado a `127.0.0.1`, con una base `afp_test_tests_ts0`; `db:verify` crea y elimina además sus bases y roles aleatorios. Los recursos temporales se eliminan al terminar.

## Archivos y escenarios

| Inventario | Cantidad y clasificación |
| --- | --- |
| Pruebas ejecutables | 106 archivos `.test.cjs`; todos observados en ejecución |
| Helpers | 11 archivos `.cjs` |
| Pruebas y helpers CJS | 12 507 líneas |
| Contratos estáticos | 8 archivos TS/TSX en `tests/types/`, con 67 casos negativos explicados; solo compilación |
| Fixtures JSON | 21: 20 de captura y uno de persistencia offline |
| Declaraciones estáticas de pruebas | 775; 14 tienen título dinámico y sus bucles expanden escenarios |
| Resultados de `node:test` | 854: 555 de primer nivel y 299 subtests; el total incluye padres |
| Uso de `sourceLoader` / `routeContext` | 98 / 4 archivos de pruebas |
| Integraciones PostgreSQL | 38 archivos mencionan `AFP_TEST_DATABASE_URL`; no equivale a 38 escenarios |

[inventory.json](reference/inventory.json) contiene archivos, hashes, líneas, declaraciones, contratos negativos, fixtures y sus consumidores, imports resueltos, dependencias directas, versiones instaladas, allowlist del cargador y expresiones de rutas dinámicas. Se obtiene del AST con TypeScript, sin ejecutar módulos. Los campos `loads`, `pathReferences` y `sourceReads` conservan ubicación y expresión cuando no existe una ruta literal resoluble. La lista de dependencias no pretende ser un grafo transitivo de toda la aplicación; el manifiesto y lockfile quedan identificados por hash.

[scenarios.json](reference/scenarios.json) es el manifiesto de **escenarios efectivamente ejecutados**. Cada entrada conserva archivo, línea, columna, nombre, ancestros, repetición, resultado y duración. La identidad omite únicamente la extensión `.cjs`/`.ts` para permitir el renombre; no omite nombres ni jerarquía. Se cotejan las secuencias completas de `pnpm test`, la ejecución observada y las regresiones de `db:verify`; coinciden en orden y contenido. Los [eventos originales](reference/scenario-events.ndjson) permiten revisar el cotejo. Los 854 resultados se remontan a las 775 declaraciones, todas ejecutadas al menos una vez.

La observación adicional es necesaria porque el script actual coloca sus archivos antes de argumentos extra: Node 22 no aplica ahí los flags de reportero. El recolector ejecuta primero **`pnpm test` sin modificarlo**, y luego la misma lista ordenada, mismo aislamiento y mismo entorno, colocando los dos reporteros antes de los archivos. No usa `NODE_OPTIONS`, filtros, mocks adicionales ni otro descubrimiento como sustitución del comando obligatorio. El ejecutor común propuesto sigue pendiente de fase 1.

## Tipos de pruebas y exclusiones

- **Comportamiento:** 105 archivos ejecutan código, incluidos cálculos, handlers, persistencia, scripts y cargador. Sus categorías pueden solaparse.
- **Lectura de fuentes:** `android-sources.test.cjs` comprueba por texto la política Kotlin y el manifest Android. `api-authorization.test.cjs` descubre handlers leyendo el directorio y después los ejecuta. `api-fetch.test.cjs` y `offline-service-worker.test.cjs` leen y ejecutan el worker en `vm`; no son meras comprobaciones de texto.
- **Contratos de scripts:** `android-assetlinks`, `migration-history` y `capture-bank-fallback-cron` importan respectivamente `scripts/android-assetlinks.cjs`, `scripts/audit-migration-history.cjs` y `scripts/configure-capture-bank-fallback-cron.cjs`. Las pruebas sí se migrarán; esos tres scripts continúan fuera del alcance y necesitarán contratos específicos en su frontera.
- **Compatibilidad de lenguajes:** los ocho escenarios de `source-loader.test.cjs` crean JS/JSX/TS/TSX temporales para mezcla de lenguajes, mocks falsy, caché/ciclos, resolución inequívoca, JSX, aislamiento, recuperación tras error y transformación offline. Esos archivos generados no son módulos pendientes de conversión.
- **Contratos estáticos:** los ocho archivos de `tests/types/` se comprueban con `test:types`; no se ejecutan con `node:test`. Los 11 helpers y los 21 JSON tampoco se descubren como pruebas independientes.
- **Fuera de esta ejecución:** interacción de navegador, arranque de los tres servidores, ejecución de los tres seeds, JVM/APK, proveedores reales, auditoría de dependencias y despliegue. Se inventarían sus consumidores; no se presentan como pruebas realizadas. La fase 0 no modifica esos helpers ni sus dependencias. No se excluyó ningún `.test.cjs` ni se omitió una integración PostgreSQL.

## Fronteras y consumidores que deben seguir funcionando

[consumers.json](reference/consumers.json) registra **122 referencias externas** con archivo, línea, texto, tipo de consumidor, helpers identificados y último commit que modificó el archivo. Los números de línea describen la referencia previa a actualizar la documentación. Las expresiones generadas, como el servidor elegido por nombre, requieren revisar también el contexto del ejecutor.

| Helper o consumidor | Dependencia que debe conservarse al migrar |
| --- | --- |
| `load-source.cjs` | Resolución exacta, imports relativos/alias, allowlist, caché, contextos `vm`, exports públicos/privados y entorno ficticio. Lo importan directamente 98 pruebas, tres helpers y `db:verify`. |
| `browser-module.cjs` | Esbuild ESM, resolución del cargador y mocks; consumido por la prueba del cargador y el servidor offline. |
| `legacy-route-context.cjs` | Cuatro pruebas; compone diez bibliotecas y rutas dinámicas. Expone seis funciones privadas de Dashboard y `formatPurchase` de compras a meses. Las listas exactas permanecen en el archivo y en el índice de cargas. |
| `debt-fixture.cjs` | Cuatro pruebas; handlers elegidos por ruta, estado simulado, bloqueo, rollback y fallo de persistencia. |
| `next-fixture.cjs` | Dos servidores Next; copia `tsconfig*.json`, declaraciones y configuración. El futuro `tsconfig.tests.json` exige revisar ese patrón. |
| `money-browser-server.cjs`, `capture-browser-server.cjs` | Importan Prisma/Next desde `node_modules` después de configurar el entorno; preservan orden de carga, Auth ficticia y validación de BD local. |
| `offline-browser-server.cjs` | Genera los módulos ESM de cola y observador mediante `browser-module`; sirve el fixture HTTP. |
| `seed-ui.cjs`, `seed-capture-review.cjs`, `seed-receiver-payments.cjs` | Datos ficticios, relaciones, restricción de conexión local y desconexión de Prisma. Son comandos explícitos, no tests autodetectados. |
| `package.json`, `scripts/verify-database-reproduction.cjs` | Actualmente descubren solo `.test.cjs`; el segundo importa el cargador y lanza otro proceso Node. Sus regresiones incluyen los snapshots históricos `a11-metadata-before.json` y `a11-automation-before.json`, además de los dos SQL de metadatos/automatización. |
| `README.md`, `docs/android-captura.md`, planes de migración | Mantener invocaciones y distinción entre comprobación estática, suite local y aceptación real. |

Las rutas construidas mediante variables aparecen en autorización general, API/revisión de Captura, pagos de cortes, deudas, contratos financieros, operaciones relacionadas, gastos compartidos y los helpers históricos. `routeContext` conserva el mapa cerrado de bibliotecas y exports privados; el cargador general y el generador ESM también reciben rutas temporales. Ninguna de esas entradas recibe todavía un contrato TypeScript por este inventario.

Consumidores de `artifacts/` conservados para revisar los renombres:

- `typescript-migration/phase-0/transfers.cjs`: referencia del piloto con import directo del cargador; sigue siendo consumidor del código vigente.
- `typescript-migration/phase-5/compare-contracts.cjs`: copia/importa el cargador para comparar implementaciones de dos commits; debe adaptar tanto origen como destino de esa copia.
- `typescript-migration/phase-0/collect.py` y `phase-{1,2,3,4}/collect.py`: invocan el piloto; el de fase 1 también construye los nombres de los servidores. Sus resultados y supuestos son históricos. No se ejecutaron ni se certifica su compatibilidad completa con HEAD.
- `typescript-migration/phase-7/verify.py`: invoca el piloto desde una instalación temporal. Conserva su referencia propia de cierre de la web.

El inventario no retira ninguno de esos ejecutores. Al convertir sus dependencias, se adaptará el ejecutor que se mantenga vigente o se declarará su commit de reproducción, según fase 5; nunca se cambiarán logs o snapshots para aparentar compatibilidad. `lastChangedCommit` identifica procedencia, no certifica por sí solo un entorno reproducible.

## Hashes y cambios permitidos después de fase 0

[hashes.json](reference/hashes.json) fija SHA-256 de **394 archivos protegidos**: todas las fuentes web y declaraciones propias, esquema e historial Prisma, service worker, los 21 fixtures y fuentes/configuración Android. Registra además **672 artefactos históricos** y **11 archivos de dependencias/configuración/herramientas**. Los tres grupos permanecen idénticos al terminar la ejecución; los hashes de pruebas/helpers están en el inventario.

Durante la migración podrán cambiar `package.json` y el lockfile para incorporar la herramienta TS; ESLint y la configuración de pruebas; `db:verify` para registrar el soporte TS y compartir ejecución; las pruebas, helpers y consumidores enumerados. Podrán añadirse `tsconfig.tests.json`, el ejecutor común y adaptadores locales específicos. La web conserva `allowJs: false`, sus inclusiones y su comprobación de tipos; `pnpm-workspace.yaml` conserva la política explícita de scripts. `next.config.mjs`, PostCSS, componentes y Prisma config se registran como contexto y no requieren cambios previstos.

Esquema, SQL, fuentes de producto, protocolos, worker y fixtures no cambian para facilitar la conversión. Los ejecutores históricos pueden adaptarse cuando corresponda; sus resultados, JSON de referencia y demás evidencia permanecen como historial. No se añaden módulos `any`, declaraciones comodín ni supresiones para cerrar esta fase.

## Avisos e incidencias

Se conservan las tres advertencias de lint del cierre web: `loadSubscriptions`, `activeReceivables` y TanStack/React Compiler. Las pruebas emiten el aviso preexistente de `pg` sobre consultas concurrentes en un cliente. Prisma anunció una versión disponible durante el primer intento; no se actualizaron paquetes ni se silenciaron avisos. Los logs son la evidencia de qué anunció cada ejecución, no una auditoría de seguridad actual.

En el [primer intento](baseline/execution.json), los controles de AFP, los 854 escenarios de cada ejecución y sus secuencias pasaron. Falló solamente el cotejo nuevo de ubicaciones: el AST situaba `t.test` al comienzo de `t`, mientras Node informa la columna del identificador `test`. Afectó a los 299 subtests. Se añadió `runtimeColumn`, se comprobó contra todos los eventos originales y se repitió el recolector completo con salida nueva en `reference/`. No se cambiaron pruebas ni expectativas de AFP. El primer intento y su error se conservan.

## Reproducir y comparar

Requisitos: las dependencias del lockfile ya instaladas, Node/pnpm indicados, Python 3, GNU `cp`, Podman y espacio para una copia física de `node_modules` (aproximadamente 1,2 GB). Descargar una vez la imagen fijada, si todavía no está disponible:

```bash
podman pull docker.io/library/postgres@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571
python3 artifacts/typescript-tests-migration/phase-0/collect.py /tmp/afp-tests-ts0-nueva-referencia
```

El destino **no debe existir**. [collect.py](collect.py) rechaza reemplazarlo, crea y limpia PostgreSQL automáticamente y no utiliza conexiones heredadas del shell. Los logs y JSON permanecen en el destino incluso si falla un control. El código de salida solo es cero si pasan los controles, coinciden los escenarios sin omisiones y se conservan los hashes. La referencia corresponde al estado copiado, registrado en `execution.json`; para repetir exactamente esta entrega, usar su commit y las mismas dependencias.

Para regenerar únicamente el índice estático del checkout, sin BD ni controles:

```bash
node artifacts/typescript-tests-migration/phase-0/inventory.cjs /tmp/afp-tests-ts0-nuevo-inventario
```

El [reportero](scenario-reporter.cjs) solo observa eventos; no ejecuta tests por sí mismo. Los tres archivos nuevos de recolección son herramientas de evidencia fuera de `tests/`, no una implementación anticipada del ejecutor ni un incremento del total de pruebas. En fases siguientes, comparar las identidades y repeticiones de `scenarios.json`, justificar cualquier división/renombre y revisar los hashes protegidos. Un total igual o mayor, por sí solo, no acredita conservación.
