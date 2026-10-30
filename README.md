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

`/` abre `/gastos` en móvil (ancho menor de 768 px) y `/dashboard` en escritorio. El inicio de sesión y el manifest de la PWA usan `/` como entrada; la APK Android abre `/gastos`. El manifest conserva `/dashboard` como identificador de la PWA para mantener la identidad de las instalaciones existentes. La navegación compartida se define en [src/lib/navigation.tsx](src/lib/navigation.tsx).

Las páginas muestran primero su contenido normal. Los formularios de creación en diálogo se abren al pulsar «Nuevo gasto», «Nueva compra», «Nueva suscripción» o la acción equivalente de cada sección; no se abren automáticamente al entrar ni al volver a una página. Se conservan los borradores por usuario y los formularios integrados de escritorio.

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

En **Mi dinero → Cuentas**, escritorio muestra una tabla con cuenta, saldo actual, rendimiento estimado y acciones. En móvil se usan acordeones que empiezan cerrados: el encabezado muestra nombre, saldo actual y los tres rendimientos; al abrir una cuenta aparecen referencia, tipo, saldo de referencia, acciones y últimas conciliaciones. Se puede abrir una cuenta a la vez. Todas las cuentas muestran rendimientos estimados **diario, semanal y mensual**, calculados con saldo y condiciones vigentes: 1, 7 y 30 días, sin movimientos futuros ni capitalización. Se respetan topes, tasas por tramos, base anual, descuentos y redondeo; el calendario de abono no cambia esos períodos comparables. El pie «Total de cuentas» suma saldo actual y cada período de rendimiento por separado, tanto en escritorio como en móvil. Las tasas se consultan en Editar; el acumulado histórico no se presenta como un rendimiento por período. Las últimas cinco conciliaciones se consultan al desplegar «Conciliaciones». El disponible tras la reserva se omite del listado; la reserva personal conserva su configuración y cálculo.

En **Mi dinero → Rendimientos**, el período inicial es el **mes actual**. Permite consultar otros meses, el año actual o todo el historial y filtrar una cuenta o reunirlas todas. La cifra principal es el **rendimiento acumulado automáticamente**: reúne los cálculos diarios de las cuentas y los abonos ya registrados que los sustituyen, sin duplicarlos. No requiere capturar ingresos ni abonos diarios; recupera el historial disponible aunque no se abra AFP. El detalle identifica cada importe como Automático o Registrado. Las reglas históricas, los saldos y el calendario de acreditación determinan el acumulado; una conciliación no se interpreta por sí sola como ganancia. Nóminas, transferencias, cobros de deudas, exclusiones y registros futuros quedan fuera. Los rendimientos registrados sin cuenta se señalan aparte. Los estimados a 7 y 30 días usan los saldos y condiciones actuales y no dependen del período histórico elegido. El pendiente de acreditación calculado se muestra por separado. [Implementación inicial](artifacts/money-yields-2026-10-30/README.md) · [Corrección para seguimiento automático](artifacts/money-yields-2026-10-30/automatic/README.md).

En **Compras a meses**, cada compra indica «Para mí» en azul o «Para [persona]» en violeta, con texto e icono y tonos propios para claro y oscuro. El filtro «Compras de» permite ver las propias, las de otras personas o las de una persona concreta y conserva las pestañas de estado, la búsqueda y los totales filtrados. «Ver pagos», junto a la persona en escritorio y en las acciones de la compra en móvil, abre un panel lateral en escritorio o inferior en móvil sin salir del listado. Muestra los abonos registrados con fecha, concepto, fuente, importe y notas, el total recibido y el saldo por cobrar. Los ajustes no monetarios se muestran aparte; las cuotas y el pendiente bancarios conservan sus propios importes. [Implementación y verificaciones técnicas](artifacts/installment-recipients-payments-2026-10-29/README.md) · [Colores de destinatario](artifacts/installment-recipient-colors-2026-10-29/README.md).

En **Avisos importantes**, el tipo se identifica mediante icono, etiqueta y color estable: azul para pagos de tarjeta, rosa para cuentas por pagar, verde para cobros programados, violeta para suscripciones y ámbar para cortes. Cada aviso usa un fondo opaco de su categoría, con tonos propios para claro y oscuro. La urgencia se muestra aparte con «Vencido», «Hoy» o «Próximo»; el orden por prioridad y fecha se conserva. La identificación también aparece en los avisos ocultos y al confirmar su ocultación. [Implementación de categorías](artifacts/notice-categories-2026-10-29/README.md) · [Fondos sólidos y contraste](artifacts/notice-solid-backgrounds-2026-10-29/README.md).

