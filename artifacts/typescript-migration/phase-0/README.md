# Fase 0: referencia previa a TypeScript

Referencia del commit `83a3924bbc4f430f881915b57217d4ca0ebb5aff`, ejecutada el **27 de octubre de 2026, America/Mexico_City** (28 de octubre UTC). Corresponde a la fase 0 del [plan](../../../docs/plan-migracion-typescript.md). No convierte módulos a TypeScript ni modifica el esquema, las dependencias o el comportamiento de la aplicación.

## Resultados

| Comprobación | Resultado | Tiempo |
| --- | --- | --- |
| `pnpm lint` | Correcto, sin advertencias | 18,665 s |
| Migraciones sobre base local vacía | Correcto | 5,582 s |
| `pnpm db:verify` | Correcto: 42 migraciones, 45 tablas con RLS; reconstrucción vacía y actualización desde las 13 migraciones históricas | 59,527 s |
| Suite completa, ejecutada dentro de `db:verify` | 820 pruebas correctas; 0 fallos, 0 omitidas, 0 canceladas | 42,428 s, incluido en el tiempo anterior |
| Registrar / comparar transferencias | 12 respuestas registradas e idénticas en una segunda ejecución con nuevos registros | 0,583 / 0,561 s |
| `pnpm build`, copia aislada de fuentes y dependencias | Correcto con Turbopack | 10,803 s, sin contar la copia |

Las versiones, comandos, códigos de salida, hashes del esquema, SQL y lockfile están en [execution.json](execution.json). Entorno: Node 22.23.2, pnpm 10.33.0, PostgreSQL 16.15, Next 16.3.8, React 19.2.4 y Prisma 7.10.1. Los tiempos describen esta máquina y esta ejecución; no son un benchmark.

Evidencias: [lint](lint.log), [migraciones](migrate.log), [suite y reconstrucción](database-verification.log), [registro del piloto](transfer-record.log), [comparación](transfer-reference.log) y [build](build.log).

## Inventario y contratos

[inventory.json](inventory.json) enumera cada archivo, sus imports, dependencias internas, consumidores por importación, líneas y pruebas que lo mencionan. Los handlers incluyen endpoint y consumidores HTTP identificados por texto. Estas asociaciones son un índice estático: no equivalen a cobertura ni detectan todas las referencias construidas dinámicamente. Las entradas de Next también se consumen por convención, aunque no tengan importadores.

| Módulo | Archivos activos / total | Datos y consumidores que deben conservarse | Pruebas de referencia |
| --- | --- | --- | --- |
| `src/app` | 49 / 49 | 31 handlers; JSON de éxito/error, métodos, códigos y headers; páginas/layout consumidos por Next | `api-authorization`, `api-auth-availability`, integraciones por dominio |
| `src/components` | 115 / 115 | Props, formularios con importes de edición como texto, estados de carga/recuperación; consumidos por páginas y otros componentes | Presentación, filtros, recuperación, estructura y fixtures de navegador |
| `src/hooks` | 6 / 6 | Sesión, consultas, notificaciones y estado React; consumidos por componentes | `latest-request`, `money-loading`, `request-recovery` |
| `src/lib/money` | 7 / 7 | Comandos por `action`, Zod, Decimal → centavos → números, días `YYYY-MM-DD`, JSON de referencias/planes; `/api/money` y pantalla Mi dinero | `money-*`, `transfers.cjs` de esta referencia |
| `src/lib/calculations` | 8 / 11 | Cortes, pagos, MSI, suscripciones, importes acumulados; API y presentación financiera | `card-*`, `installment-*`, `subscription-*`, `dashboard-breakdowns` |
| Bibliotecas de captura¹ | 25 / 25 | Credencial `Capture`, protocolo nativo v1, parsers, recibos y estados; API de captura, automatizaciones y cliente Android | `capture-*`, `automatic-payment-*`, `receiver-payment-*`, `android-*` |
| `src/lib/calendar` | 9 / 9 | OAuth, datos cifrados, IDs de eventos, revisiones y locks; endpoints de Calendar y sincronización | `google-calendar*` |
| Resto de `src/lib` | 30 / 33 | Auth, Prisma, fetch, idempotencia, deuda, gasto compartido, cola IndexedDB; API, hooks y componentes | `expense-*`, `related-operations`, `offline-expenses`, `api-fetch`, `shared-expenses`, `payables-*` |
| `src/actions` | 0 / 8 | Archivos vacíos, sin implementación que migrar | No cuentan como avance |

