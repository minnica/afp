# Plan de migración de pruebas y helpers a TypeScript

**Estado:** fases 0–4 completadas localmente; fases 5–6 pendientes. **Base revisada del plan:** `6aad1ab`, 28 de octubre de 2026. La [referencia nueva de fase 0](../artifacts/typescript-tests-migration/phase-0/README.md) parte de `6c1b626`; la [fase 1](../artifacts/typescript-tests-migration/phase-1/README.md) parte de `700afcc` y la [fase 2](../artifacts/typescript-tests-migration/phase-2/README.md) de `c0a0a37`; la [fase 3](../artifacts/typescript-tests-migration/phase-3/README.md) parte de `dd81d4f`; la [fase 4](../artifacts/typescript-tests-migration/phase-4/README.md) parte de `429d747`. La [migración de la web](plan-migracion-typescript.md) permanece completada. Este plan amplía el tipado a las herramientas de prueba sin cambiar el comportamiento de AFP.

## Objetivo y alcance

Migrar las pruebas ejecutables y sus helpers a TypeScript para detectar incompatibilidades entre la aplicación, sus datos ficticios y las dependencias simuladas antes de ejecutar la suite. Conservar todos los escenarios, resultados y garantías de aislamiento existentes.

| Incluido | Límite del trabajo |
| --- | --- |
| `tests/*.test.cjs` | Convertir a `.test.ts`, con entradas, resultados y callbacks comprobados |
| `tests/helpers/*.cjs` | Convertir cargadores, simuladores, servidores de navegador y preparación de datos a `.ts` |
| `tests/types/` | Conservar los contratos existentes y añadir casos negativos para la infraestructura nueva |
| Configuración y ejecución | Ajustar scripts de package.json, configuración de tipos, ESLint, dependencias de desarrollo y descubrimiento de pruebas |
| Consumidores externos de los helpers | Adaptar invocaciones de `db:verify`, documentación y ejecutores históricos que se mantengan reproducibles |

Quedan fuera la conversión general de `scripts/`, configuraciones `.mjs`, `public/sw.js`, Android Kotlin y el código histórico guardado como evidencia. Los fixtures JSON conservan su formato y contenido. Los archivos JS/JSX creados temporalmente por las pruebas del cargador siguen siendo casos de compatibilidad, no módulos pendientes de migración.

No se requieren cambios en esquema, migraciones SQL, reglas financieras, respuestas HTTP, interfaz ni despliegue. Un defecto funcional descubierto se registra y resuelve como un cambio separado; no se modifica una expectativa para hacer pasar la conversión.

## Inventario inicial

| Elemento | Estado en la base revisada |
| --- | --- |
| Pruebas ejecutables | 106 archivos `.test.cjs` |
| Helpers | 11 archivos `.cjs` |
| Tamaño conjunto | 12 507 líneas, incluidos comentarios y espacios |
| Contratos de tipos existentes | 8 archivos TS/TSX en `tests/types/` |
| Uso directo de `sourceLoader` | 98 archivos de pruebas |
| Uso de `routeContext` | 4 archivos de pruebas |
| Uso directo de `vm` | 2 archivos: `api-fetch.test.cjs` y `offline-service-worker.test.cjs` |
| Referencias a `AFP_TEST_DATABASE_URL` | 38 archivos de pruebas; no equivale al número de casos de integración |
| Herramientas | Node.js 22.23.2, pnpm 10.33.0, TypeScript 6.0.3 y esbuild 0.28.2 |
| Ejecutor | `node:test`, con `--experimental-test-isolation=none` |
| Último cierre completo registrado | 854 pruebas correctas, sin fallos ni omisiones, con PostgreSQL local |

Los grupos del inventario se solapan. Los 854 resultados de la tabla corresponden al [cierre de la migración web](../artifacts/typescript-migration/phase-7/README.md). La fase 0 confirmó una referencia nueva con los mismos 854 escenarios: 555 de primer nivel y 299 subtests, identificados por archivo, nombre y jerarquía, con PostgreSQL local y sin omisiones. El avance se medirá por contratos y escenarios conservados, además de archivos migrados.