## Stack y estructura

| Área | Implementación |
| --- | --- |
| Web | Next.js 16.4.3, App Router y React 19.2.4 |
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

### Estados de cuenta locales

Los PDF privados se organizan por **año y mes de corte bancario**, con el número del mes como prefijo: `estados_cuenta/2026/08-agosto/bbva.pdf`. Cada carpeta mensual contiene solamente PDF. El índice privado de cada año, `estados_cuenta/<año>/INDICE.md`, muestra los documentos agregados; su presencia no acredita que ya se hayan conciliado o cargado en AFP. Actualizar el índice al agregar documentos.

```text
estados_cuenta/
  2026/
    INDICE.md
    07-julio/
    08-agosto/
    09-septiembre/
    10-octubre/
  _soporte/
    conciliaciones/<año>/<MM-mes>/
    respaldos-y-revisiones/
    referencias_tarjetas/
    rutas_anteriores.json
```

Guardar JSON, aclaraciones, esquemas, SQL y archivos de trabajo bancarios en `_soporte/conciliaciones/<año>/<MM-mes>/`; los respaldos y revisiones privados de otras tareas, en `_soporte/respaldos-y-revisiones/`. Las imágenes utilizadas para preparar las marcas de tarjetas permanecen en `_soporte/referencias_tarjetas/`. Crear los nuevos archivos técnicos en estas ubicaciones para mantener visibles los PDF.

La reorganización local del 29 de octubre de 2026 conservó los archivos históricos sin modificar su contenido ni sus permisos. El mapa privado `_soporte/rutas_anteriores.json` relaciona cada ruta anterior con su ubicación actual; el inventario y la verificación del traslado están en `_soporte/reorganizacion-2026-10-29/`. Las referencias antiguas en bitácoras, respaldos y lotes autorizados conservan su valor histórico: consultar el mapa al abrirlas. El validador de la skill local `conciliar-estados-cuenta` resuelve las rutas anteriores de las conciliaciones y sus PDF mediante ese mapa. Las revisiones nuevas deben registrar las rutas actuales. Todo `estados_cuenta/` continúa excluido de Git.

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

El login y el registro usan campos y botones de al menos **48 px**, con texto de **16 px** en los campos. El correo admite teclado de email y autocompletado de usuario; la contraseña distingue acceso (`current-password`) y registro (`new-password`). El formulario permite desplazarse en pantallas bajas y conserva el zoom. [Verificación local y límites A14](artifacts/auditoria-2026-10-15/a14-2026-10-29/README.md).

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

La suite actual tiene **1045 escenarios correctos, sin omisiones con PostgreSQL local**, incluidas trece regresiones del informe de rendimientos y siete regresiones de rendimientos diarios, semanales y mensuales y las regresiones de pagos recibidos en Compras a meses. [Rendimientos por período](artifacts/accounts-desktop-table-2026-10-29/periods/README.md). [Destinatarios y detalle de pagos](artifacts/installment-recipients-payments-2026-10-29/README.md). [Avisos de suscripciones y borde de nómina](artifacts/dashboard-subscription-notices-2026-10-29/README.md). [Resultados A04](artifacts/auditoria-2026-10-15/a04-2026-10-29/README.md) · [Resultados A07](artifacts/auditoria-2026-10-15/a07-2026-10-29/README.md) · [Resultados A08](artifacts/auditoria-2026-10-15/a08-2026-10-29/README.md) · [Resultados A09](artifacts/auditoria-2026-10-15/a09-2026-10-29/README.md) · [Resultados y límites de A10](artifacts/auditoria-2026-10-15/a10-2026-10-29/README.md) · [Resultados A12](artifacts/auditoria-2026-10-15/a12-2026-10-29/README.md) · [Resultados y mediciones A13](artifacts/auditoria-2026-10-15/a13-2026-10-29/README.md) · [Verificaciones A14](artifacts/auditoria-2026-10-15/a14-2026-10-29/README.md) · [Compras diarias y duplicados](artifacts/capture-daily-purchases-2026-10-29/README.md) · [Pagos BBVA por coincidencia](artifacts/bbva-card-payment-match-2026-10-29/README.md).

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

