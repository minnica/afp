# Plan de migración gradual a TypeScript

**Estado:** fases 0–7 completadas localmente. **Cierre:** [resultados de fase 7](../artifacts/typescript-migration/phase-7/README.md), 28 de octubre de 2026. **Interfaz:** [resultados de fase 6](../artifacts/typescript-migration/phase-6/README.md), 28 de octubre de 2026. **Captura, Calendar y offline:** [resultados de la fase 5](../artifacts/typescript-migration/phase-5/README.md), 28 de octubre de 2026. **Núcleo financiero:** [resultados de la fase 4](../artifacts/typescript-migration/phase-4/README.md), 27 de octubre de 2026. **Mi dinero:** [resultados de la fase 3](../artifacts/typescript-migration/phase-3/README.md), sobre `0c11537`, 27 de octubre de 2026. **Piloto implementado:** [resultados de la fase 2](../artifacts/typescript-migration/phase-2/README.md), sobre `2ff43a9`, 27 de octubre de 2026. **Base revisada del plan:** `4d7b6e6`, 27 de octubre de 2026. **Referencia ejecutada:** `83a3924`; [resultados y reproducción de la fase 0](../artifacts/typescript-migration/phase-0/README.md).

## Objetivo y alcance

Migrar el código activo de la web de AFP a TypeScript para comprobar los contratos entre formularios, API, servicios y persistencia antes de ejecutar la aplicación. Conservar el comportamiento financiero, las respuestas HTTP, la captura offline, las integraciones y la interfaz.

La migración se realizó por flujos completos y módulos, con JavaScript y TypeScript coexistiendo durante la transición. El primer flujo fue **transferencias entre cuentas propias en Mi dinero**. Su resultado permitió ajustar el esfuerzo y la secuencia del resto. Las decisiones y entregas siguientes conservan el recorrido de implementación; el estado final usa `allowJs: false` y no mantiene puentes temporales en `src/`.

Alcance final: código activo de `src/app`, `src/components`, `src/hooks` y `src/lib`. Las pruebas `.cjs`, scripts operativos, configuraciones `.mjs`, `public/sw.js` y la aplicación Android Kotlin pueden conservar su lenguaje; sus consumidores y herramientas deben seguir funcionando. Los archivos vacíos se inventariarán como tales y no contarán como módulos migrados.