### Dependencias que requieren atención

- [load-source.ts](../tests/helpers/load-source.ts) transforma módulos con esbuild y los evalúa en `vm`. Desde fase 2 vincula rutas a sus exports reales; la fase 3 amplía los contratos del núcleo financiero y la fase 4 los de Captura, Calendar, HTTP y offline, con 97 módulos vinculados y comprobación de esquemas, constantes y constructores. Las rutas dinámicas siguen devolviendo `unknown`; los helpers privados financieros tienen contratos mínimos por ruta.
- [legacy-route-context.ts](../tests/helpers/legacy-route-context.ts) combina exports de varios módulos y expone algunas funciones privadas de handlers. La fase 3 conserva una lista cerrada y contratos mínimos por ruta, sin exportar funciones desde producción.
- [debt-fixture.ts](../tests/helpers/debt-fixture.ts) simula persistencia, bloqueo y rollback. Desde fase 3 distingue registros, consultas y transacciones sin presentarse como un cliente Prisma completo; conserva tombstones sin ID y los fallos simulados.
- [package.json](../package.json) y [verify-database-reproduction.cjs](../scripts/verify-database-reproduction.cjs) descubrían únicamente `.test.cjs` en fase 0. Desde fase 1 comparten el ejecutor mixto; el segundo importa el cargador TS y registra tsx en el proceso principal y en las regresiones.
- [next-fixture.cjs](../tests/helpers/next-fixture.cjs) copia configuraciones por patrón; debe distinguir las necesarias para la web de las exclusivas de pruebas.
- Los tres servidores de navegador y los tres scripts de preparación de datos se invocan también desde documentación y ejecutores en `artifacts/`. Un renombre debe actualizar sus consumidores vigentes.

## Decisiones técnicas

### Ejecución y convivencia

Conservar `node:test`, el modelo de módulos actual del paquete y la política de aislamiento. Usar `.test.ts` y `.ts` para los módulos migrados, con imports tipados y `import type` para dependencias exclusivamente estáticas. No añadir `"type": "module"` a la aplicación ni sustituir el framework de pruebas.