### Dependencias y seguridad

La [actualización A10 del 29 de octubre de 2026](artifacts/auditoria-2026-10-15/a10-2026-10-29/README.md), con [publicación confirmada en el commit `08aee7c`](artifacts/auditoria-2026-10-15/publicacion-2026-10-29/README.md), fija Next.js y `eslint-config-next` en **16.4.3** y actualiza las transitivas `fast-uri` a **3.1.9**, `body-parser` a **2.4.0** y `systeminformation` a **5.33.18**, dentro de los rangos de sus dependientes. Mantiene React, Prisma, Sharp, la CLI shadcn en desarrollo y la política de scripts de instalación. No utiliza overrides, exclusiones de avisos ni `audit --fix`.

La última auditoría local del árbol de producción devuelve **cero avisos**; el árbol completo conserva **uno bajo**, `GHSA-gcqx-w48m-w2h4` en `deepmerge@4.3.1`, transitiva de shadcn sin parche publicado en el registro consultado. No aparece en el árbol de producción. Hasta disponer de corrección, usar la CLI con configuraciones y registros revisados; el aviso permanece visible y A10 conserva ese seguimiento abierto. La [evidencia](artifacts/auditoria-2026-10-15/a10-2026-10-29/README.md) detalla alcance, reproducción y límites. Estos resultados sustituyen el diagnóstico del 27/10 para el lockfile incluido en el commit publicado; el cotejo del despliegue no repite las auditorías ni valida los flujos autenticados de producción.