Este trabajo no requiere cambiar el esquema de PostgreSQL. Cambios de producto, fórmulas, diseño, autenticación, formatos bancarios o versiones mayores de Next.js, Prisma y React se tramitarán por separado. La publicación seguirá el [procedimiento del README](../README.md#despliegue).

## Punto de partida

| Aspecto | Observación de la revisión |
| --- | --- |
| Código web | 263 archivos JS/JSX en `src/`, de los cuales 249 tienen contenido; aproximadamente 33 000 líneas incluyendo espacios y comentarios |
| Persistencia y API | 44 modelos Prisma y 31 Route Handlers |
| Comprobación de tipos | `jsconfig.json` configura alias; no hay un script de comprobación de tipos ni `@ts-check` en `src/` |
| Dependencias | Node.js 22.23.2, pnpm 10.33.0, Next.js 16.3.8, React 19.2.4 y Prisma 7.10.1 |
| Pruebas | 98 archivos `.test.cjs`; 83 usan `sourceLoader` y 15 contienen ejecución directa con `vm` u otros mecanismos similares; los grupos pueden solaparse |
| Contratos existentes | Zod valida entradas; Prisma genera tipos, pero las respuestas HTTP y numerosos objetos internos carecen de contratos estáticos explícitos |
| Acoplamientos a JavaScript | Cargador de pruebas, fixtures de navegador, rutas literales a `.js` y comprobaciones que inspeccionan código fuente |

Estos números describen el inventario, no una medición de cobertura. La fase 0 confirmó el inventario y ejecutó 820 pruebas con PostgreSQL local, sin fallos ni omisiones; lint, reconstrucción de BD, comparación del piloto y build correctos. Los resultados y límites están en la referencia enlazada arriba.

## Decisiones técnicas

### Convivencia y configuración

- Crear `tsconfig.json` conservando `@/*` → `src/*` y sustituir `jsconfig.json` cuando los fixtures ya sepan copiar la nueva configuración. Evitar mantener dos configuraciones de alias que puedan divergir.
- Usar inicialmente `allowJs: true`, `checkJs: false`, `strict: true`, `noEmit: true`, `isolatedModules: true`, `moduleResolution: "bundler"` y `noUncheckedIndexedAccess: true`. Conservar las opciones de JSX, bibliotecas, plugins e inclusión de tipos generados que requiera la versión instalada de Next.js.
- Los `.ts`/`.tsx` migrados se verifican desde el primer lote. El JavaScript restante no se considera validado estáticamente; sus fronteras requieren adaptadores tipados y validación cuando reciban datos externos.
- Incluir el código de aplicación, `prisma.config.ts` y los tipos generados por Next. Mantener pruebas de contratos de tipos en una configuración específica que herede las mismas reglas. Evitar incluir por accidente artefactos históricos y scripts operativos en el programa de tipos de la web.
- Declarar TypeScript y los tipos de Node/React como dependencias directas de desarrollo, con versiones compatibles y fijadas en el lockfile. TypeScript 6.0.3 ya está disponible transitivamente en el árbol local y será el candidato inicial; comprobar compatibilidad antes de fijarlo. Los tipos de Node deben corresponder al runtime 22 y los de React a la versión 19.
- Extender ESLint con la configuración TypeScript de Next y reglas para evitar `any` explícito y uso inseguro de datos en los archivos migrados. Mantener las reglas de JavaScript durante la transición.
- Conservar el modelo de módulos actual del paquete y `node:test`; no añadir `"type": "module"` ni cambiar el ejecutor de toda la suite como efecto lateral.

La convivencia está soportada por [`allowJs`](https://www.typescriptlang.org/tsconfig/allowJs.html). [`checkJs`](https://www.typescriptlang.org/tsconfig/checkJs.html) podría usarse con JSDoc en un archivo concreto como puente, sin habilitar de golpe la comprobación de todo el legado. [`strict`](https://www.typescriptlang.org/tsconfig/strict.html) y [`noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html) serán reglas de los módulos migrados.

### Contratos y representación de datos

| Capa | Criterio |
| --- | --- |
| Formularios | Distinguir valores durante la edición de valores validados; derivar `z.input` y `z.output` del esquema Zod |
| Comandos | Modelar variantes por `action`, con los campos requeridos de cada operación; no un objeto con todos los campos opcionales |
| Respuestas HTTP | Definir contratos explícitos de éxito y error y validar el JSON recibido donde corresponda; un `as Respuesta` no valida contenido |
| Persistencia | Usar tipos generados de Prisma, incluidos resultados con relaciones y `Prisma.TransactionClient`; no duplicar manualmente los 44 modelos |
| JSON persistido | Tratarlo como dato por validar; conservar compatibilidad con variantes históricas de referencias, reglas, snapshots y recibos |
| Dinero y fechas | Hacer explícitas las conversiones entre texto, número, centavos, Decimal, día bancario y timestamp; conservar precisión, redondeo y zona horaria |
| Errores | Recibir `unknown` y discriminar errores conocidos antes de leer `status`, `code`, `message` o datos específicos |

Zod permite derivar tipos de [entrada y salida](https://zod.dev/basics); Prisma ofrece [tipos de consulta y resultados](https://www.prisma.io/docs/orm/v7/prisma-client/type-safety). Los tipos de BD no se reutilizarán como si fueran respuestas JSON: fechas y Decimal pueden tener otra representación al cruzar HTTP.

Las validaciones nuevas deberán aceptar las formas que ya admite el contrato público, incluidos campos omitidos, nulos y formatos monetarios compatibles. Corregir o restringir esos contratos será otro cambio. Los tipos de identificadores o unidades podrán distinguirse internamente cuando eviten una confusión concreta, sin modificar su representación en JSON o BD.

**Protección de idempotencia:** conservar el cuerpo original utilizado para calcular las huellas, el orden de validación relevante y las respuestas guardadas. Coercionar números, eliminar propiedades o normalizar fechas antes de calcular el hash podría cambiar la identidad de un reintento. El código actual de [Mi dinero](../src/lib/money/service.ts) y [Gastos](../src/lib/expenseOperations.ts) es la referencia de compatibilidad.

## Secuencia de implementación

| Fase | Resultado | Depende de | Estado |
| --- | --- | --- | --- |
| 0 | Referencia funcional e inventario de dependencias | — | Completada |
| 1 | Herramientas y pruebas compatibles con JS/TS | 0 | Completada |
| 2 | Transferencias tipadas de formulario a persistencia | 1 | Completada |
| 3 | Mi dinero completo | 2 | Completada |
| 4 | Núcleo financiero, API y contratos compartidos | 3 | Completada |
| 5 | Captura, Calendar y cola offline | 4 | Completada |
| 6 | Resto de la interfaz, hooks y páginas | 5 | Completada |
| 7 | Retirada de puentes temporales y cierre | 6 | Completada |

Cada fase se divide en lotes revisables. Una dependencia compartida puede convertirse antes de su fase si el flujo actual la necesita; debe llevar sus consumidores y pruebas afectados en el mismo lote. La conversión de extensión, el tipado y cualquier extracción necesaria deben poder revisarse sin un reformateo masivo.

### Fase 0 — Establecer la referencia

**Trabajo**

- [x] Crear un inventario por módulo de archivos activos, consumidores, formatos de datos y pruebas. Identificar archivos vacíos y APIs de compatibilidad que deban conservarse.
- [x] Registrar commit, versiones, tiempos de pruebas/build y resultados actuales de lint, pruebas unitarias e integraciones en PostgreSQL local desechable.
- [x] Ejecutar `pnpm db:verify` para comprobar que la base de pruebas reproduce migraciones y RLS antes de cambiar sus herramientas.
- [x] Registrar las diferencias preexistentes: fallos, omisiones y advertencias, sin atribuirlas posteriormente a TypeScript ni ocultarlas.
- [x] Preparar datos ficticios de dos usuarios y dos cuentas para el piloto. Guardar respuestas de referencia de alta, repetición, conflicto, reversión y consulta de saldos; fijar el día y normalizar únicamente IDs/horas no deterministas al comparar.
- [x] Revisar todas las cargas por nombre de archivo: `sourceLoader`, las pruebas que usan `vm`, los tres servidores de pruebas y el verificador de reconstrucción de BD.

**Entrega:** [inventario, contratos, evidencias y comandos](../artifacts/typescript-migration/phase-0/README.md). Las 12 respuestas del piloto coinciden en dos ejecuciones con datos nuevos. Se resolvió un fallo de preparación del build aislado (enlace externo de dependencias) y se conservaron su log y las advertencias preexistentes. Esta fase no certifica interacciones de navegador ni proveedores externos reales.

**Aceptación:** existe una referencia repetible con PostgreSQL real local; sus casos de integración no figuran como omitidos. Cualquier fallo preexistente que impida verificar el piloto se resuelve o aísla antes de seguir. No usar Supabase personal para construir esta referencia.

### Fase 1 — Preparar herramientas y conservar las pruebas

**Archivos principales:** [package.json](../package.json), [pnpm-workspace.yaml](../pnpm-workspace.yaml), [eslint.config.mjs](../eslint.config.mjs), [cargador](../tests/helpers/load-source.ts), fixtures de [Mi dinero](../tests/helpers/money-browser-server.cjs), [captura](../tests/helpers/capture-browser-server.cjs) y [offline](../tests/helpers/offline-browser-server.cjs).

- [x] Añadir las dependencias y configuración descritas arriba. Proponer `pnpm typecheck` como `prisma generate && next typegen && tsc --noEmit`, verificando que funciona desde una instalación limpia.
- [x] Añadir una comprobación separada de contratos de tipos, por ejemplo `pnpm test:types`, y hacerla parte de las verificaciones obligatorias. Next genera sus tipos mediante `next typegen`; el [build debe conservar la detección de errores de TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript).
- [x] Conservar `node:test` y la interfaz pública del cargador. Sustituir la eliminación de imports mediante expresiones regulares por transformación de módulos JS/TS/JSX/TSX a CommonJS en memoria con esbuild como dependencia de desarrollo.
- [x] Mantener un resolvedor controlado de imports relativos y `@/`, prioridad de mocks, caché por cargador y entorno simulado. Soportar exports nombrados/default, imports solo de tipos y reexports. Detectar archivos ambiguos en vez de elegir entre dos implementaciones del mismo módulo.
- [x] Actualizar las referencias literales a `.js` en cada conversión. Durante la transición, el resolvedor puede admitir una referencia histórica solo cuando no exista el archivo exacto y el destino sea inequívoco; retirar ese puente al cerrar la migración.
- [x] Mantener el aislamiento de credenciales del cargador: `process.env` ficticio por defecto, dependencias de red/BD simuladas explícitamente y ninguna carga automática de `.env`.
- [x] Adaptar las pruebas con `vm` directo para usar la transformación compartida cuando lo necesiten. No eliminar escenarios ni reemplazar pruebas de comportamiento por comprobaciones de nombres o texto fuente.
- [x] Actualizar los fixtures de navegador para copiar `tsconfig.json`, sus configuraciones auxiliares necesarias y declaraciones propias, y regenerar los tipos de Next. Conservar sus restricciones a PostgreSQL local y la ausencia de `.env` copiado.
- [x] Preparar el servidor offline para entregar JavaScript ESM transformado cuando se convierta la cola, manteniendo su API ficticia. Revisar también las cargas realizadas por `scripts/verify-database-reproduction.cjs`.
- [x] Comprobar la instalación de esbuild con la política `allowBuilds` de pnpm; autorizar solo el paquete concreto si requiere instalación nativa. No habilitar indiscriminadamente scripts de dependencias.

esbuild [transforma TypeScript pero no comprueba tipos](https://esbuild.github.io/content-types/#typescript); `tsc` seguirá siendo obligatorio. La [API de transformación](https://esbuild.github.io/api/#transform) permite conservar el ejecutor actual sin una migración simultánea a otro framework de pruebas.

**Entrega:** [implementación, comprobaciones y reproducción de la fase 1](../artifacts/typescript-migration/phase-1/README.md). TypeScript 6.0.3, esbuild, configuración estricta, contratos negativos y fixtures compatibles; el código de aplicación permanece en JavaScript.

**Aceptación:** la suite previa conserva sus escenarios y aislamiento; se prueban imports JS↔TS, mocks, exports y eliminación de tipos con ejemplos pequeños. Funcionan los fixtures y `db:verify`. `typecheck`, comprobación de contratos, lint y build no ocultan errores. Una instalación con el lockfile resulta reproducible. Esta fase aún no altera reglas financieras.

### Fase 2 — Piloto: transferir entre cuentas propias

**Referencias:** [contratos tipados](../src/lib/money/transferContracts.ts), [persistencia del piloto](../src/lib/money/transfers.ts), [cliente](../src/lib/money/transferClient.ts), [editor compartido actual](../src/components/mi-dinero/MoneyEditor.tsx) (el adaptador del piloto se retiró en fase 7), [esquemas](../src/lib/money/schema.ts), [servicio](../src/lib/money/service.ts), [API](../src/app/api/money/route.ts), [pantalla](../src/components/mi-dinero/MoneyContent.tsx), [editor compartido](../src/components/mi-dinero/MoneyEditor.tsx) y [pruebas de integración](../tests/money-integration.test.cjs).

- [x] Definir los contratos de `TRANSFER` y `REVERSE_TRANSFER`, sus entradas validadas y respuestas. Mantener `POST /api/money`, acciones, códigos HTTP, UUID y formas JSON existentes.
- [x] Extraer la lógica de transferencia a un módulo `.ts` pequeño si hace falta. Recibir la transacción y los datos necesarios: conservar el bloqueo por propietario y el recibo de operación en la transacción actual, sin crear una segunda transacción interna.
- [x] Tipar la consulta de las cuentas involucradas y sus conversiones. Verificar propiedad, cuentas distintas, fecha desde la referencia y restricciones de reversión posteriores a conciliación.
- [x] Añadir una función de cliente tipada sobre `apiFetch` para ese comando y validar su respuesta. Conservar recuperación de errores, cancelación y cuenta esperada.
- [x] Crear un formulario o adaptador de transferencia tipado, reutilizando la interfaz existente. Declarar y probar su frontera con `MoneyEditor` si ese componente sigue en JSX; no contar el interior del editor como comprobado estáticamente todavía.
- [x] Mantener las otras acciones de Mi dinero en JavaScript mediante fronteras explícitas. Tipar el flujo elegido no exige convertir de una vez todo `MoneyContent` ni el motor de proyección.
- [x] Añadir pocos casos de compilación que demuestren rechazo de campos obligatorios ausentes, acciones incompatibles y respuestas mal usadas. `@ts-expect-error` se admite con explicación en esas pruebas negativas; no como salida para errores del código de producción.

**Aceptación funcional**

| Caso | Resultado que debe conservarse |
| --- | --- |
| Transferencia válida | Resta origen, suma destino y conserva el total, a centavos |
| Mismo UUID y contenido | Devuelve el recibo previo y no crea otra transferencia |
| Mismo UUID y contenido distinto | Conflicto, sin cambiar registros |
| Dos solicitudes concurrentes | Un único movimiento confirmado |
| Fallo durante la escritura | Rollback del movimiento y recibo incompleto |
| Cuenta ajena, inexistente o mismo origen/destino | Rechazo con el contrato existente, sin filtración de datos |
| Reversión | Conserva historial y restituye el efecto cuando las reglas existentes la permiten |
| Fecha o conciliación incompatible | Mantiene el bloqueo y el mensaje correspondiente |
| Error de red o refresco | Conserva borrador/UUID y distingue guardado confirmado de resultado incierto |

Las pruebas de integración deben ejecutarse con PostgreSQL local y recorrer formulario → API → datos → respuesta usando el fixture. Comparar las respuestas y saldos con la fase 0, incluidos pesos/centavos, textos monetarios, fechas, nulos y campos omitidos. Comprobar teclado, foco y funcionamiento móvil/escritorio sin rediseño.

**Cierre del piloto:** contratos estrictos, sin escapes de tipos injustificados; casos anteriores correctos; ningún cambio en esquema, reglas ni protocolo. Medir esfuerzo real, impacto en tiempos de comprobación y tamaño de los adaptadores. Ajustar los lotes siguientes con esa evidencia.

**Entrega:** [implementación y evidencias de la fase 2](../artifacts/typescript-migration/phase-2/README.md). Cinco módulos TS/TSX (158 líneas), ocho casos negativos de tipos y 840 pruebas con PostgreSQL local correctas, sin omisiones. Las 12 respuestas de fase 0 coinciden; el fixture verifica formulario → API → PostgreSQL, recuperación, foco y móvil/escritorio. Al cierre de la fase 2, `MoneyContent`, `MoneyEditor`, el handler, la coordinación transaccional y las demás acciones seguían en JS con fronteras explícitas; sus interiores no cuentan como migrados. Sin cambios de esquema, SQL, lockfile ni publicación.

### Fase 3 — Completar Mi dinero

**Ajuste tras el piloto:** revisar en tres lotes: (1) cuentas/conciliaciones y resultado tipado de `loadMoneyData`; (2) rutas/planes y composición de `MoneyEditor`; (3) fuentes, rendimientos, presupuestos y proyección. El piloto necesitó 80 líneas de adaptadores de formulario/cliente y consultas Prisma focalizadas adicionales (una al transferir, dos al revertir); al tipar la instantánea compartida, reutilizar sus datos y retirar esas lecturas duplicadas sin alterar la transacción. Los [tiempos observados](../artifacts/typescript-migration/phase-2/execution.json) y el [intervalo de implementación/verificación](../artifacts/typescript-migration/phase-2/implementation-measurements.json) orientan el tamaño revisable, sin extrapolar un calendario a módulos de mayor complejidad.

- [x] Migrar cuentas y conciliaciones; después rutas y planes; finalmente fuentes, presupuestos, rendimientos y proyecciones de [src/lib/money/](../src/lib/money/).
- [x] Convertir `loadMoneyData` a un resultado con propiedades explícitas y tipos derivados de consultas Prisma. Evitar depender de dos arrays paralelos de nombres y resultados; conservar el orden de consultas y la instantánea transaccional.
- [x] Definir todas las variantes de comandos y las respuestas de consulta. Validar JSON históricos como `baseline`, `yieldHistory`, `paymentMix` y snapshots con sus valores heredados compatibles.
- [x] Tipar `MoneyEditor` y la composición del resto de formularios diferenciando entrada/salida de Zod. Conservar valores durante la edición, reinicios, errores y recibos de operación.
- [x] Migrar los consumidores de previsión y presentación mensual sin cambiar sus fórmulas ni estado de carga.

**Aceptación:** regresiones de presupuestos, rendimientos, nómina, conciliaciones, pagos y proyección correctas. El calendario bancario, el consumo diario, la deduplicación de abonos reales y los saldos coinciden con la referencia. Las lecturas y escenarios siguen sin crear movimientos.

**Entrega:** [implementación, contratos y evidencias de la fase 3](../artifacts/typescript-migration/phase-3/README.md). Todo `src/lib/money/`, los consumidores de `src/components/mi-dinero/` y `/api/money` están en TS/TSX. `loadMoneyData` conserva las 15 consultas secuenciales con propiedades inferidas; transferencias reutiliza esa instantánea. Se mantienen fronteras locales con UI JSX, cálculos financieros y servicios compartidos pendientes. Verificación con instalación limpia, PostgreSQL desechable, comparación de las 12 respuestas de fase 0 y formularios en navegador. Sin cambios de esquema, migraciones, lockfile ni publicación.

### Fase 4 — Núcleo financiero y API compartida

Orden de lotes: cálculos de tarjetas/MSI → suscripciones → cuentas e ingresos → gastos y bootstrap → Dashboard y análisis. Incluir los servicios comunes de autorización, operaciones y recuperación cuando sus consumidores estén preparados.

- [x] Migrar [src/lib/calculations/](../src/lib/calculations/), contratos y handlers correspondientes, aprovechando tipos Prisma para consultas con relaciones.
- [x] Definir variantes de gasto por método `CASH`/`CARD`/`DEBIT` y tipos de deuda/cobro, sin sustituir validaciones de propietario ni reglas de negocio.
- [x] Tipar resultados de pagos parciales, importes exigibles, referencias bancarias y estados derivados. Conservar cero confirmado frente a ausencia de estado de cuenta.
- [x] Completar los contratos de `apiFetch`, errores recuperables y respuestas; las funciones que leen JSON deben validar o acotar el dato, no propagar `any`.
- [x] Actualizar consumidores por flujo; conservar adaptadores explícitos donde todavía permanezca JSX.

**Aceptación:** pruebas de autorización, transacciones relacionadas, idempotencia, suscripciones, deudas y cálculos correctas. Conservar acumulados frente a abonos individuales, aportación personal frente a cargo bancario y previsión frente a movimiento confirmado.

**Entrega:** [implementación, contratos y evidencias de la fase 4](../artifacts/typescript-migration/phase-4/README.md). Migrados los ocho módulos con contenido de `calculations/`, sus servicios y los 14 handlers financieros/catálogos restantes; autorización, Prisma, Supabase, operaciones y recuperación HTTP tipados. Los consumidores JSX validan las respuestas mediante una frontera local; sus interiores corresponden a fase 6. Mi dinero importa directamente los cálculos tipados y se retiró `legacyCalculations.ts`. Los tres archivos vacíos de cálculos siguen inventariados, sin contarlos como migrados. Sin cambios de esquema, SQL ni protocolo.

### Fase 5 — Captura Android, Calendar y offline

Dividir esta fase en tres lotes independientes y verificados secuencialmente.

- [x] **Captura:** migrar protocolo, parsers, políticas, revisión, conciliación y endpoints `captures`. Modelar estados y resoluciones con variantes explícitas. Conservar contrato Android v1, formato de credenciales, fechas de recepción/operación, reglas de activación y prioridad Wallet/respaldo.
- [x] **Calendar:** migrar OAuth, configuración, eventos y sincronización de [src/lib/calendar/](../src/lib/calendar/). Mantener identificadores deterministas, contenido cifrado, locks, cuotas, revisiones y desconexión. El cifrado existente y las credenciales guardadas deben seguir siendo legibles.
- [x] **Offline:** convertir [offlineExpenses.ts](../src/lib/offlineExpenses.ts), operaciones y consumidores con fixtures de datos ya guardados. Conservar nombre y estructura de IndexedDB, UUID, propietarios, recibos y recuperación entre pestañas. Renombrar a TypeScript no debe cambiar la versión de la BD local.
- [x] Actualizar pruebas, referencias y transformaciones del servidor offline. Mantener `public/sw.js` como recurso JavaScript servido directamente; comprobar su exclusión de `/api/`.

**Aceptación:** contrato de captura compatible con la APK existente, sin necesidad de una actualización nativa por este cambio; pruebas de eventos repetidos, pausa/revocación y conciliación correctas. Calendar con Google simulado conserva OAuth, identificadores y comportamiento de reintento. Una cola creada con el formato anterior se recupera y sincroniza una sola vez, incluyendo respuesta perdida y cambio de cuenta.

**Entrega:** [implementación, compatibilidad y evidencias de fase 5](../artifacts/typescript-migration/phase-5/README.md). Migrados 53 módulos, incluidos los 16 handlers restantes. Se conservan Android v1, credenciales, prioridad Wallet/respaldo, cifrado Calendar v1 y estructura/versión 1 de IndexedDB. El observador de pendientes de Gastos está tipado; el interior de la pantalla JSX sigue en fase 6. Verificación secuencial de los tres lotes, con PostgreSQL local y pruebas de recuperación en dos pestañas. Sin cambios de esquema, SQL, dependencias ni publicación.

### Fase 6 — Interfaz, hooks y páginas restantes

- [x] Migrar los hooks y componentes de cada pantalla junto con sus contratos de API. Separar tipos de carga, error, vacío y contenido cuando represente estados reales distintos.
- [x] Convertir componentes compartidos de UI conforme los necesiten esos flujos; tipar props, refs y eventos con las APIs reales de React, Radix/Base UI, TanStack y Recharts.
- [x] Descomponer componentes grandes solo cuando sea necesario para aislar un contrato o responsabilidad. Mantener la extracción y la conversión revisables; evitar mezclar rediseño, cambios de filtros o nuevas reglas financieras.
- [x] Convertir páginas/layout y revisar límites cliente/servidor. Los tipos compartidos no deben arrastrar Prisma, credenciales ni módulos de Node al bundle del cliente.
- [x] Ajustar `components.json` a `tsx: true` al iniciar nuevas incorporaciones de UI en TSX. Conservar el estilo, componentes y alias locales; no reinstalar masivamente shadcn.
- [x] Actualizar fixtures y cualquier herramienta que identifique componentes por extensión o archivo.

**Aceptación:** recorridos principales de cada módulo correctos con datos ficticios; mismas rutas, formularios, tablas, filtros, borradores y recuperación. Revisión móvil/escritorio, teclado y foco en los componentes afectados. Sin imports de servidor en cliente ni errores de hidratación introducidos.

**Entrega:** [implementación, contratos y evidencias de fase 6](../artifacts/typescript-migration/phase-6/README.md). Convertidos 135 módulos con contenido (20 881 líneas de origen): todas las páginas/layout restantes, hooks, pantallas y componentes compartidos. Props, refs, eventos, formularios, tablas y gráficas usan sus APIs reales. El cliente valida los contratos JSON dentro de la recuperación HTTP y devuelve el cuerpo original; conserva propuestas parciales, historial nulo y campos omitidos. `components.json` habilita TSX sin reinstalar UI. Los 14 archivos vacíos, `allowJs`, los adaptadores de Mi dinero y los fallbacks de pruebas se reservan para fase 7. Sin cambios de esquema, SQL, dependencias ni publicación.

### Fase 7 — Cerrar la transición

- [x] Confirmar que el código activo de `src/` está migrado y retirar los adaptadores y fallbacks de extensión temporales. Resolver los archivos vacíos explícitamente, sin usarlos para inflar el avance.
- [x] Desactivar `allowJs` para la aplicación cuando ya no importe código propio JS. Si una excepción es necesaria, mantenerla acotada, documentada y fuera del criterio de «migración completa» hasta resolverla.
- [x] Revisar interfaces públicas y entradas externas: sin `any` implícito, `@ts-ignore`, `@ts-nocheck`, dobles conversiones de tipo ni declaraciones globales que oculten módulos pendientes. Las conversiones justificadas deben ser locales y comprobables.
- [x] Confirmar que ninguna configuración de build usa `ignoreBuildErrors` ni reglas menos estrictas que la comprobación obligatoria.
- [x] Ejecutar la validación completa desde instalación limpia, incluyendo integraciones y `db:verify`. Verificar que `schema.prisma`, SQL y checksums de migraciones permanecen iguales.
- [x] Actualizar README, convenciones y [bitácora](bitacora.md) con lo efectivamente implementado, los comandos finales y las excepciones de herramientas que permanezcan en JS/CJS.

**Aceptación final:** código activo web verificado, contratos y pruebas conservados, build reproducible y sin cambios funcionales no previstos. El porcentaje de archivos renombrados por sí solo no acredita el cierre.

**Entrega:** [cierre, auditoría y reproducción de fase 7](../artifacts/typescript-migration/phase-7/README.md). Los 275 módulos TS/TSX de `src/` están incluidos en la comprobación estricta, con `allowJs: false`. Retirados los adaptadores de UI, el wrapper de transferencia y el cliente financiero temporal sin consumidores; los 14 archivos vacíos se eliminaron sin contarlos como migraciones. El cargador exige la extensión exacta cuando se declara. Instalación limpia, contratos, lint, 854 pruebas con PostgreSQL sin omisiones, build, reconstrucción/actualización de BD y las 12 respuestas de referencia correctos. Las herramientas JS/CJS, configuraciones, `public/sw.js` y Android quedan fuera del alcance web, como estaba previsto. Sin cambios de esquema, SQL, dependencias ni publicación.

## Validación y seguimiento por lote

Los siguientes comandos son obligatorios por lote desde la fase 1. `typecheck` y `test:types` generan Prisma y los tipos de Next antes de comprobar sus respectivos programas:

```bash
pnpm typecheck
pnpm test:types
pnpm lint
pnpm test
pnpm build
```

Durante el desarrollo, ejecutar primero las pruebas de los módulos tocados. Al cerrar un lote, comprobar la suite y build del estado final; ampliar o repetir solo ante cambios, fallos o riesgos pendientes. `pnpm test` sin `AFP_TEST_DATABASE_URL` no acredita integraciones: usar una base `afp_test…` local migrada según el [README](../README.md#integraciones-con-postgresql). Auth y Google simulados no equivalen a una aceptación real de los proveedores.

Ejecutar `pnpm db:verify` en la referencia inicial, al cambiar las herramientas que lo afectan, si cambian garantías de persistencia y en el cierre final. Conservar únicamente datos ficticios en las evidencias públicas.

Registrar en `artifacts/typescript-migration/` al ejecutar el trabajo:

- Commit y alcance del lote, contratos migrados y fronteras que siguen en JavaScript.
- Comandos, resultados y omisiones con su motivo; comparación con la referencia y tiempos de comprobación.
- Diferencias funcionales encontradas y su resolución. Un defecto descubierto se separa de la conversión para no alterar silenciosamente el comportamiento.
- Limitaciones de verificación, adaptadores temporales y condición concreta para retirarlos.

## Reversión y publicación

Mantener lotes pequeños que puedan revertirse junto con sus imports, pruebas y configuración. No usar renombres masivos mientras existan consumidores pendientes. La ausencia de cambios de esquema y formatos persistidos permite volver al código anterior sin una migración inversa de datos.

Si el piloto exige cambios incompatibles de respuesta, formatos de cola, huellas o registros, reducir el alcance y tratar esos cambios como una tarea distinta antes de continuar. No resolverlos borrando datos, pendientes offline o recibos.

Cada lote puede prepararse y validarse sin publicarlo. Cuando se autorice un despliegue, aplicar el procedimiento existente: comprobar esquema compatible, compilación, rutas y flujos afectados, y conservar una versión previa compatible para reversión. No aplicar migraciones de BD ni activar automatizaciones como parte de cambiar el lenguaje.

## Primera entrega y criterio para continuar

La primera entrega útil comprende **fases 0–2**: referencia reproducible, infraestructura compatible y transferencias tipadas de extremo a extremo. Debe permitir revisar un flujo real sin convertir toda la aplicación.

Continuar cuando ese flujo conserva comportamiento y pruebas, la comprobación de tipos detecta los errores de contrato previstos y las fronteras temporales están acotadas. Estimar duración y tamaño del resto de lotes a partir de esa experiencia; este plan no asigna un calendario sin haber medido el piloto.