La fase 1 adoptó **tsx 4.23.15 como dependencia de desarrollo**, fijada exactamente en manifiesto y lockfile, y registra `node --import tsx` en los procesos que ejecutan pruebas o helpers convertidos. Se comprobó compatibilidad con Node 22.23.2, CommonJS, imports dinámicos, rutas relativas y procesos hijos. La política `allowBuilds` no cambió; tsx reutiliza esbuild 0.28.2. Node documenta este modo de ejecución; su soporte nativo de TypeScript tiene límites de sintaxis, resolución y configuración que deben considerarse si se elige una alternativa. [Documentación de Node 22](https://nodejs.org/docs/latest-v22.x/api/typescript.html).

Mantener esbuild dentro de `sourceLoader` y del generador de módulos de navegador: ahí preserva los mocks y el entorno controlado. El registro de tsx en el proceso de pruebas no debe sustituir esa carga por imports directos de servicios reales. Esbuild transforma TypeScript, pero no comprueba tipos; la ejecución y `tsc` son controles separados. [Documentación de esbuild](https://esbuild.github.io/content-types/#typescript).

Desde fase 1, [tests/run-tests.ts](../tests/run-tests.ts) es el único mecanismo de descubrimiento y ejecución compartido por `pnpm test` y las regresiones de `db:verify`:

- Durante la transición admite `.test.cjs` y `.test.ts`, ordenados de forma determinista. Rechaza dos archivos con el mismo nombre base para evitar duplicar o esconder escenarios.
- No ejecuta `tests/types/`, helpers, seeds, fixtures de datos ni artefactos como pruebas.
- Permite ejecutar archivos concretos durante el desarrollo, sin que un filtro accidental reduzca la suite obligatoria de cierre.
- Propaga explícitamente el registro de tsx, opciones de aislamiento, entorno de prueba y códigos de salida a los procesos hijos. Comprueba también fallos de arranque y terminaciones por señal.
- Al cerrar la transición descubre únicamente `.test.ts`. Se retiran puentes temporales y referencias obsoletas.

Sin argumentos ejecuta la suite completa. `pnpm test archivo.test.ts otro.test.cjs` selecciona rutas exactas, conservando el orden de descubrimiento; rechaza rutas ajenas, ausentes o repetidas y opciones desconocidas. `pnpm test --list` lista sin ejecutar; `node --import tsx tests/run-tests.ts --list` entrega solo el JSON. Los cierres usan los comandos sin selección.

`db:verify` puede conservar su archivo CJS. Su proceso principal debe registrar el soporte TS antes de importar helpers convertidos, y su proceso de regresiones debe usar el mismo ejecutor que `pnpm test`. Evitar depender de un `NODE_OPTIONS` global o de flags que `spawnSync` no hereda automáticamente.

### Comprobación estática

Añadir `tsconfig.tests.json` para las pruebas ejecutables, helpers y ejecutor. Heredar las reglas estrictas de la aplicación, incluido `noUncheckedIndexedAccess`, y conservar `noEmit`, los tipos Node/DOM necesarios y la configuración JSX para módulos TSX alcanzados. Ajustar resolución e imports a la opción de ejecución verificada en fase 1.

La configuración principal de la web mantiene `allowJs: false` y sus inclusiones actuales. Solo la configuración de pruebas podrá usar temporalmente `allowJs: true` y `checkJs: false` para consumir helpers CJS aún pendientes; esos archivos no se contarán como tipados. La configuración final de pruebas usará `allowJs: false`.

`pnpm typecheck:tests` ejecuta `prisma generate && next typegen && tsc --project tsconfig.tests.json --noEmit` desde fase 1. Mantener `pnpm test:types` para los casos de compilación positivos y negativos; estos no se ejecutan con `node:test`. Se verificaron las tres comprobaciones de tipos desde una instalación sin `.next` ni caché de TypeScript. El programa de pruebas habilita imports relativos con extensión `.ts`; conserva la resolución `bundler` comprobada con tsx.

Extender ESLint a todas las pruebas migradas y a su configuración de proyecto. Aplicar las reglas actuales contra `any`, usos inseguros, supresiones y dobles conversiones. `@ts-expect-error` explicado se reserva para casos negativos en `tests/types/`; no se usa para hacer compilar fixtures incompletos o llamadas de una prueba ejecutable.

Los imports de scripts CJS fuera del alcance, como `audit-migration-history.cjs`, requieren un adaptador local o una declaración específica adyacente con firmas verificadas por sus pruebas. Inventariar esas fronteras. No usar declaraciones globales por comodín ni interfaces ficticias para ocultar un test o helper todavía sin migrar.

### Contratos del cargador y los mocks

El cargador debe vincular cada ruta conocida con los exports reales del módulo mediante tipos como `typeof import(...)`. Un mapa tipado de rutas puede ampliar sus entradas por lote; una ruta temporal desconocida debe devolver `unknown` hasta que la prueba compruebe su forma. No exponer `load<T>(ruta)` como mecanismo para asignar cualquier contrato elegido por el consumidor.

La conversión entre exports dinámicos de `vm` y el contrato estático se concentra en una frontera local documentada, con comprobación de ruta/exports y pruebas positivas y negativas. No es posible demostrar toda la semántica de un módulo ejecutado en `vm` mediante una conversión de tipo. El resto de la suite debe consumir funciones con parámetros y resultados reales, sin casts repetidos por archivo.

| Frontera | Criterio |
| --- | --- |
| Exports públicos | Tipos derivados del módulo real; un cambio incompatible debe fallar en las pruebas consumidoras |
| Helpers privados expuestos | Lista cerrada por ruta y contrato local mínimo; conservar la prueba de comportamiento sin exportarlos desde producción solo para tiparlos |
| Mocks de módulos | Firmas derivadas de los miembros utilizados y factories tipadas; una llamada no simulada falla explícitamente |
| Prisma simulado | Tipos de argumentos/resultados de las operaciones usadas, con consultas y relaciones concretas; no convertir un objeto parcial en `PrismaClient` completo |
| HTTP y Auth simulados | Usar `Request`, `Response`, `Headers` y los contratos reales cuando corresponda; si una respuesta simulada usa `.body`, declararla como adaptador de prueba y no hacerla pasar por `NextResponse` |
| React y formularios simulados | Tipar props, callbacks y hooks usados; comprobar la forma de los elementos antes de recorrer sus hijos, conservando validación, estado y UUID del formulario |
| Datos ficticios válidos | Builders por dominio y `satisfies` cuando permita comprobar la forma sin perder inferencia; distinguir Decimal, Date y su representación JSON |
| JSON inválido o heredado | Mantenerlo como `unknown` en la entrada externa y comprobar su rechazo o compatibilidad; no validarlo ni completarlo antes de la operación que se está probando |
| Errores y callbacks | Discriminar desde `unknown` antes de leer `code`, `status` o `message`; tipar promesas, temporizadores y callbacks de Node |

Para casos deliberadamente inválidos de una función interna con parámetros estrictos, crear una frontera de prueba acotada que permita inyectar el dato sin afirmar que es válido; documentar el caso y conservar la aserción de rechazo. No debilitar la firma de producción ni reemplazar la prueba por una comprobación de compilación.

Conservar datos omitidos, nulos, JSON malformado, respuestas perdidas, UUID repetidos y estados históricos. Evitar un builder global que añada valores predeterminados a todos los fixtures: podría eliminar precisamente las condiciones que las pruebas deben cubrir.

### Aislamiento y compatibilidad

- `sourceLoader` mantiene `process.env` ficticio por defecto, mocks prioritarios incluso con valores falsy, caché por instancia, imports circulares y eliminación de la caché tras errores. No carga `.env` ni habilita adaptadores de red/BD por el cambio de lenguaje.
- Las extensiones explícitas señalan archivos exactos; no se restablece la sustitución silenciosa de `.js` por `.ts`. Las rutas sin extensión siguen rechazando implementaciones ambiguas.
- Preservar las particularidades entre contextos `vm`, como prototipos de arrays/errores, exports vivos y globals inyectados. No cambiar aserciones porque un objeto proceda de otro contexto.
- Las integraciones y seeds conservan la restricción a PostgreSQL desechable `localhost`/`127.0.0.1`, base `afp_test…`, con las validaciones del README. Los datos ficticios y las conexiones de prueba se seleccionan explícitamente.
- En servidores y seeds, preparar y validar el entorno antes de cargar módulos que lo leen al inicializarse. Convertir un `require` tardío en un import adelantado puede alterar ese orden; usar carga diferida cuando haga falta.
- Preservar limpieza de datos, conexiones, temporizadores, servidores y carpetas temporales, también cuando una prueba falla. No cambiar concurrencia ni aislamiento global como efecto lateral.

## Fases de implementación

Las fases 0–4 están completadas; las fases 5–6 siguen pendientes. Cada lote debe ser revisable y contener el módulo convertido junto con sus consumidores y herramientas afectados.

| Fase | Entrega | Dependencia |
| --- | --- | --- |
| 0 | Referencia e inventario de escenarios y consumidores | Ninguna |
| 1 | Ejecución mixta y comprobación estricta de pruebas | 0 |
| 2 | Cargador tipado y piloto de un flujo financiero | 1 |
| 3 | Pruebas financieras y helpers de persistencia | 2 |
| 4 | Captura, Calendar, HTTP y offline | 3 |
| 5 | Servidores de navegador, seeds y consumidores externos | 4 |
| 6 | Retirada de puentes y validación limpia final | 5 |

### Fase 0 Establecer la referencia

- [x] Guardar inventario de archivos, escenarios/subtests, fixtures, dependencias, rutas dinámicas y comandos consumidores, incluido `artifacts/` cuando sus ejecutores se sigan usando.
- [x] Ejecutar los controles actuales y la suite completa con PostgreSQL local migrado; registrar versiones, commit, duración, fallos, omisiones y avisos preexistentes. Ejecutar `db:verify` para fijar también su referencia.
- [x] Separar pruebas de comportamiento, contratos estáticos, lectura de fuentes, scripts y compatibilidad de JS/JSX. Registrar cualquier exclusión real.
- [x] Registrar hashes de fuentes de aplicación, esquema, SQL, service worker y fixtures JSON. Identificar dependencias/configuración que sí podrán cambiar por la migración.

**Aceptación:** referencia repetible, escenarios identificados y ninguna omisión de integración presentada como éxito. Conservar la evidencia previa sin reemplazar sus resultados por los de esta ejecución.

**Resultado (28 de octubre de 2026):** [fase 0](../artifacts/typescript-tests-migration/phase-0/README.md). Inventariados 117 archivos CJS, ocho contratos estáticos, 21 fixtures JSON y 122 referencias externas. Los 854 escenarios coinciden en orden y jerarquía entre `pnpm test`, su observación con reportero y las regresiones de `db:verify`. Pasaron tipos, contratos, lint y build; reconstrucción/actualización verificó 42 migraciones y 45 tablas con RLS. Se conservan 394 archivos protegidos, 672 artefactos históricos y 11 archivos de configuración/herramientas por hash. Se registraron las advertencias preexistentes y el primer intento del recolector, corregido sin modificar pruebas. Navegador y seeds se inventariaron, sin ejecutarlos; no se omitió ninguna integración de la suite. No se adelantó la conversión ni la infraestructura de fase 1.

### Fase 1 Preparar ejecución y comprobación de tipos

- [x] Validar y fijar tsx como dependencia de desarrollo; mantener `node:test`, versiones principales y política de instalación. No habilitar scripts de dependencias indiscriminadamente.
- [x] Crear `tsconfig.tests.json`, `typecheck:tests` y las reglas ESLint correspondientes. Mantener separado el programa de casos negativos.
- [x] Añadir el descubrimiento común de `.test.cjs`/`.test.ts` y actualizar `pnpm test` y `db:verify`, incluido su import del cargador y sus procesos hijos.
- [x] Convertir una prueba pequeña, como `latest-request.test.cjs`, para verificar convivencia, tipos y ejecución sin arrancar servicios reales. En ese caso puede importarse directamente el módulo puro, tras comprobar que no inicializa dependencias externas; los módulos con mocks seguirán pasando por el cargador en fase 2.
- [x] Probar selección de archivos, nombres duplicados, ausencia inesperada de pruebas, propagación de fallos y preservación del orden/aislamiento. Verificar que ni seeds ni contratos negativos se ejecutan por descubrimiento.

**Aceptación:** todos los escenarios de referencia siguen descubiertos una sola vez; `pnpm test` y `db:verify` coinciden en la suite completa. La herramienta propuesta funciona desde instalación limpia y no expone variables del entorno real al cargador.

**Resultado (28 de octubre de 2026):** [fase 1](../artifacts/typescript-tests-migration/phase-1/README.md). Ejecutor mixto compartido, tsx 4.23.15 y programa estricto de pruebas con ESLint; `latest-request.test.ts` conserva sus tres escenarios mediante import del módulo puro. Se añaden ocho escenarios de infraestructura y tres contratos negativos, separados de la ejecución. Los helpers mantienen CJS sin contarse como tipados; los fixtures Next copian solo el programa web y regeneran sus tipos. La evidencia registra instalación limpia, controles, regresiones PostgreSQL, correspondencia de los 854 escenarios y conservación de hashes protegidos; también conserva el primer intento y la corrección del contrato de entorno.

### Fase 2 Tipar el cargador y ejecutar un piloto

- [x] Convertir `load-source`, `browser-module` y `source-loader.test`, actualizando las referencias exactas de sus consumidores CJS/TS. Actualizar en ese mismo lote el arranque con soporte TS de servidores, seeds y scripts que los importen, aunque sus archivos de entrada continúen en CJS hasta una fase posterior.
- [x] Introducir contratos de rutas, mocks y globals. Añadir casos negativos para argumentos incorrectos, exports inexistentes y resultados mal utilizados; comprobar que una ruta dinámica no recibe tipos inventados por el llamador.
- [x] Conservar los ocho escenarios actuales del cargador: mezcla de lenguajes, prioridad de mocks, caché/ciclos, resolución, JSX/TSX, aislamiento, errores y transformación offline.
- [x] Migrar `money-transfer-client.test.cjs` y `money-transfer-integration.test.cjs` como piloto completo. Tipar mocks HTTP y datos Prisma manteniendo acciones, importes, propietarios, UUID, conflictos y reversión.
- [x] Medir esfuerzo, tiempo de comprobación y cantidad de adaptadores. Revisar las decisiones de ejecución y contratos antes de extenderlas.

**Aceptación:** el piloto detecta incompatibilidades estáticas y conserva sus escenarios de ejecución, incluida la integración real local. Ningún helper migrado devuelve `any` a sus consumidores; las fronteras dinámicas quedan inventariadas y probadas.

**Resultado (28 de octubre de 2026):** [fase 2](../artifacts/typescript-tests-migration/phase-2/README.md). Cargadores y tres pruebas convertidos, siete rutas vinculadas a exports reales, dobles mínimos de HTTP/Auth/formularios y contratos negativos. Se conservan los ocho escenarios del cargador y los catorce del piloto; se añade un escenario de infraestructura. Los consumidores CJS activos y su proceso hijo registran TS explícitamente. La evidencia recoge instalación limpia, controles, PostgreSQL, `db:verify`, carga ESM en Chrome, comparación de escenarios/hashes y límites de los adaptadores. Las fases 3–6 continúan pendientes.

### Fase 3 Migrar el núcleo financiero

Orden de lotes: cálculos de tarjetas/MSI y presentación → suscripciones y gastos → deudas e ingresos → Mi dinero, rendimientos, presupuestos y proyección.

- [x] Convertir `legacy-route-context` y `debt-fixture` junto con el primer grupo de consumidores que los use. Conservar bloqueo, rollback y fallos simulados.
- [x] Migrar pruebas y factories por dominio, derivando contratos de consultas y comandos existentes. Mantener datos mínimos cuando el caso depende de campos ausentes.
- [x] Tipar pruebas de autorización, relaciones por propietario, pagos, abonos, recibos y transacciones sin alterar resultados financieros.
- [x] Actualizar las pruebas de scripts, migraciones y fuentes Android que no encajen en otro lote; declarar de forma específica los contratos de scripts CJS externos al alcance.

**Aceptación:** escenarios de referencia conservados, incluyendo diferencias entre cargo bancario y aportación personal, pagos individuales y acumulados, cero confirmado y ausencia, previsión y movimiento real. Las integraciones usan PostgreSQL y no se sustituyen por mocks adicionales para facilitar el tipado.

**Resultado (28 de octubre de 2026):** [fase 3](../artifacts/typescript-tests-migration/phase-3/README.md). Convertidas 52 pruebas y los dos helpers de contexto/persistencia, con factories por dominio, consultas y fallos PostgreSQL reales. Se conservan los 854 escenarios de fase 0 y los 863 de fase 2, con tres escenarios adicionales para exports, fixtures parciales y adaptadores HTTP: 866 sin omisiones. Los scripts CJS externos al alcance tienen tres declaraciones específicas y casos negativos. La evidencia recoge instalación aislada, tipos, lint, suite completa, build, reconstrucción/actualización, correspondencia de escenarios, hashes y fronteras temporales. Captura, Calendar, HTTP/offline y los siete helpers CJS de navegador/seeds siguen pendientes en fases 4–6. Sin cambios de producto, esquema, SQL, fixtures JSON ni dependencias.

### Fase 4 Migrar integraciones y persistencia offline

Ejecutar tres lotes: captura → Calendar → cliente HTTP, recuperación y offline.

- [x] Convertir las pruebas unitarias y PostgreSQL de parsers, protocolo, políticas, revisión, conciliación, automatización y recibos de captura. Conservar el contrato Android v1 y los fixtures ficticios existentes.
- [x] Tipar dobles de OAuth/Google, eventos, cifrado, locks, revisiones y reintentos de Calendar. Mantener el proveedor simulado y la limpieza de temporizadores.
- [x] Migrar las pruebas de Auth/API, recuperación, clientes de UI y sus contratos de respuesta. Conservar las respuestas incompletas, fallos temporales y JSON original usados por idempotencia/concurrencia.
- [x] Migrar las pruebas de cola/observador offline y los dos contextos `vm` del service worker. Tipar IndexedDB, Web Locks, eventos y callbacks simulados sin cambiar `public/sw.js` ni la versión de la BD local.

**Aceptación:** misma matriz de escenarios; se mantienen duplicados, cambio de cuenta, recuperación entre pestañas y respuesta perdida. Los formatos inválidos siguen llegando a la validación que se prueba. No se requiere actualizar APK ni conectar proveedores reales por esta conversión.

**Resultado (28 de octubre de 2026):** [fase 4](../artifacts/typescript-tests-migration/phase-4/README.md). Convertidas las 50 pruebas restantes, con contratos públicos derivados de las fuentes, mocks mínimos de Auth/Google/HTTP, persistencia interceptada sobre PostgreSQL real y callbacks de IndexedDB, Web Locks y ambos contextos `vm`. Se conservan los 866 escenarios de fase 3 y todos los de fases 0 y 2, sin omisiones; una regresión nueva comprueba los metadatos de rutas: 867 escenarios en total. Hay 108 pruebas TS, 120 módulos TS activos de pruebas/helpers/ejecutor incluidos y once casos negativos nuevos en su programa separado. Pasaron instalación aislada, los seis controles, reconstrucción/actualización y comparación de escenarios/hashes. Los siete helpers CJS de navegador/seeds/Next y la retirada de puentes permanecen en fases 5–6. Sin cambios de producto, esquema, SQL, fixtures JSON, service worker, APK ni dependencias.

### Fase 5 Migrar los fixtures de navegador y seeds

- [ ] Convertir `next-fixture`, `money-browser-server`, `capture-browser-server` y `offline-browser-server`, tipando requests, responses, procesos, configuración y estado simulado.
- [ ] Convertir `seed-ui`, `seed-capture-review` y `seed-receiver-payments`, preservando validación de la conexión, IDs ficticios, relaciones y limpieza de recursos.
- [ ] Revisar la copia de configuraciones: no copiar `.env`, tipos generados ajenos ni referencias a archivos de pruebas ausentes en el fixture. Regenerar los tipos Next necesarios.
- [ ] Actualizar comandos vigentes en README, guía Android, scripts y ejecutores reproducibles de `artifacts/`. Conservar logs y snapshots históricos; señalar su commit de reproducción cuando un ejecutor ya no se soporte en HEAD.
- [ ] Verificar en navegador el formulario/API de transferencias, la revisión de una captura ficticia y la cola offline con dos pestañas, incluyendo respuesta perdida, cambio de cuenta y sincronización única.

**Aceptación:** los tres servidores y los tres seeds funcionan con sus nuevos comandos en entornos temporales. Los recorridos afectados conservan solicitudes, respuestas y efectos en BD/IndexedDB, sin errores nuevos de navegador. Detener servidores y recursos temporales al finalizar.

### Fase 6 Cerrar la migración de pruebas

- [ ] Confirmar que los 117 archivos originales están convertidos o tienen una resolución explícita sin perder escenarios. Incluir también todos los helpers/ejecutores nuevos en el programa de tipos.
- [ ] Desactivar `allowJs` en la configuración final de pruebas, retirar puentes temporales y limitar descubrimiento a `.test.ts`. Mantener únicamente las fronteras documentadas con herramientas JS fuera del alcance.
- [ ] Auditar `any`, supresiones, conversiones dobles, declaraciones comodín, archivos fuera del programa y tipos inventados por el cargador. Revisar las conversiones locales justificadas.
- [ ] Ejecutar instalación limpia con lockfile, todos los controles, suite PostgreSQL, `db:verify` y los fixtures afectados. Comparar escenarios y hashes con fase 0.
- [ ] Actualizar README, convenciones, plan y bitácora con el resultado real, comandos finales y excepciones. Mantener el plan de la web como una migración ya cerrada.

**Aceptación final:** ninguna prueba/helper activo queda en JS/CJS; todos los módulos TS se comprueban estrictamente; no se pierden ni omiten escenarios de referencia; build y reconstrucción de BD correctos. El código ejecutable JS generado como fixture y los scripts externos expresamente excluidos no cuentan como pendientes.

## Validación y evidencias

Desde la fase 1, ejecutar en el cierre de cada lote:

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
pnpm test
pnpm build
```

`typecheck:tests` existe desde fase 1 y no sustituye `test:types`. Para una comprobación completa, `pnpm test` debe recibir `AFP_TEST_DATABASE_URL` con PostgreSQL desechable migrado conforme al [README](../README.md#integraciones-con-postgresql). Una ejecución sin esa variable conserva su utilidad para desarrollo, pero sus omisiones no acreditan las integraciones.

Ejecutar `pnpm db:verify` en fases 0, 1 y 6, y cuando un lote altere su cargador, descubrimiento o ejecución. Verificar fixtures de navegador al cambiar sus helpers o dependencias. Durante la edición, empezar por las pruebas afectadas; repetir controles completos solo tras nuevos cambios, fallos o dudas pendientes.

Registrar las evidencias en `artifacts/typescript-tests-migration/phase-N/`; la [fase 0](../artifacts/typescript-tests-migration/phase-0/README.md) ya contiene la referencia inicial:

- Commit, versiones, archivos/contratos migrados y fronteras que siguen en CJS.
- Comandos, duración, resultados y omisiones; manifiesto de escenarios/subtests comparado con fase 0. Un total igual o mayor no demuestra por sí solo que se conservaron los casos anteriores.
- Casos negativos de tipos, resultado del descubrimiento común y auditoría de inclusión en TypeScript/ESLint.
- Compatibilidad de fixtures, comprobaciones de PostgreSQL y comparación de hashes protegidos.
- Incidencias, adaptadores temporales y condición concreta para retirarlos.

Los 854 casos del cierre anterior orientan la referencia, pero no fijan artificialmente el total: pueden añadirse pruebas de infraestructura. Toda baja, división o renombre de escenario debe tener correspondencia revisable. No establecer un porcentaje de cobertura nuevo ni sustituir pruebas de comportamiento por inspecciones de texto para declarar éxito.

## Reversión y primera entrega

Mantener lotes pequeños que reviertan conjuntamente renombres, imports, configuración, scripts y documentación. No borrar datos, colas, recibos ni fixtures para resolver incompatibilidades. La ausencia de cambios de esquema y producto permite volver al lote anterior sin una migración inversa de datos.

La primera entrega útil comprende **fases 0–2**: referencia nueva, herramientas compatibles y transferencias con pruebas/helpers tipados. Continuar con los demás módulos cuando ese piloto demuestre comprobación estática útil y conservación del comportamiento. Estimar el esfuerzo restante con sus tiempos y adaptadores reales; no asignar una duración sin esa medición.

La ejecución de este plan no necesita publicación ni cambios en servicios remotos. La automatización en CI puede abordarse por separado una vez establecidos los comandos; no es requisito para completar esta migración.