Instalar con `pnpm install --frozen-lockfile`, incluidas las dependencias de desarrollo necesarias para compilar. Repetir `pnpm audit:prod` y `pnpm audit:all` antes de publicar y tras cambiar dependencias; un fallo de red no equivale a cero avisos. Una compilación correcta tampoco acredita que el árbol esté libre de avisos.

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
| `/api/installment-purchases/payments?purchaseId=…` | `GET` |
| `/api/subscriptions` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/subscription-charges` | `GET`, `POST` |
| `/api/receivables` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/payables` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/dashboard`, `/api/dashboard/summary` | `GET` |
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
- **Suscripciones:** un gasto confirmado sustituye la previsión de su ocurrencia, sin duplicarla. Confirmar, omitir o restaurar afecta ese mes; ajustar importe, fecha o método no cambia la recurrencia. Respetar frecuencia, inicio y desactivación. Las activas, en efectivo o con tarjeta, aparecen en Avisos importantes desde dos días antes de su cobro, también al cambiar de mes o año, según el día de México. Los cobros confirmados, omitidos o respaldados por un comprobante bancario válido dejan de avisar; los pendientes del mes conservan su aviso. Se mantiene la ocultación mensual y el destino Gastos en web y Android.
- **Compras a meses:** la cuota se deriva del corte y la fecha de compra; `initialPaymentsMade` no fija la cuota actual. Las referencias verificadas de `statementReconciliations` prevalecen para sus cortes; los demás importes siguen siendo estimaciones. Los pagos recibidos de otra persona pertenecen a la cuenta por cobrar vinculada, con su mensualidad y sus ajustes de saldo independientes de la deuda bancaria. El detalle de pagos consulta solo la compra y cuenta del propietario autenticado en una lectura `RepeatableRead`; no modifica importes, estados ni abonos. Una compra sin cuenta vinculada se distingue de una cuenta sin abonos.
- **Gastos compartidos:** `cashContributionAmount` reduce la parte personal, pero conserva el cargo bancario completo. No crea un ingreso ni se combina con una cuenta por cobrar/pagar vinculada al mismo gasto.
- **Deudas y préstamos:** recalcular saldo y estado al editar o borrar abonos. Un ajuste de saldo de una cuenta por cobrar no representa un ingreso. El reembolso de un tercero no amortiza nuevamente el préstamo bancario; separar capital, intereses y saldo conciliado.
- **Consumo mínimo:** los movimientos previstos no acreditan consumo confirmado; conservar períodos y condiciones por tarjeta y la evidencia de conciliación.
- **Atomicidad e idempotencia:** las escrituras relacionadas se confirman en una transacción. Gastos y Mi dinero conservan recibos por usuario/UUID; repetir el UUID con otro contenido genera conflicto. No asumir que toda mutación tiene esta garantía.

### Lecturas de Gastos

[expenseReader.ts](src/lib/expenseReader.ts) mantiene una lectura vigente por propietario y URL de filtros. Cambiar la selección cancela e invalida la consulta anterior inmediatamente, antes del debounce de 250 ms. Solo la generación vigente puede actualizar filas, meses disponibles, error e indicador de carga, incluso si el transporte termina después de cancelarse. Durante la espera se muestra el esqueleto de resultados.

Las recargas tras guardar, editar, borrar o sincronizar pendientes usan los filtros vigentes al terminar la operación; una recarga forzada sustituye también otra lectura de la misma URL. La carga inicial y su respaldo offline solo aportan filas a su selección original y no sustituyen una consulta posterior. Salir de la pantalla cancela las lecturas y la carga inicial. La API y las garantías de escritura se conservan. [Regresiones A09](tests/expense-reader.test.ts).

### Ventanas e historial de Gastos, Dashboard y Ciclos · A13

Dashboard y Análisis comparten `GET /api/dashboard` y el año seleccionado. `year` admite 1900–9998 y usa por defecto el año de México. La ventana de análisis comprende diciembre anterior, el año elegido y enero siguiente: conserva enero contra diciembre y las previsiones del mes siguiente. El selector de año permite consultar los períodos anteriores. Se incorporan además los cortes históricos aún pendientes o sin estado capturado, las tarjetas del batch de pago activo y sus vecinos. Una marca antigua `PAID` con abono parcial no excluye el corte.

Fuera de Dashboard y Análisis, la cabecera móvil usa `GET /api/dashboard/summary`: avisos, consumo vigente e historial reciente del contexto consultado, sin matrices anuales de semanas/categorías ni listados financieros completos. Conserva la carga compartida por propietario y modo; cambiar de ruta, año o cuenta invalida la lectura anterior. Los períodos más antiguos se consultan por año en Dashboard. El día de los avisos sigue siendo el actual de México al revisar otro año.

Ciclos admite `year`, `page` y `pageSize` (1–100, predeterminado 100); devuelve `cycles`, `totalCount`, `page`, `pageSize`, `pageCount` y `year`. Sin año explícito añade el contexto de cortes pendientes al año vigente. `cycleId` consulta un único corte del propietario, de cualquier año, y conserva su desglose bajo demanda. Los predecesores de la página se consultan juntos para conservar las advertencias de períodos. No se descargan los movimientos de todas las tarjetas o años para abrir un detalle.

`GET /api/expenses` y el bootstrap agrupado de Gastos comparten una página de hasta 100 filas y el agregado SQL del filtro completo: `total`, `personalTotal`, `totalCount`, `page`, `pageSize` y `pageCount`. Las páginas fuera de rango se ajustan a la última existente. Meses disponibles, conteo, sumas y filas pertenecen a la misma lectura `RepeatableRead`; los meses se agrupan en PostgreSQL sobre todo el historial del propietario. El bootstrap mantiene los catálogos y el respaldo offline; admite copias anteriores sin metadatos de página.

Se conservan los filtros de fecha, categoría, concepto, método, tarjeta, cuenta de débito e importe. `sortBy` admite `date`, `concept`, `amount`, `category`, `paymentMethod` y `card`; `sortDirection` admite `asc`/`desc`. Fecha descendente es el orden inicial, con desempate por creación e ID. El móvil envía `filters` como JSON de alternativas `{type, value}`: alternativas dentro de un campo e intersección entre campos. La pantalla reinicia la página al cambiar selección, tamaño u orden y descarta respuestas antiguas. Los pendientes del dispositivo permanecen recuperables y se distinguen de los totales de registros guardados.

Las consultas retienen los cargos que resuelven una suscripción aunque su fecha efectiva quede fuera de ventana. Las MSI se seleccionan por su plazo y las anclas bancarias verificadas; no se descartan solo por una fecha antigua de compra. Turbo recupera la última compra válida y sus comprobantes/exclusiones históricos mediante consultas acotadas y búsqueda por lotes. Ingresos del mes y abonos de deudas se suman en SQL; solo los cobros del mes actual se necesitan para resolver sus avisos.

[Implementación, regresiones, mediciones y límites](artifacts/auditoria-2026-10-15/a13-2026-10-29/README.md). Las mediciones con 1,000–100,000 gastos sintéticos comparan consultas SQL, bytes, p95 y memoria con el código anterior. Acotar lo transferido no elimina el trabajo SQL de sumar todo un filtro ni el crecimiento de pendientes reales o movimientos dentro de una ventana. Sin migraciones, cambios de dependencias ni publicación.

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

### Datos locales y cierre de sesión

Escritorio y móvil comparten el cierre de sesión de [LogoutProvider](src/components/layout/LogoutProvider.tsx). Al salir se elimina el respaldo de Gastos y los borradores financieros de esa cuenta en localStorage, sessionStorage y memoria; se retiran también respuestas API de cachés antiguas de AFP. El shell público de la PWA y las preferencias de interfaz se conservan. Una generación por usuario impide que una lectura antigua vuelva a escribir el respaldo tras salir o entrar de nuevo.

Si hay gastos pendientes, la salida permite:

- **Sincronizar pendientes:** usa los mismos UUID y recibos idempotentes. Una respuesta perdida o un fallo conserva la entrada para reintentar.
- **Exportar pendientes:** descarga un JSON de esa cuenta. Tras verificar la descarga y marcar la confirmación, se permite salir y borrar su cola local. Si los pendientes cambian después de exportar, hay que revisar y exportar de nuevo.
- **Conservar pendientes:** exige declarar que el dispositivo es de confianza cada vez. Mantiene solo la cola recuperable y sus referencias; retira la copia legada redundante si ya fue migrada correctamente. Evitar esta opción en equipos compartidos.

**Restaurar respaldo de pendientes**, en Gastos, exige la misma cuenta y conserva propietarios, UUID, cuerpos originales y referencias de importación. Repetir un respaldo no sobrescribe entradas distintas ni duplica operaciones confirmadas en el servidor. Los pendientes restaurados se sincronizan al recuperar conexión. Es una exportación de pendientes, no del historial financiero completo.

Los datos locales y archivos exportados contienen información financiera sin cifrado propio de AFP. Una cola dañada puede exportarse literalmente antes de borrarla; sus entradas inválidas requieren revisión manual antes de restaurar/sincronizar. Si el almacenamiento no se puede leer o limpiar, no se informa una salida completa. Un fallo de Auth conserva la cola y permite reintentar. Si la sesión termina externamente o se cambia de cuenta, se limpia el respaldo sincronizado y se conservan los pendientes: nunca se borran sin una decisión expresa.

La salida se coordina con los envíos y las otras pestañas mediante Web Locks cuando están disponibles, comprobaciones de almacenamiento y señales de Auth. Bloquea nuevas capturas durante el cierre; sin Web Locks, un cambio concurrente puede exigir repetir la limpieza, conservando los datos. La navegación final recarga el login para retirar el estado de memoria. Cerrar sesión afecta este navegador; **no revoca la credencial nativa Android**. Para detener la captura del teléfono, revocarlo desde Registro automático → Ajustes antes de salir. [Política de privacidad](src/app/privacidad/page.tsx) · [Evidencias y límites A12](artifacts/auditoria-2026-10-15/a12-2026-10-29/README.md).

## Captura automática Android

[android/](android/) contiene la APK complementaria. La configuración de versión, SDK y paquetes está en [android/app/build.gradle.kts](android/app/build.gradle.kts); la compilación, firma, instalación, diagnóstico y pruebas se explican en [docs/android-captura.md](docs/android-captura.md). Ese documento conserva antecedentes por fases; la revisión web actual está en `/registro-automatico`.

La APK personal **0.9.0 / versionCode 13**, instalada el 29 de octubre de 2026, abre `/gastos` al pulsar «Abrir AFP» y añade la captura optativa de recibos Uber desde Gmail. Se actualizó por USB con la firma existente, conservando vinculación, cola y permiso del lector. Cambiar la URL de entrada Android requiere compilar e instalar una actualización de la APK. [Instalación vigente](artifacts/gmail-uber-receipts-2026-10-29/README.md) · [Comprobación de la apertura en Gastos](artifacts/android-gastos-start-2026-10-29/README.md).

El teléfono se vincula mediante un código autorizado por la sesión web. Conserva una identidad revocable y una cola Room cifrada, y WorkManager entrega eventos con recibos idempotentes. La sesión de la TWA y la credencial nativa son independientes.

- La automatización exige formato validado, identificación inequívoca y reglas aceptadas por tarjeta o cuenta. Recibir un aviso no implica registrarlo como movimiento.
- **Registro automático** reúne pendientes e historial; sus ajustes administran teléfono, fuentes, alias y reglas. Las posibles coincidencias se resuelven en revisión: importe, comercio y hora por sí solos no prueban que dos avisos sean una misma compra.
- Las coincidencias de compras se buscan por tarjeta e importe en el mismo día financiero, para permitir compras diarias iguales. Entre días contiguos se conservan los avisos separados por hasta 15 minutos y la revisión entre banco y Wallet cuando una fuente ya registró el gasto, salvo que la hora bancaria de operación demuestre una compra posterior al aviso Wallet. Los avisos previamente resueltos o pendientes conservan su estado. [Ajuste local y verificaciones](artifacts/capture-daily-purchases-2026-10-29/README.md).
- Wallet puede ser la fuente principal de compras. El respaldo bancario aceptado espera al menos 15 minutos y vuelve a comprobar coincidencias y permisos antes de registrar.
- Pagos por notificación o comprobante compartido conservan su evidencia y distinguen abono nuevo de pago ya incluido. Las transferencias y retiros usan sus registros propios en Mi dinero.
- La regla opcional de cargos genéricos BBVA busca primero pagos de tarjeta: compara el saldo pendiente de un estado capturado, tras abonos y devoluciones aplicadas al corte, con hasta **$1.00 MXN de diferencia** y vencimiento **un día antes, el mismo día o un día después** del aviso en México. Una sola coincidencia registra el abono y descuenta de la cuenta una vez; varias coincidencias quedan por revisar. Sin coincidencia conserva el gasto con débito. El pago usa el importe real: un faltante sigue pendiente y un excedente de hasta $1 queda identificado en el corte. **Cambiar tipo de movimiento** permite corregir gastos existentes a retiro, transferencia o pago de tarjeta. [Implementación local y pruebas](artifacts/bbva-card-payment-match-2026-10-29/README.md).
- Los avisos importantes del teléfono usan el mismo día financiero de México que la web, aunque el dispositivo tenga otra zona horaria. El parámetro legado `timeZone` se valida, pero no cambia los vencimientos. Los avisos respetan sus preferencias y las ocultaciones mensuales del usuario. Su entrega depende también de permisos y restricciones de Android.

<a id="devoluciones-y-cancelaciones-de-compras--publicado-y-preparado-para-confirmar"></a>

**Devoluciones y cancelaciones de compras:** requieren confirmación personal del cargo e importe antes de aplicar el reembolso. Conservar el importe original, la evidencia y la posibilidad de deshacer; no deducir una devolución solo por coincidencia de importes.

<a id="avisos-de-uber-didi-viajes-y-uber-eats--publicado-y-activo"></a>

**Uber, DiDi viajes y Uber Eats:** sus avisos son evidencia para revisión; no identifican por sí solos una tarjeta ni generan gastos automáticamente.

**Recibos de Uber en notificaciones de Gmail — publicado e instalado:** la APK **0.9.0 / 13** añade Gmail como fuente optativa, desactivada al actualizar y seleccionada expresamente en el teléfono personal tras la publicación autorizada. Filtra en el teléfono el remitente visible «Recibos de Uber» y el asunto del viaje antes de guardar o enviar; elimina los campos de cuenta y resúmenes de correo. No conecta la API de Gmail ni recupera correos históricos. Los recibos completos aportan MXN, total, fecha/hora del viaje y terminación bancaria; se resuelven contra alias físicos/digitales verificados. Los recortados se revisan sin inventar la tarjeta. La activación exige una muestra propia revisada/cotejada por tarjeta y aceptar `RECEIPT_OPERATION`.

Con esa regla activa, una única coincidencia de tarjeta, cargo Uber e importe dentro de 48 horas vincula banco y recibo; el gasto usa la fecha del viaje. Las propinas explícitas del mismo recibo actualizan el total una vez, sin sumar nuevamente el total y sus pagos desglosados. Ambigüedades, gastos editados, conciliados o borrados y reducciones de importe requieren revisión. El usuario acepta esta asociación por datos coincidentes, que no constituye una referencia bancaria compartida. La web y la migración aditiva ya están publicadas; Gmail está seleccionado para recibir avisos. Falta observar una notificación real completa, cotejar la muestra y habilitar el formato por tarjeta. Los viajes anteriores conservan su estado. [Alcance, pruebas y verificación de producción](artifacts/gmail-uber-receipts-2026-10-29/README.md).

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
