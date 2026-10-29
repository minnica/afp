# AFP — Control de gastos y finanzas personales

Aplicación personal para registrar gastos, ingresos, tarjetas, compras a meses, suscripciones y deudas, y proyectar la disponibilidad de dinero. La interfaz está en español, trabaja en MXN y utiliza modo oscuro.

El repositorio contiene una aplicación web Next.js instalable como PWA y una aplicación Android complementaria para capturar notificaciones y abrir la web mediante Trusted Web Activity (TWA). Los saldos parten de referencias bancarias capturadas y movimientos registrados en AFP; no existe una conexión directa con los bancos.

**Origen de producción configurado:** `https://finanzas.garatachia.com`.

Este README describe el funcionamiento y los procedimientos del código versionado. La [bitácora del proyecto](docs/bitacora.md) resume decisiones, cambios, migraciones e incidencias; sus evidencias están en [artifacts/](artifacts/). Los registros históricos no acreditan por sí solos el estado actual de producción.

## Contenido

- [Módulos](#módulos)
- [Stack y estructura](#stack-y-estructura)
- [Desarrollo local](#desarrollo-local)
- [Comandos y pruebas](#comandos-y-pruebas)
- [Base de datos](#base-de-datos)
- [API y autorización](#api-y-autorización)
- [Reglas financieras](#reglas-financieras)
- [PWA y captura sin conexión](#pwa-y-captura-sin-conexión)
- [Captura automática Android](#captura-automática-android)
- [Google Calendar](#google-calendar)
- [Convenciones de desarrollo](#convenciones-de-desarrollo)
- [Despliegue](#despliegue)
- [Documentación relacionada](#documentación-relacionada)

## Módulos

`/` redirige a `/dashboard`; el inicio de sesión y el manifest de la PWA también usan esa ruta como entrada. La navegación compartida se define en [src/lib/navigation.tsx](src/lib/navigation.tsx).

| Ruta | Función |
| --- | --- |
| `/dashboard` | Avisos importantes, consumo mínimo y pagos de tarjetas del período |
| `/mi-dinero` | Cuentas, movimientos, rendimientos, presupuestos y proyección de liquidez |
| `/gastos` | Gastos en efectivo, crédito o débito; captura sin conexión y cobros de suscripciones |
| `/registro-automatico` | Revisión de avisos, gastos, pagos, devoluciones, transferencias y retiros; ajustes del teléfono y reglas |
| `/analisis` | Comparativos por semanas, tarjetas y categorías |
| `/compras-a-meses` | Compras a meses, cuotas y referencias de estados de cuenta |
| `/suscripciones` | Recurrencia, método de pago y estado de suscripciones |
| `/ingresos` | Ingresos y cobros vinculados a cuentas por cobrar |
| `/cuentas-por-cobrar` | Deudas a favor, pagos recibidos y conciliaciones de saldo |
| `/cuentas-por-pagar` | Deudas propias y préstamos, incluidos reembolsos de terceros |
| `/tarjetas` | Administración de tarjetas, ciclos, estados de cuenta y pagos |
| `/credito-y-deuda` | Límites, deuda estimada y crédito disponible |
| `/configuracion` | Categorías, personas, tipos de ingreso y conexión con Google Calendar |
| `/login` | Inicio de sesión y registro mediante Supabase Auth |
| `/acerca`, `/privacidad` | Información pública de la aplicación |

## Stack y estructura

| Área | Implementación |
| --- | --- |
| Web | Next.js 16.3.8, App Router y React 19.2.4 |
| Lenguaje | Código web activo en TypeScript/TSX, con comprobación estricta y `allowJs: false`. Alias `@/*` para `src/*` |
| UI | Componentes shadcn locales, Radix UI y Tailwind CSS 4; Base UI para el Combobox múltiple |
| Formularios | React Hook Form y Zod |
| Tablas y gráficas | TanStack Table 8 y Recharts 3 |
| Autenticación | Supabase Auth |
| Persistencia | PostgreSQL en Supabase, Prisma 7 y `@prisma/adapter-pg` |
| PWA | Manifest y service worker propios; IndexedDB para la cola de gastos |
| Android | Kotlin, Compose, Room, WorkManager, Android Keystore y TWA |

Las versiones exactas y los scripts están en [package.json](package.json) y [pnpm-lock.yaml](pnpm-lock.yaml). Instalar también las dependencias de desarrollo para compilar: Tailwind, shadcn y las herramientas de build las necesitan.

```text
src/app/                 Páginas, layout y API Route Handlers
src/components/          Interfaz agrupada por módulo; ui/ contiene los componentes compartidos
src/hooks/               Sesión/carga de vistas, borradores y comportamiento de interfaz
src/lib/calculations/    Cálculos de ciclos, MSI, suscripciones, deudas y dashboard
src/lib/money/           Cuentas, previsiones, presupuestos y rendimientos
src/lib/calendar/        OAuth, generación de eventos y sincronización con Google
src/lib/capture*.ts      Recepción, interpretación, revisión y automatización de avisos
src/lib/offlineExpenses.ts  Cola de gastos por usuario en IndexedDB
prisma/                  Esquema e historial de migraciones SQL
public/                  Manifest, service worker, iconos y Digital Asset Links
android/                 Aplicación nativa, pruebas y herramientas de diagnóstico
scripts/                 Verificación de BD, tareas programadas y generación de recursos
tests/                   Pruebas Node.js, integraciones y fixtures ficticios
docs/                    Guías técnicas
artifacts/               Informes y evidencias de verificaciones anteriores
```

## Desarrollo local

### Requisitos

- Node.js **22.23.2**, versión utilizada en el entorno del proyecto.
- pnpm **10.33.0**, fijado en `packageManager`; conservar el lockfile y no generar otro con npm.
- Un entorno de Supabase Auth y PostgreSQL para desarrollo. Las pruebas de integración usan PostgreSQL local desechable.
- Para aplicar el historial completo, el rol de migraciones necesita administrar event triggers: superusuario en PostgreSQL local o el rol habilitado para ello en Supabase.

### Variables de entorno

Crear `.env` en la raíz **antes de instalar dependencias**, porque `postinstall` ejecuta `prisma generate` y carga la configuración de Prisma. Completar estos valores para el mismo entorno de desarrollo:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
DIRECT_URL=
```

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase utilizado para Auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase; nunca colocar una clave de servicio aquí |
| `DATABASE_URL` | Conexión PostgreSQL de la aplicación, utilizada por [src/lib/prisma.ts](src/lib/prisma.ts) |
| `DIRECT_URL` | Conexión PostgreSQL para la CLI de Prisma y migraciones, definida en [prisma.config.ts](prisma.config.ts) |

Next.js también carga `.env.local`. La CLI de Prisma usa `dotenv/config`, que carga `.env`; no asumir que leerá `.env.local`. Si se guarda allí una variable de la CLI, cargarla explícitamente en el entorno del proceso. Las dos conexiones PostgreSQL deben apuntar a la misma base del entorno elegido.

Los archivos `.env*`, estados de cuenta, respaldos y firmas Android están excluidos de Git. Las variables `NEXT_PUBLIC_*` son visibles en el cliente; las conexiones, secretos de cron y credenciales de Google son exclusivamente de servidor.

### Instalar y arrancar

Desde la raíz, con las conexiones de desarrollo configuradas:

```bash
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm dev
```

Abrir `http://localhost:3000`. Configurar en Supabase Auth las URL de sitio y redirección del entorno local. Crear una cuenta desde `/login` o utilizar una existente de ese entorno; confirmar el correo si Auth lo exige. Al iniciar sesión, `POST /api/setup-user` prepara el usuario y los catálogos iniciales de categorías y tipos de ingreso.

En Chrome del emulador Android, usar `http://10.0.2.2:3000`. [next.config.mjs](next.config.mjs) permite ese origen de desarrollo. La sesión del emulador pertenece a ese origen y requiere su propio inicio de sesión.

## Comandos y pruebas

| Comando | Propósito |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo en el puerto 3000 |
| `pnpm build` | Generar Prisma Client y compilar la web para producción |
| `pnpm start` | Servir una compilación previa |
| `pnpm typecheck` | Generar Prisma y tipos de Next; comprobar TypeScript sin emitir archivos |
| `pnpm typecheck:tests` | Comprobar estrictamente pruebas, helpers y ejecutor migrados a TypeScript |
| `pnpm test:types` | Comprobar contratos de tipos y casos negativos con la configuración estricta |
| `pnpm lint` | Ejecutar ESLint; reglas de seguridad de tipos en TS/TSX |
| `pnpm test` | Suite TypeScript con `node:test`, tsx y `--experimental-test-isolation=none` |
| `pnpm db:verify` | Verificar reconstrucción, actualización, RLS y regresiones en PostgreSQL desechable |
| `pnpm db:audit-history` | Comparar nombres y checksums de migraciones contra una BD explícita, en solo lectura |
| `pnpm audit:prod` / `pnpm audit:all` | Auditar dependencias de producción o del árbol completo |
| `pnpm icons:generate` | Regenerar iconos PNG/ICO desde `public/icons/app-icon.svg` |

Las verificaciones obligatorias por lote son `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types`, `pnpm lint`, `pnpm test` y `pnpm build`. El build conserva la comprobación de TypeScript. Los tres comandos de tipos generan sus prerrequisitos y funcionan sin una carpeta `.next` previa. Los clientes tipados validan las respuestas antes de entregarlas a las pantallas y conservan el JSON original, incluidos orden, campos omitidos y metadatos usados en recuperación y concurrencia. Los casos de tipos viven en `tests/types/`, con [configuración propia](tsconfig.type-tests.json).

La [migración de pruebas a TypeScript](docs/plan-migracion-tests-typescript.md) tiene completadas las fases 0–6; el [cierre final](artifacts/typescript-tests-migration/phase-6/README.md) verifica los 117 archivos originales. La [referencia](artifacts/typescript-tests-migration/phase-0/README.md) conserva 106 pruebas, 11 helpers y 854 escenarios. Las fases [1](artifacts/typescript-tests-migration/phase-1/README.md) y [2](artifacts/typescript-tests-migration/phase-2/README.md) incorporaron ejecución mixta, tsx fijado, cargador tipado y piloto de transferencias. La [fase 3](artifacts/typescript-tests-migration/phase-3/README.md) convierte 52 pruebas financieras y los helpers de contexto de rutas y persistencia de deudas. La [fase 4](artifacts/typescript-tests-migration/phase-4/README.md) convierte las 50 pruebas restantes de Captura, Calendar, Auth/HTTP, recuperación y offline, incluidos los dos contextos `vm` del service worker. Los contratos públicos se derivan de los módulos reales; las rutas dinámicas siguen devolviendo `unknown`. Los adaptadores de pruebas conservan las proyecciones parciales, el JSON original y los fallos transaccionales, con fronteras explícitas para datos deliberadamente inválidos.

El cierre de la migración conserva los 854 escenarios originales y añade diecisiete de infraestructura: 871 en total, comprobados con PostgreSQL local sin omisiones. Las 109 pruebas ejecutables de ese cierre y todos los helpers activos usan TS. La [fase 5](artifacts/typescript-tests-migration/phase-5/README.md) convierte los siete helpers restantes de navegador, seeds y preparación de Next; comparte la validación de PostgreSQL desechable y el cierre de recursos. Añade tres regresiones de aislamiento/configuración y seis casos negativos de tipos. La fase 6 retira los puentes: web y pruebas usan `allowJs: false`, con 131 módulos activos de pruebas/helpers/ejecutor incluidos en TypeScript y ESLint. Los trece archivos de contratos negativos permanecen separados. La auditoría documenta las conversiones locales y confirma los contratos públicos derivados de 97 módulos reales; las rutas dinámicas siguen devolviendo `unknown`. Los tres scripts CJS externos al alcance tienen declaraciones específicas adyacentes `.d.cts`, comprobadas por TypeScript y ESLint.

La suite actual tiene **934 escenarios correctos, sin omisiones con PostgreSQL local**: los 923 del cierre de A08 y once escenarios A09 de concurrencia en lecturas de Gastos. [Resultados A04](artifacts/auditoria-2026-10-15/a04-2026-10-29/README.md) · [Resultados A07](artifacts/auditoria-2026-10-15/a07-2026-10-29/README.md) · [Resultados A08](artifacts/auditoria-2026-10-15/a08-2026-10-29/README.md) · [Resultados y límites del cierre local de A09](artifacts/auditoria-2026-10-15/a09-2026-10-29/README.md).

[tests/run-tests.ts](tests/run-tests.ts) comparte descubrimiento y ejecución entre `pnpm test` y las regresiones de `db:verify`: solo archivos `.test.ts` del primer nivel, ordenados. Rechaza entradas `.test.cjs`/`.test.js`/`.test.mjs`/`.test.jsx`, incluso al seleccionar otra prueba, y detecta nombres base duplicados. Los contratos negativos, helpers y seeds no se ejecutan por descubrimiento. Sin argumentos se ejecuta la suite completa; la selección exacta sirve para desarrollo y falla ante archivos inexistentes, repetidos o ajenos a la suite:

```bash
pnpm test latest-request.test.ts source-loader.test.ts
pnpm test --list
```

`--list` muestra la selección sin ejecutarla. Para obtener únicamente el JSON, usar `node --import tsx tests/run-tests.ts --list`. No se admiten filtros por nombre ni opciones arbitrarias de Node en este comando; los cierres se validan con `pnpm test` sin selección y PostgreSQL migrado.

Todos los servidores y seeds usan `node --import tsx`. El fixture offline se inicia sin conexión de BD:

```bash
node --import tsx tests/helpers/offline-browser-server.ts
```

Sirve módulos ESM en `http://127.0.0.1:4192` con API ficticia en memoria. Para los fixtures Next, usar una BD local desechable migrada conforme a la sección siguiente:

```bash
AFP_TEST_DATABASE_URL='<conexión-local-afp_test>' node --import tsx tests/helpers/seed-ui.ts
AFP_TEST_DATABASE_URL='<conexión-local-afp_test>' AFP_CAPTURE_TEST_PRODUCTION=1 \
  AFP_UI_TEST_REAL_SETTINGS=1 AFP_CAPTURE_TEST_REAL_DASHBOARD=1 \
  node --import tsx tests/helpers/money-browser-server.ts

AFP_TEST_DATABASE_URL='<conexión-local-afp_test>' node --import tsx tests/helpers/seed-capture-review.ts
AFP_TEST_DATABASE_URL='<conexión-local-afp_test>' AFP_CAPTURE_TEST_PRODUCTION=1 \
  AFP_CAPTURE_TEST_REAL_DASHBOARD=1 node --import tsx tests/helpers/capture-browser-server.ts
```

Mi dinero usa el puerto 4216 (`AFP_UI_TEST_PORT` permite cambiarlo); Captura usa 4208. El acceso es ficticio: `money-qa@example.test` o `capture-qa@example.test`, con una contraseña inventada de al menos seis caracteres. Las API financieras y PostgreSQL son reales dentro del fixture. `SIGINT`/`SIGTERM` cierran servidores y conexiones y eliminan la copia temporal; los datos sembrados permanecen hasta eliminar la BD desechable. No se copian `.env`, configuraciones de pruebas ni tipos Next generados en otra compilación.

El tercer seed se ejecuta en una BD local recién migrada con `node --import tsx tests/helpers/seed-receiver-payments.ts` y `AFP_TEST_DATABASE_URL`. Crea tarjetas, cortes, reglas en observación y una credencial ficticia en `/tmp/afp-receiver-browser-context.json` con permisos `0600`; `AFP_RECEIVER_TEST_CONTEXT` permite elegir un archivo temporal propio. Eliminarlo al terminar. Los recolectores de fases cerradas conservan sus logs y snapshots y se reproducen en los commits indicados en la [evidencia de cierre](artifacts/typescript-tests-migration/phase-6/README.md#reproducción).

Si se necesita comprobar la compilación con Webpack, usar `pnpm exec prisma generate` seguido de `pnpm exec next build --webpack`. Esta alternativa no cambia el script de build del proyecto.

### Integraciones con PostgreSQL

Sin `AFP_TEST_DATABASE_URL`, `pnpm test` omite las pruebas que requieren PostgreSQL. Una suite con omisiones no valida las transacciones, bloqueos y restricciones contra una base real.

Para ejecutar todas las pruebas, usar una base **desechable** en `localhost` o `127.0.0.1`, con nombre que comience por `afp_test` y sin parámetros adicionales en la URL. Por ejemplo, con Podman:

```bash
podman run --rm -d --name afp-test-postgres \
  -e POSTGRES_PASSWORD=afp_test_only -e POSTGRES_DB=afp_test \
  -p 127.0.0.1:55441:5432 docker.io/library/postgres:16-alpine

# Esperar a que pg_isready indique que PostgreSQL acepta conexiones.
podman exec afp-test-postgres pg_isready -U postgres -d afp_test

# Esta conexión apunta únicamente al contenedor de prueba.
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test \
  pnpm exec prisma migrate deploy

AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test \
  pnpm test

# Reconstrucción desde cero y actualización desde el historial anterior.
AFP_MIGRATION_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test \
  pnpm db:verify

podman stop afp-test-postgres
```

`db:verify` crea dos bases y roles temporales y los elimina al terminar; requiere permisos para hacerlo. Comprueba migraciones, checksums, estructura, conservación de registros, RLS y regresiones. Las pruebas usan datos ficticios y Auth simulada; la integración de Calendar también simula Google. No sustituyen una verificación autenticada de los servicios reales.

<a id="dependencias-y-seguridad-a10"></a>

### Dependencias pendientes de revisión

La [auditoría registrada el 27 de octubre de 2026](artifacts/mi-dinero/presupuesto-diario/dependency-audit.json) dejó hallazgos pendientes, incluidos críticos en dependencias de producción. Ese archivo es evidencia histórica: repetir `pnpm audit:prod` y `pnpm audit:all` antes de publicar y evaluar los resultados actuales. Una compilación correcta no acredita que las dependencias estén libres de avisos.

## Base de datos

[prisma/schema.prisma](prisma/schema.prisma) define modelos, relaciones y enums. [prisma/migrations/](prisma/migrations/) añade el historial reproducible, restricciones SQL, RLS y triggers que el esquema Prisma no representa por completo.

| Área | Modelos principales |
| --- | --- |
| Identidad y catálogos | `User`, `Category`, `Person`, `IncomeType` |
| Operaciones financieras | `DailyExpense`, `Income`, `InstallmentPurchase`, `Subscription`, `SubscriptionCharge`, `ReceivableAccount`, `PayableAccount` |
| Crédito | `Card`, `CardCycle`, `CardCyclePayment`, `CardCycleCredit` |
| Liquidez | `MoneyAccount`, `MoneyReconciliation`, `MoneyRoute`, `MoneyPlan`, `MoneyOccurrence`, `MoneyTransfer`, `MoneyWithdrawal`, `MoneyCardPayment`, `MoneyOperation` |
| Captura | Dispositivos, vinculaciones, eventos, alias, reglas, movimientos y conciliaciones `Capture*`; `ExpenseRefund` y `ExpenseTombstone` |
| Soporte | `ExpenseOperation`, `NoticeDismissal`, `GoogleCalendarConnection`, `CalendarOAuthState`, `GoogleCalendarEvent` |

<a id="reconstrucción-de-la-bd-desde-git-a11"></a>

### Migraciones y auditoría

- Inicializar y actualizar mediante `pnpm exec prisma migrate deploy`; regenerar el cliente con `pnpm exec prisma generate` tras cambiar el esquema.
- No usar `migrate reset` ni `db push` en ambientes compartidos o productivos. Un diff desde vacío no sustituye el historial SQL.
- No editar SQL ni checksums de migraciones aplicadas; versionar los cambios en migraciones nuevas. Cada tabla nueva debe declarar RLS explícitamente.
- Antes de una migración compartida, revisar su alcance aditivo o destructivo, respaldo, historial y diferencias de esquema; aplicar con autorización del propietario y verificar después. `migrate deploy` no demuestra ausencia de drift, y el diff de Prisma no comprueba RLS.
- `pnpm db:audit-history` exige `AFP_MIGRATION_AUDIT_DATABASE_URL` explícita y no carga conexiones desde `.env`. Devuelve `0` si el historial coincide, `2` si solo faltan migraciones y `1` ante inconsistencias.

Las migraciones reconstruyen el esquema público de AFP; no restauran usuarios de Supabase Auth, datos personales, configuración del proveedor ni secretos.

## API y autorización

Los handlers están en [src/app/api/](src/app/api/). Las rutas financieras exigen `Authorization: Bearer <access_token>` de Supabase. [apiAuth.ts](src/lib/apiAuth.ts) valida la identidad antes de acceder a los datos; el propietario no se toma del cuerpo ni de la URL.

- Consultas, escrituras y referencias vinculadas se limitan al usuario autenticado. Un ID ajeno o inexistente devuelve `404`.
- Sin sesión válida se responde `401`; un fallo temporal de Supabase Auth devuelve `503` para permitir reintentar.
- Las respuestas privadas usan `Cache-Control: private, no-store` y `Vary: Authorization`. RLS no sustituye la autorización del servidor.
- El cliente usa [apiFetch.ts](src/lib/apiFetch.ts) para enviar el token vigente y comprobar la cuenta esperada. El diálogo compartido de recuperación conserva borradores y distingue errores de validación, sesión y conexión.
- Un alta sin garantía idempotente no se reenvía automáticamente cuando se desconoce si se guardó. Si el guardado terminó y solo falló la recarga, se reintenta la lectura.

### Validación de entradas manuales

[financialValidation.ts](src/lib/financialValidation.ts) comparte la validación de días bancarios reales e importes con hasta dos decimales y valor absoluto máximo de **$9,999,999,999.99**. Las fechas usan `YYYY-MM-DD`: `2024-02-29` es válida; `2026-02-30` se rechaza sin convertirla a marzo. Los importes admiten números JSON o cadenas decimales; las cadenas con comas, espacios o notación científica se rechazan. No se redondea una entrada como `10.123` para aceptarla.

[financialContracts.ts](src/lib/financialContracts.ts) aplica estas comprobaciones a Gastos, Ingresos, deudas, MSI, suscripciones y ciclos; nombre, concepto y fuente presentes deben tener contenido después de `trim`. Tarjetas y catálogos usan también este contrato. Mi dinero, saldos y la revisión/conciliación de Captura reutilizan las mismas comprobaciones básicas. El contrato financiero devuelve `400` con un mensaje en español ante entradas inválidas. Cada operación conserva sus reglas de obligatoriedad, signo, cero, campos opcionales y fechas futuras; desactivar una suscripción admite además el instante ISO que envía la interfaz.

La validación del cuerpo financiero conserva sus valores, campos adicionales y orden; el `trim` para persistir ocurre después. No altera el contenido usado por los recibos idempotentes. No se modifican registros históricos ni se requiere una migración de BD. [Regresiones A08](tests/financial-validation.test.ts).

### Rutas financieras

| Ruta | Métodos |
| --- | --- |
| `/api/expenses` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/gastos/bootstrap` | `GET` |
| `/api/cards` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/card-cycles` | `GET`, `POST`, `PATCH` |
| `/api/incomes` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/money` | `GET`, `POST` |
| `/api/installment-purchases` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/subscriptions` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/subscription-charges` | `GET`, `POST` |
| `/api/receivables` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/payables` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/dashboard` | `GET` |
| `/api/notice-dismissals` | `GET`, `POST`, `DELETE` |
| `/api/settings` | `GET`, `POST`, `DELETE` |
| `/api/setup-user` | `POST` |

### Captura e integraciones

| Ruta | Métodos | Autenticación |
| --- | --- | --- |
| `/api/captures/pairings` | `POST`, `PATCH` | Inicio público limitado; autorización con Bearer Supabase |
| `/api/captures/devices` | `GET`, `PATCH` | Bearer Supabase |
| `/api/captures/device` | `GET`, `POST`, `DELETE` | Credencial `Capture` del propio dispositivo |
| `/api/captures/events` | `POST` | `Capture` activa |
| `/api/captures/notices` | `GET` | `Capture` activa |
| `/api/captures/payment-receipts` | `GET`, `POST` | `Capture` activa |
| `/api/captures/configuration` | `GET`, `PATCH` | Bearer Supabase |
| `/api/captures/movements` | `GET`, `PATCH` | Bearer Supabase |
| `/api/captures/reconciliation` | `GET`, `PATCH` | Bearer Supabase |
| `/api/calendar/google` | `GET`, `PATCH` | Bearer Supabase |
| `/api/calendar/google/connect`, `/sync`, `/disconnect`¹ | `POST` | Bearer Supabase |
| `/api/calendar/google/callback` | `GET` | Estado OAuth y cookie de un solo uso |
| `/api/cron/calendar-sync` | `GET` | Bearer con `CRON_SECRET` |
| `/api/cron/capture-bank-fallback` | `POST` | Bearer con `CRON_SECRET` |

¹ Las tres rutas comparten el prefijo `/api/calendar/google`. La credencial nativa `Capture` es independiente de Supabase y no autoriza las API financieras generales.

## Reglas financieras

Los cálculos compartidos viven en [src/lib/calculations/](src/lib/calculations/), [src/lib/money/](src/lib/money/) y sus pruebas. Mantener estas distinciones al modificar el proyecto:

- **Día financiero y vencimientos:** usar [financialDates.ts](src/lib/financialDates.ts). “Hoy”, los avisos y los estados de corte corresponden a `America/Mexico_City`, independientemente de la zona del servidor o navegador. Una fecha bancaria conserva el día UTC almacenado, sin desplazarlo a México: vence al terminar ese día en México. Un pago parcial mantiene su pendiente; cero o liquidado no vence. Dashboard envía `clientDate` como día México `YYYY-MM-DD` validado; sin ese parámetro la API deriva el mismo día del reloj. La actualización diaria se programa a medianoche México.
- **Importes y períodos:** sumar a centavos; distinguir mes calendario de mes de corte. Un estado de cuenta capturado, incluido cero, prevalece sobre una estimación. Conservar la fecha y el origen de cada referencia bancaria.
- **Métodos de pago:** `CASH`, `CARD` y `DEBIT`. Un gasto con débito exige `debitAccountId` y descuenta de esa cuenta. Suscripciones mantiene efectivo o crédito.
- **Suscripciones:** un gasto confirmado sustituye la previsión de su ocurrencia, sin duplicarla. Confirmar, omitir o restaurar afecta ese mes; ajustar importe, fecha o método no cambia la recurrencia. Respetar frecuencia, inicio y desactivación.
- **Compras a meses:** la cuota se deriva del corte y la fecha de compra; `initialPaymentsMade` no fija la cuota actual. Las referencias verificadas de `statementReconciliations` prevalecen para sus cortes; los demás importes siguen siendo estimaciones.
- **Gastos compartidos:** `cashContributionAmount` reduce la parte personal, pero conserva el cargo bancario completo. No crea un ingreso ni se combina con una cuenta por cobrar/pagar vinculada al mismo gasto.
- **Deudas y préstamos:** recalcular saldo y estado al editar o borrar abonos. Un ajuste de saldo de una cuenta por cobrar no representa un ingreso. El reembolso de un tercero no amortiza nuevamente el préstamo bancario; separar capital, intereses y saldo conciliado.
- **Consumo mínimo:** los movimientos previstos no acreditan consumo confirmado; conservar períodos y condiciones por tarjeta y la evidencia de conciliación.
- **Atomicidad e idempotencia:** las escrituras relacionadas se confirman en una transacción. Gastos y Mi dinero conservan recibos por usuario/UUID; repetir el UUID con otro contenido genera conflicto. No asumir que toda mutación tiene esta garantía.

### Lecturas de Gastos

[expenseReader.ts](src/lib/expenseReader.ts) mantiene una lectura vigente por propietario y URL de filtros. Cambiar la selección cancela e invalida la consulta anterior inmediatamente, antes del debounce de 250 ms. Solo la generación vigente puede actualizar filas, meses disponibles, error e indicador de carga, incluso si el transporte termina después de cancelarse. Durante la espera se muestra el esqueleto de resultados.

Las recargas tras guardar, editar, borrar o sincronizar pendientes usan los filtros vigentes al terminar la operación; una recarga forzada sustituye también otra lectura de la misma URL. La carga inicial y su respaldo offline solo aportan filas a su selección original y no sustituyen una consulta posterior. Salir de la pantalla cancela las lecturas y la carga inicial. La API y las garantías de escritura se conservan. [Regresiones A09](tests/expense-reader.test.ts).

### Historial de ingresos

Ingresos permite recorrer todo el historial desde escritorio y móvil, buscar por concepto, fuente, notas, tipo o cuenta por cobrar/persona, y filtrar por tipo y fechas inclusivas. El total y el conteo corresponden a **todos los ingresos filtrados**, aunque solo se muestre una página. Cambiar búsqueda, fechas, tipo, orden o tamaño de página vuelve a la primera página; las respuestas y errores de consultas sustituidas se descartan. Después de crear, editar o borrar se actualizan el listado y sus agregados; si desaparece la última página, se utiliza la última existente.

`GET /api/incomes` acepta `page` (desde 1), `pageSize` (1–100; predeterminado 100), `q` (hasta 200 caracteres), `incomeTypeId`, `startDate` y `endDate` (`YYYY-MM-DD` válidos), `sortBy` (`date`, `incomeType`, `concept`, `receivableAccount`, `amount`) y `sortDirection` (`asc`/`desc`). El orden predeterminado es fecha descendente, con desempate por creación e ID. La pantalla inicia con diez filas por página.

La respuesta conserva `incomes` y `total` y añade `totalCount`, `page`, `pageSize` y `pageCount`. Un conjunto vacío devuelve lista, conteo y total en cero, con página 1 de 1. Una página fuera de rango se ajusta a la última existente. Filas, conteo y suma Decimal se consultan en una transacción de lectura `RepeatableRead`, con los mismos filtros y propietario autenticado. Los parámetros inválidos devuelven 400; `userId` no sustituye la identidad de la sesión. [Regresiones A07](tests/income-history.test.ts).

<a id="tarjetas--saldo-y-liquidación-de-cortes-a03"></a>
<a id="tarjetas--devoluciones-posteriores-al-corte"></a>

### Tarjetas, pagos y devoluciones

El saldo pendiente de un corte se calcula como `max(estado de cuenta − devoluciones posteriores aplicadas − total pagado, 0)`. La fecha de pago o el estado persistido `PAID` no bastan para liquidarlo. Los pagos parciales conservan su pendiente y sus avisos.

**Registrar pago** en Tarjetas reemplaza el total acumulado. **Abonar a tarjeta** en Mi dinero y **Sumar este pago** en Registro automático añaden un abono individual. **Ya lo había registrado** vincula evidencia sin sumar dinero otra vez. No intercambiar esos contratos.

Las devoluciones posteriores aplicadas al pago de un corte conservan su referencia y reducen lo exigible sin modificar el estado original ni crear un ingreso. Las bonificaciones ya incluidas en los cargos no se descuentan otra vez del pago.

Crédito y deuda parte de una captura bancaria: `saldo estimado = saldo bancario + exposición actual − exposición inicial`. Una MSI nueva aumenta la exposición por su importe completo una sola vez; sus mensualidades no liberan crédito por sí solas. Los pagos reales sí lo reducen. Los saldos a favor de una tarjeta no compensan la deuda de otras.

### Mi dinero

1. Agregar cuentas y capturar saldo de referencia, fecha y reserva voluntaria. Una referencia de hoy incluye los movimientos ya registrados al capturarla; una anterior representa el cierre de ese día.
2. Asignar cuentas de entrada/salida por tipo de movimiento y corregir excepciones. Débito usa la cuenta explícita del gasto.
3. Configurar nómina neta, ingresos, gastos previstos y presupuestos por categoría. El pago esperado de una cuenta por cobrar se aplica **por fecha**, no se divide entre las fechas del mes.
4. Activar rendimientos con reglas fechadas, tasa o abono observado y calendario de acreditación. El abono real vinculado sustituye el cálculo de la misma cuenta/fecha; conciliar absorbe lo ya incluido en el saldo bancario.

La proyección abarca desde hoy hasta el cierre del duodécimo mes calendario. El desglose del mes seleccionado incluye el mes completo y distingue registrado, previsto y rendimiento calculado por AFP. Las lecturas y escenarios no crean ingresos ni gastos.

Las compras de crédito se pagan desde la cuenta al abonar la tarjeta; no retirar efectivo también al comprar. Las transferencias entre cuentas propias conservan el total. Los cobros pendientes son previsiones; los préstamos descontados de nómina ya están considerados en el ingreso neto salvo configuración expresa.

El presupuesto variable estima consumo diario dentro de su vigencia; no concentra el remanente mensual en los últimos días. El consumo personal del mismo día cubre esa previsión. Puede usar meses históricos para distribuir efectivo/débito y crédito, llevando este último al pago de su tarjeta. Los avisos de liquidez consideran el capital total y la suma de reservas de todas las cuentas, aun al filtrar una cuenta.

<a id="pwa--modo-offline"></a>

## PWA y captura sin conexión

El service worker se registra **solo en modo de producción**. Para probarlo localmente, ejecutar `pnpm build` y después `pnpm start`; `pnpm dev` retira el worker y sus cachés de shell.

- Abrir `/gastos` con conexión al menos una vez para guardar shell y datos iniciales. [public/sw.js](public/sw.js) excluye las rutas `/api/`; el respaldo de Gastos y su cola están separados por usuario.
- Cada gasto se confirma primero en IndexedDB con un UUID, incluso con conexión. Solo entonces se limpia el formulario y se intenta enviar.
- Al recuperar conexión se reintenta con el mismo `operationId`. Una respuesta perdida, un error o un cambio de cuenta conserva el pendiente; el recibo de servidor evita crear el gasto dos veces.
- El alcance offline es **crear gastos diarios**. Editar, borrar y operar otros módulos requiere conexión. Los pendientes solo existen en ese navegador/dispositivo hasta sincronizarse; borrar los datos del sitio los elimina.
- Al cambiar los iconos, regenerar recursos y actualizar sus referencias versionadas en manifest/layout y la versión de caché del worker.

## Captura automática Android

[android/](android/) contiene la APK complementaria. La configuración de versión, SDK y paquetes está en [android/app/build.gradle.kts](android/app/build.gradle.kts); la compilación, firma, instalación, diagnóstico y pruebas se explican en [docs/android-captura.md](docs/android-captura.md). Ese documento conserva antecedentes por fases; la revisión web actual está en `/registro-automatico`.

El teléfono se vincula mediante un código autorizado por la sesión web. Conserva una identidad revocable y una cola Room cifrada, y WorkManager entrega eventos con recibos idempotentes. La sesión de la TWA y la credencial nativa son independientes.

- La automatización exige formato validado, identificación inequívoca y reglas aceptadas por tarjeta o cuenta. Recibir un aviso no implica registrarlo como movimiento.
- **Registro automático** reúne pendientes e historial; sus ajustes administran teléfono, fuentes, alias y reglas. Las posibles coincidencias se resuelven en revisión: importe, comercio y hora por sí solos no prueban que dos avisos sean una misma compra.
- Wallet puede ser la fuente principal de compras. El respaldo bancario aceptado espera al menos 15 minutos y vuelve a comprobar coincidencias y permisos antes de registrar.
- Pagos por notificación o comprobante compartido conservan su evidencia y distinguen abono nuevo de pago ya incluido. Las transferencias y retiros usan sus registros propios en Mi dinero.
- La regla opcional de cargos genéricos BBVA puede registrar gastos con débito tras aceptación expresa. **Cambiar tipo de movimiento** permite corregirlos atómicamente a retiro, transferencia o pago de tarjeta.
- Los avisos importantes del teléfono usan el mismo día financiero de México que la web, aunque el dispositivo tenga otra zona horaria. El parámetro legado `timeZone` se valida, pero no cambia los vencimientos. Los avisos respetan sus preferencias y las ocultaciones mensuales del usuario. Su entrega depende también de permisos y restricciones de Android.

<a id="devoluciones-y-cancelaciones-de-compras--publicado-y-preparado-para-confirmar"></a>

**Devoluciones y cancelaciones de compras:** requieren confirmación personal del cargo e importe antes de aplicar el reembolso. Conservar el importe original, la evidencia y la posibilidad de deshacer; no deducir una devolución solo por coincidencia de importes.

<a id="avisos-de-uber-didi-viajes-y-uber-eats--publicado-y-activo"></a>

**Uber, DiDi viajes y Uber Eats:** sus avisos son evidencia para revisión; no identifican por sí solos una tarjeta ni generan gastos automáticamente.

### Programación del respaldo bancario

[scripts/configure-capture-bank-fallback-cron.cjs](scripts/configure-capture-bank-fallback-cron.cjs) configura `afp-capture-bank-fallback` en Supabase con `pg_cron`, `pg_net` y Vault. Requiere `DIRECT_URL`, `AFP_ORIGIN` (origen HTTPS) y `CRON_SECRET` de al menos 32 caracteres, coincidentes con el servidor. No instala esas extensiones.

La tarea revisa cada minuto y solo solicita `POST /api/cron/capture-bank-fallback` si hay esperas vencidas. Configurarla es una operación explícita de activación; no forma parte de `pnpm dev`, el build ni las migraciones. No confundirla con la revisión diaria de Calendar.

## Google Calendar

Desde Configuración se puede conectar un calendario AFP para cortes, pagos de tarjetas, suscripciones y cuentas por cobrar/pagar. Los eventos usan `America/Mexico_City`; mostrar importes es opcional. Los colores y estados se definen en [src/lib/calendar/palette.ts](src/lib/calendar/palette.ts).

Variables adicionales, solo de servidor:

| Variable | Uso |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Cliente OAuth web |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Secreto OAuth |
| `CALENDAR_ENCRYPTION_KEY` | Clave aleatoria de 32 bytes codificada en base64 para cifrar credenciales |
| `AFP_APP_ORIGIN` | Origen de la aplicación, sin ruta ni barra final; en local, `http://localhost:3000` |
| `CRON_SECRET` | Autorización de los endpoints de mantenimiento |

Habilitar Calendar API y configurar el cliente OAuth con callback exacto `<AFP_APP_ORIGIN>/api/calendar/google/callback`. El código solicita `openid`, `email`, `calendar.app.created` y `calendar.calendarlist.readonly`; las páginas públicas de información son `/acerca` y `/privacidad`. El usuario completa el consentimiento desde AFP. Conservar la clave de cifrado con los respaldos: cambiarla sin recifrar impide recuperar las credenciales guardadas.

Las mutaciones solicitan sincronización después de su commit; los triggers marcan cambios pendientes y el trabajador continúa los lotes. [vercel.json](vercel.json) añade mantenimiento diario a las **12:00 UTC**. También existe **Sincronizar ahora**; se respetan cuotas y esperas de reintento.

El script [configure-calendar-cron.cjs](scripts/configure-calendar-cron.cjs) sirve para **retirar** la antigua tarea de cinco minutos de Supabase. Las instalaciones nuevas no necesitan ese cron ni las extensiones del respaldo bancario para Calendar.

Desconectar retira eventos de hoy en adelante, conserva el historial y elimina la credencial renovable al terminar. Si Google revocó el acceso, los eventos restantes se retiran desde Google. No modificar otros calendarios del usuario.

## Convenciones de desarrollo

- Leer este README y [PRODUCT.md](PRODUCT.md) antes de cambiar arquitectura o comportamiento. Actualizar la documentación afectada en la misma tarea; registrar los hitos relevantes en [docs/bitacora.md](docs/bitacora.md) y guardar los resultados detallados de ejecución en `artifacts/`.
- El [plan de migración a TypeScript](docs/plan-migracion-typescript.md) está completado en sus fases 0–7. Todo el código activo de `src/` usa TS/TSX con `allowJs: false`, `strict` y `noUncheckedIndexedAccess`; no quedan adaptadores de JavaScript ni archivos vacíos. Importar directamente los componentes tipados de `src/components/ui/`; `components.json` usa `tsx: true`. Conservar validación de JSON en las entradas externas y los cuerpos originales usados por idempotencia y concurrencia. No usar `any`, supresiones de TypeScript ni dobles conversiones para ocultar errores. Los casos negativos con `@ts-expect-error` explicado viven exclusivamente en `tests/types/`. Evidencias y revisión de conversiones locales: [fase 7](artifacts/typescript-migration/phase-7/README.md). Código en inglés e interfaz en español.
- Conservar `node:test` y cargar fuentes con mocks mediante `tests/helpers/load-source.ts`: esbuild transforma JS/TS/JSX/TSX, pero no comprueba tipos. Los módulos puros sin inicialización externa pueden importarse directamente desde una prueba TS; los adaptadores de red/BD se inyectan. El cargador no hereda `process.env` ni carga `.env`. Las rutas con extensión deben señalar el archivo exacto; las rutas sin extensión se resuelven solo si son inequívocas. No se sustituyen extensiones antiguas. El mapa de rutas y los dobles mínimos están en `tests/helpers/source-contracts.ts`; `source-exports.ts` comprueba sus exports al cruzar `vm`. Ampliarlos junto con cada lote, sin asignar tipos arbitrarios a rutas dinámicas. Los adaptadores financieros de `tests/helpers/financial-fixtures.ts` conservan los campos omitidos y comprueban el JSON antes de recorrerlo; no completar fixtures históricos ni presentar un mock parcial como PrismaClient o NextResponse. Registrar tsx explícitamente en procesos que ejecuten o importen entradas TS; no depender de `NODE_OPTIONS`. Todas las pruebas y helpers activos usan TS con `allowJs: false`, `strict` y `noUncheckedIndexedAccess`, y se comprueban con `typecheck:tests` y ESLint; el descubrimiento acepta solo `.test.ts`. Los casos negativos explicados quedan en `tests/types/`. La auditoría reproducible y las fronteras locales justificadas están en el [cierre de pruebas](artifacts/typescript-tests-migration/phase-6/README.md). Los dobles mínimos de integraciones viven en `tests/helpers/integration-fixtures.ts` y `notice-fixture.ts`: las rutas dinámicas y el JSON nativo requieren comprobación de forma; los fallos de persistencia siguen usando transacciones PostgreSQL reales. Los helpers de navegador y seeds también se comprueban estrictamente; validar su conexión antes de importar Next/Prisma y cerrar los recursos al terminar. Los scripts operativos, configuraciones `.mjs` y `public/sw.js` mantienen JavaScript fuera del programa de tipos de la aplicación; Android conserva Kotlin.
- Reutilizar [src/components/ui/](src/components/ui/) y la configuración `radix-mira` de [components.json](components.json). Formularios con React Hook Form + Zod; fechas con `DatePicker`; importes con `NumberInput`; selectores con `ResponsiveSelect`/`SearchableSelect`.
- Conservar la interacción móvil de `CreateRecordSurface`, los borradores por usuario y el foco de los diálogos. Los borrados requieren el `AlertDialog` compartido. No ocultar errores ni presentar una recarga fallida como un alta no guardada.
- Mantener autorización por propietario, validación de relaciones, transacciones y las garantías idempotentes de cada flujo. Agregar verificaciones pertinentes cuando cambie una regla financiera o contrato.
- Usar datos ficticios aislados en pruebas. Guardar estados de cuenta, muestras bancarias, respaldos y claves fuera de Git; no incluirlos en capturas o artefactos públicos.
- En cargas revisadas desde estados de cuenta, las notas visibles usan «Registrado desde la BD.» o «Actualizado desde la BD.», conservando las notas personales. Rutas, hashes y evidencia detallada permanecen en los archivos privados de conciliación.

## Despliegue

La web se despliega en Vercel, proyecto `afp`. El build es `pnpm build`; no aplica migraciones. La APK Android se compila y distribuye por separado. No modificar producción, activar automatizaciones ni cargar datos reales sin autorización explícita del propietario.

1. Revisar cambios y variables del entorno de destino; ejecutar typecheck, typecheck:tests, test:types, lint, pruebas pertinentes, build y auditorías de dependencias. Para cambios de persistencia, verificar también las integraciones y la reconstrucción de BD.
2. Si hay migraciones pendientes, revisar respaldo, checksums y alcance antes de aplicarlas con `prisma migrate deploy`. Regenerar Prisma y publicar una versión compatible con el esquema.
3. Configurar por separado las URL de Supabase Auth, OAuth de Google, secretos y tareas programadas que use ese entorno. El callback OAuth y `AFP_APP_ORIGIN` deben corresponder al dominio publicado.
4. Tras publicar, comprobar acceso, rechazo de peticiones sin sesión, los flujos afectados y los registros de errores. Guardar evidencias con fecha y alcance en `artifacts/`, sin datos privados.

`vercel.json` define `ignoreCommand` para omitir despliegues de commits cuyo mensaje contenga `[skip vercel]`. El repositorio no incluye un workflow de CI en `.github/`; los detalles de la integración remota de Git y la separación de ambientes se deben verificar en su configuración.

## Documentación relacionada

- [docs/plan-migracion-typescript.md](docs/plan-migracion-typescript.md): plan por fases y criterios de aceptación; fases 0–7 completadas localmente, con evidencias de cierre.
- [docs/plan-migracion-tests-typescript.md](docs/plan-migracion-tests-typescript.md): migración de pruebas y helpers a TypeScript completada localmente en sus fases 0–6, con auditoría y evidencias finales.
- [docs/bitacora.md](docs/bitacora.md): decisiones, migraciones, incidencias y seguimientos históricos con sus evidencias.
- [PRODUCT.md](PRODUCT.md): propósito, alcance y principios del producto.
- [docs/android-captura.md](docs/android-captura.md): operación técnica de Android, firma y pruebas.
- [PLAN_CAPTURA_AUTOMATICA_ANDROID.md](PLAN_CAPTURA_AUTOMATICA_ANDROID.md): plan y antecedentes de la captura.
- [android/diagnostics/format-matrix.md](android/diagnostics/format-matrix.md): evidencia y cobertura histórica por fuente.
- [captura-tarjetas.example.json](captura-tarjetas.example.json): estructura de configuración; los alias reales van en el archivo local excluido de Git.
- [docs/shadcn-audit.md](docs/shadcn-audit.md): componentes locales y revisión de UI.
- [artifacts/](artifacts/): verificaciones históricas; sus fechas, conteos y estados corresponden a cada ejecución.