¹ Archivos cuyo nombre comienza por `capture` o `automaticPayment`. Totales: **249 activos / 263 archivos, 32 910 líneas**, 44 modelos Prisma. Las pruebas citadas son familias representativas; las asociaciones por archivo están en el JSON.

Los 14 vacíos son `src/actions/{cardCycles,cards,expenses,incomes,installmentPurchases,receivables,settings,subscriptions}.js`, `src/lib/calculations/{dashboard,installments,receivables}.js` y `src/lib/{dates,money,validations}.js`. Se conservan durante esta fase.

Compatibilidad que no debe perderse al añadir tipos:

- `/api/expenses` admite altas sin `operationId` para otros clientes, según `runExpenseOperation`; esos clientes no adquieren idempotencia por cambiar el lenguaje. Al editar, omitir `cashContributionAmount` conserva el valor anterior. No convertir campos omitidos en `null` o cero indiscriminadamente.
- `/api/money` usa UUID y recibos por propietario. Calcula la huella sobre el cuerpo original, antes de la validación/coerción de Zod. Texto monetario y número pueden representar el mismo importe y producir huellas diferentes. Preservar `TRANSFER`, `REVERSE_TRANSFER`, `{ok, id}` / `{ok}`, errores y aislamiento.
- Prisma maneja Decimal y Date; al serializar HTTP, algunos valores son texto y otros números calculados. La referencia conserva esa distinción, fechas, nulos, arrays y campos omitidos.
- Los pagos acumulados históricos sin abonos individuales siguen apareciendo mediante `payment:legacy:*`. Los snapshots JSON de saldos, referencias, rendimientos y presupuestos necesitan aceptar sus variantes históricas.
- Offline conserva `afp-offline-expenses`, versión 1, stores `expenses` y `legacyImports`, claves `[userId, clientId]`, UUID y la importación desde `afp:offline-expenses:`. Captura mantiene su protocolo v1 y Calendar sus identificadores y credenciales cifradas.
- Todas las rutas y métodos del [contrato público documentado](../../../README.md#api-y-autorización) siguen vigentes. Auth usa Bearer, el propietario proviene de la sesión y las respuestas privadas conservan `Cache-Control` y `Vary`.

## Cargas de código que afectan la migración

[source-loading.json](source-loading.json) registra archivo, línea y texto de cada coincidencia relevante en `tests/` y `scripts/`. Hay 98 archivos de pruebas: 83 mencionan `sourceLoader` y 15 contienen mecanismos directos de `vm` o equivalentes; pueden solaparse.

| Cargador / consumidor | Dependencia actual y trabajo previsto para la fase 1 |
| --- | --- |
| `tests/helpers/load-source.cjs` | Lee ruta exacta, agrega `.js` a imports relativos y `@/`, elimina imports/exports con regex y evalúa en `vm`. Mantener mocks prioritarios, caché y entorno ficticio al incorporar transformación JS/TS. |
| Pruebas con `vm` directo | Leen archivos y reemplazan imports/exports o extraen funciones. Sus líneas están inventariadas; renombrar fuentes o introducir sintaxis TS exige adaptar cada carga. Algunas solo importan `vm`: la búsqueda es deliberadamente conservadora. |
| `money-browser-server.cjs` | Copia `src`, `package.json`, `jsconfig.json`, `postcss.config.mjs`; usa Auth ficticia y PostgreSQL local. Debe copiar configuración TS y tipos propios cuando existan. |
| `capture-browser-server.cjs` | Misma dependencia de copia/configuración; conservar contratos del fixture y restricciones de BD local. Ambos fixtures compilan con webpack en modo producción. |
| `offline-browser-server.cjs` | Lee exactamente `src/lib/offlineExpenses.js`, reemplaza el import de `apiFetch` y sirve ESM crudo como `/queue.js`; necesitará transformación ESM al convertir la cola. |
| `scripts/verify-database-reproduction.cjs` | Ejecuta los `.test.cjs` y carga `cardBalanceTracking.js` mediante `sourceLoader` para comprobar registros históricos. Mantenerlo operativo junto con el cargador. |
| `transfers.cjs` de esta fase | Usa el mismo cargador y ruta literal a `money/route.js`; actualizar el mecanismo de carga durante la migración conservando las respuestas esperadas. |

## Piloto reproducible

[transfers.cjs](transfers.cjs) crea dos usuarios ficticios y dos cuentas del primer usuario, con saldos iniciales **1000,25 y 100,10**. Usa los handlers y servicios reales con Prisma/PostgreSQL; simula exclusivamente Auth, la envoltura de respuesta de Next y la programación de Calendar. Fija el reloj del código cargado al **2026-10-27 18:00 UTC**.

La [referencia JSON completa](transfers.expected.json) conserva 12 respuestas: altas de ambas cuentas, saldos iniciales, transferencia de 200,25, repetición, conflicto al cambiar a 200,26, saldos posteriores, consulta del segundo usuario, reversión ajena rechazada, reversión válida, repetición de reversión y saldos finales. Comprueba un único registro persistido, historial con `reversedAt`, saldos **800 / 300,35** tras transferir y restitución a **1000,25 / 100,10**. El total permanece en **1100,35**.

Solo normaliza IDs conocidos y timestamps de persistencia `createdAt`/`updatedAt`; conserva los demás campos y el orden. `reversedAt` se comprueba contra el reloj fijo. El modo normal compara sin actualizar la referencia y falla ante cualquier diferencia. `--record` reemplaza explícitamente el JSON: usarlo únicamente para una nueva referencia deliberada, nunca para hacer pasar una regresión. Cada ejecución elimina sus propios usuarios y registros mediante cascada.

## Repetir la comprobación

Requisitos: Node/pnpm indicados, dependencias del lockfile instaladas, Python 3, GNU `cp` y Podman (Docker puede sustituirlo). La compilación copia aproximadamente 1,2 GB de dependencias a un directorio temporal y luego lo elimina. No copia `.env`; usa una URL de BD local explícita y configuración ficticia de Supabase.

Desde la raíz del repositorio:

```bash
podman run --rm -d --name afp-ts-phase0 \
  -e POSTGRES_PASSWORD=afp_test_only -e POSTGRES_DB=afp_test_ts0 \
  -p 127.0.0.1::5432 \
  docker.io/library/postgres@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571
podman exec afp-ts-phase0 pg_isready -U postgres -d afp_test_ts0
podman port afp-ts-phase0 5432
```

Esperar a que `pg_isready` confirme disponibilidad. Sustituir `PUERTO` por el publicado:

```bash
export AFP_TEST_DATABASE_URL='postgresql://postgres:afp_test_only@127.0.0.1:PUERTO/afp_test_ts0'
python3 artifacts/typescript-migration/phase-0/collect.py
podman stop afp-ts-phase0
unset AFP_TEST_DATABASE_URL
```

El recolector exige host local y nombre `afp_test…`, migra esa base, ejecuta lint, `db:verify` (incluye la suite completa), comparación del piloto y build. `db:verify` crea y destruye sus propias bases/roles adicionales. Revisar el código de salida del recolector antes de detener el contenedor; detenerlo también si hubo un fallo. Las credenciales mostradas son exclusivas del contenedor ficticio.

Para comparar únicamente el piloto con una BD local ya migrada, ejecutar `node artifacts/typescript-migration/phase-0/transfers.cjs` con la misma variable. `collect.py --inventory-only` regenera solo inventarios; `--build-only` repite el build y añade su resultado a los metadatos existentes. Una ejecución completa regenera logs e inventarios: comparar el diff con esta referencia antes de guardarlos.

## Incidencias y límites

- El primer build falló porque el enlace a `node_modules` salía de la raíz de Turbopack. Se conserva [el fallo de preparación](build-symlink-attempt.log) y su código/tiempo en los metadatos. La preparación usa ahora una copia física de dependencias; no cambia el bundler ni la configuración de la aplicación.
- Prisma anunció una versión mayor disponible durante `db:verify`; no se actualizaron paquetes. El piloto emitió la advertencia preexistente de `pg` sobre consultas concurrentes en un cliente; se conserva en sus logs. No provocó fallos ni se silenció.
- La referencia prueba handlers/servicios reales con BD local, no el transporte HTTP de Next ni interacciones de navegador. Los tres servidores de navegador se revisaron estáticamente; las comprobaciones visuales y formulario → API corresponden al piloto de la fase 2. Auth, Calendar remoto y Android real no se certifican mediante estas simulaciones.
- Los 820 casos incluyen integraciones ejecutadas, sin `skip`; no representan un porcentaje de cobertura. El reloj fijo aplica al piloto nuevo, no a toda la suite histórica.
