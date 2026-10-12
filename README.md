# AFP — Control de Gastos (garatachia)

> Fuente principal de contexto del proyecto. Leer antes de hacer cambios.

---

## Descripción del proyecto

App web personal de finanzas personales. Single Next.js app (no monorepo).
Manejo de gastos diarios, tarjetas de crédito, compras a meses, suscripciones, ingresos, cuentas por cobrar y cuentas por pagar.
Auth por Supabase. DB PostgreSQL vía Prisma + Supabase. Modo oscuro forzado.

---

## Módulos (rutas)

| Ruta | Componente principal | Descripción |
|---|---|---|
| `/gastos` | `GastosContent.jsx` | Registro y gestión de gastos diarios |
| `/dashboard` | `DashboardContent.jsx` | Resumen financiero del período |
| `/compras-a-meses` | `ComprasAMesesContent.jsx` | Compras a meses / MSI en tarjeta |
| `/suscripciones` | `SuscripcionesContent.jsx` | Suscripciones recurrentes |
| `/ingresos` | `IngresosContent.jsx` | Registro de ingresos |
| `/cuentas-por-cobrar` | `CuentasPorCobrarContent.jsx` | Cuentas por cobrar (deudas a favor) |
| `/cuentas-por-pagar` | `CuentasPorPagarContent.jsx` | Cuentas por pagar (deudas propias, incl. préstamos) |
| `/tarjetas` | `TarjetasContent.jsx` | Tarjetas + ciclos de corte |
| `/configuracion` | `SettingsContent.jsx` | Categorías, personas, tipos de ingreso |
| `/login` | `src/app/login/page.js` | Auth Supabase |

---

## Stack

- **Framework**: Next.js 16.2.6 (App Router)
- **Lenguaje**: JavaScript (jsconfig.json, no TypeScript)
- **UI**: shadcn/ui (componentes locales en `src/components/ui/`) + Radix UI + Tailwind CSS v4
- **Íconos**: lucide-react + @hugeicons/react
- **Tablas**: @tanstack/react-table 8.x (vía `src/components/ui/data-table.jsx`)
- **Gráficas**: recharts 3.x (vía `src/components/ui/chart.jsx`, wrapper shadcn canónico)
- **Formularios**: React Hook Form + Zod
- **Auth**: Supabase (`@supabase/supabase-js`)
- **BD**: PostgreSQL en Supabase, ORM Prisma 7.x con adapter pg
- **PWA / offline**: manifest + service worker propio; cola local de gastos en `localStorage`
- **Toasts**: sonner (montado en root layout, `position="bottom-center"`)
- **Tema**: dark mode forzado (`html class="dark"`)
- **Fuente**: Geist Sans + Geist Mono

---

## API Routes

| Endpoint | Archivo |
|---|---|
| `POST/GET /api/expenses` | `src/app/api/expenses/route.js` |
| `GET /api/cards` | `src/app/api/cards/route.js` |
| `GET /api/card-cycles` | `src/app/api/card-cycles/route.js` |
| `GET /api/incomes` | `src/app/api/incomes/route.js` |
| `GET /api/installment-purchases` | `src/app/api/installment-purchases/route.js` |
| `GET /api/subscriptions` | `src/app/api/subscriptions/route.js` |
| `GET /api/receivables` | `src/app/api/receivables/route.js` |
| `GET /api/payables` | `src/app/api/payables/route.js` |
| `GET /api/dashboard` | `src/app/api/dashboard/route.js` | Incluye `weeklyComparisonByMonth`, `weeklyComparisonByCategoryAndMonth` (filtrado por categoría), `categories` para el comparativo mes vs mes y `cardUsageWaivers` para progreso de consumo mínimo por tarjeta |
| `GET /api/settings` | `src/app/api/settings/route.js` |
| `POST /api/setup-user` | `src/app/api/setup-user/route.js` |

---

## Schema Prisma — Modelos

Archivo: [`prisma/schema.prisma`](prisma/schema.prisma)

| Modelo | Tabla | Descripción |
|---|---|---|
| `User` | `users` | Usuario autenticado vía Supabase |
| `Card` | `cards` | Tarjetas de crédito |
| `CardCycle` | `card_cycles` | Ciclos de corte por tarjeta |
| `CardCycleCredit` | `card_cycle_credits` | Bonificaciones de un ingreso aplicadas a los cargos de un corte |
| `Category` | `categories` | Categorías de gasto (por usuario) |
| `Person` | `people` | Personas para cobrar/pagar |
| `IncomeType` | `income_types` | Tipos de ingreso (por usuario) |
| `DailyExpense` | `daily_expenses` | Gasto diario (efectivo o tarjeta) |
| `InstallmentPurchase` | `installment_purchases` | Compras a meses en tarjeta |
| `Subscription` | `subscriptions` | Suscripciones recurrentes |
| `ReceivableAccount` | `receivable_accounts` | Cuentas por cobrar |
| `PayableAccount` | `payable_accounts` | Cuentas por pagar (simple o préstamo) |
| `Income` | `incomes` | Ingresos registrados |

### Enums relevantes

- `PaymentMethod`: `CASH` | `CARD`
- `CardCycleStatus`: `OPEN` | `CUT` | `PAYMENT_PENDING` | `PAID` | `OVERDUE`
- `InstallmentPurchaseStatus`: `ACTIVE` | `PAID_OFF` | `CANCELLED` | `ADJUSTED`
- `ReceivableAccountStatus` / `PayableAccountStatus`: `ACTIVE` | `PAID_OFF` | `CANCELLED`
- `ReceivableOriginType`: `MANUAL` | `DAILY_EXPENSE` | `INSTALLMENT_PURCHASE`
- `PayableOriginType`: `MANUAL` | `DAILY_EXPENSE`

### Suscripciones — campos de estado

`Subscription` tiene `isActive Boolean @default(true)` y `deactivatedAt DateTime?`.

Reglas de cálculo:
- Suscripción activa (`isActive = true`): se incluye en ciclos/meses según frecuencia normal.
- Suscripción inactiva (`isActive = false`): solo se incluye en un ciclo/mes si la fecha de cobro dentro de ese período cae **antes o igual** que `deactivatedAt`. Si el cobro cae después de la desactivación, no se suma ni aparece en el desglose.
- Avisos de cobro en efectivo (dashboard): suscripciones inactivas se omiten por completo.

### Compras a meses (MSI) — cálculo de cuota actual

`InstallmentPurchase` no guarda la cuota actual; se calcula dinámicamente en cada ciclo a partir de `purchaseDate` y el `usualCutDay` de la tarjeta (lógica duplicada en `card-cycles/route.js` y `dashboard/route.js`, funciones `getPurchaseFirstCycleIndex` / `getPurchaseCycleNumber` / `shouldIncludePurchaseInCycle`):

- `firstCycleIndex`: ciclo (año*12+mes) donde cae la primera cuota — el mismo mes de `purchaseDate` si la fecha es **antes o igual** al `usualCutDay`, o el mes siguiente si es posterior.
- `currentMonth` de un ciclo objetivo = `(targetCycleIndex - firstCycleIndex) + 1`.
- Se incluye en el ciclo solo si `1 <= currentMonth <= months` (y, para `ACTIVE`, si `purchaseDate` no es posterior al `cutDate` del ciclo).
- `initialPaymentsMade` **no** se usa para este cálculo — solo sirve como ancla en `getNextPaymentDueDate` (`ComprasAMesesContent.jsx`). Antes el cálculo mezclaba un valor dinámico con un fallback estático `initialPaymentsMade + 1`, lo que dejaba la cuota "congelada" en vez de avanzar mes a mes (y de excluirse al completarse).

### MSI — referencias verificadas de estados de cuenta

`InstallmentPurchase.statementReconciliations` es un JSON opcional con referencias por mes de corte: `year`, `month`, `paymentNumber`, `amount`, `remainingBalance` y `source`.

- Una referencia bancaria prevalece sobre el cálculo de cuota e importe para ese corte. `src/lib/calculations/installmentStatements.js` valida y consulta las referencias.
- El número de cuota de otros ciclos se calcula a partir del corte verificado. La fecha de compra y el monto original se conservan.
- El importe de un corte sin referencia sigue siendo una estimación según la mensualidad configurada; no se presenta como un cargo confirmado por el banco.
- En compras a meses, el progreso, mensualidad y saldo reflejan el último estado verificado, cuya fecha se muestra junto al concepto. El próximo pago corresponde al ciclo siguiente a esa referencia.
- Las referencias se incorporan mediante una carga revisada. Editar los campos habituales de una compra conserva las referencias existentes.

### Tarjetas — bonificaciones aplicadas al corte

`CardCycleCredit` vincula un ingreso existente con un ciclo e indica el importe aplicado a sus cargos. El ingreso se registra una sola vez; la aplicación no crea otro ingreso ni modifica los gastos, MSI o pagos.

- Tarjetas y dashboard calculan `calculatedAmount = grossCalculatedAmount - creditsAmount`. El desglose muestra cargos, bonificaciones y total a pagar.
- Se descuenta únicamente el importe aplicado a los cargos de ese corte. La parte destinada al adeudo anterior queda documentada en las notas y no se vuelve a descontar de otro corte.
- Cada par ingreso/ciclo admite una sola aplicación. Las aplicaciones deben pertenecer al mismo usuario, ser positivas, no exceder el ingreso disponible entre todos los ciclos ni los cargos del corte y conservar la evidencia del estado de cuenta en `notes` directamente en Supabase.
- La carga se realiza mediante conciliación revisada. Los ingresos generales no se descuentan automáticamente de las tarjetas.
- Un ingreso con aplicaciones no se puede eliminar desde la app ni reducir por debajo del importe aplicado. Hay que revisar primero la conciliación correspondiente.
- La migración de este modelo es aditiva. Debe aplicarse con `prisma migrate deploy` antes de iniciar la versión que consulta la nueva tabla.

### Recuperación de registros desde estados de cuenta

La skill `conciliar-estados-cuenta` se mantiene en `skills/conciliar-estados-cuenta/SKILL.md`. Documenta la extracción, revisión, carga autorizada y verificación de gastos y MSI contra Supabase.

- El PDF y `<banco>_conciliacion.json` conservan los datos bancarios y su evidencia.
- El usuario edita `<banco>_aclaraciones.json` desde VS Code: nombres, categorías, personas por cobrar y notas. Su esquema local ofrece categorías y personas existentes; las fechas e importes bancarios se conservan en la conciliación.
- `python3 skills/conciliar-estados-cuenta/scripts/revision_json.py validar estados_cuenta/<mes>/<banco>_conciliacion.json` comprueba el JSON y el SHA-256 del PDF. Código de salida 2 significa aclaraciones pendientes; 1, datos inválidos; 0, revisión completa. No escribe en la BD.
- Los registros cargados o conciliados directamente incluyen una nota que identifica su origen y preserva las notas previas.

### Dashboard — consumo mínimo para exentar comisión de tarjeta

`/dashboard` muestra una sección minimalista de consumo mínimo usando `cardUsageWaiversByMonth` de `GET /api/dashboard`; solo aparecen tarjetas con mínimo configurado y el selector de mes corresponde al mes de corte (`CardCycle.month`) del ciclo. Cada fila muestra la fecha de corte tomada y se ordena por proximidad del corte: primero las tarjetas que ya cortaron o están más cerca de cortar, al final las más lejanas.

Las reglas se resuelven por el producto verificado en `Card.usagePolicy.productKey`, nunca por coincidencias en el nombre editable. La política conserva fecha de verificación, fuente oficial y PDF de identidad. Productos comprobados el 11 de octubre de 2026:
- HSBC 1 y HSBC 2: **HSBC Zero**, $300 por período entre cortes. [Condiciones](https://www.hsbc.com.mx/tarjetas-de-credito/productos/zero/).
- Banamex 1 y Banamex 2: **Joy Banamex**, $300 por período entre cortes. [Condiciones](https://www.banamex.com/es/personas/tarjetas-credito/tarjeta-de-credito-sin-anualidad-joy-ab/index.html).
- Santander: **LikeU**, $200 por período. [Condiciones](https://www.santander.com.mx/personas/credito-y-financiamiento/tarjetas-de-credito/likeu).
- Nu, DiDi Card y Mercado Pago no tienen meta de consumo para esta comisión. BBVA es Oro: su anualidad y posibles promociones personales se revisan aparte. Estos productos no aparecen en el indicador. Una tarjeta sin producto verificado tampoco recibe una meta inferida por banco.

`src/lib/calculations/cardUsageWaivers.js` calcula el consumo y el faltante a centavos:
- Cuenta gastos registrados con tarjeta; excluye comisiones, intereses y sus impuestos. La descripción bancaria original en `notes` y los IDs de cargos excluidos verificados conservan la clasificación al renombrar un gasto. Para cargos manuales sin evidencia usa conceptos bancarios reconocibles; una categoría como Servicios no basta para excluirlo.
- Las suscripciones cuentan cuando existe un gasto vinculado o un cargo documentado en el estado. Se emparejan por suscripción y mes del cargo para no duplicar el gasto, la referencia y el calendario. Se conserva el importe histórico del comprobante.
- Las suscripciones sin comprobante y los movimientos futuros aparecen como previstos/por confirmar; no completan la meta. En un corte revisado no se inventan cargos de suscripciones ausentes del PDF.
- Una compra nueva a meses cuenta por su importe original en el período de compra, incluso si ahora está liquidada; las mensualidades de compras anteriores y las canceladas no se suman.
- `CardCycle.usageReconciliation` guarda `version: 1`, `source`, `sourceSha256`, `startDate`, `cutDate`, `subscriptionCharges` (subscriptionId, name, date, amount) y `excludedExpenseIds`. Sus fechas prevalecen **solo en Consumo mínimo**. Los períodos sin documento se muestran como previstos. Los importes y fechas del cálculo financiero del corte se conservan.

Para un descuento temporal de suscripción, una conciliación autorizada puede marcar un cargo bancario con `applyToCycleAmount: true`. `subscriptionStatements.js` usa ese importe también en Tarjetas y en el cálculo del corte del dashboard, únicamente para esa suscripción, mes del cargo y corte. Requiere evidencia válida y un solo cargo coincidente; conserva la tarifa mensual, los demás cortes y los comprobantes históricos sin esa marca. No crea un gasto adicional ni un ingreso ficticio por el descuento. La fecha programada del cálculo financiero se conserva; la evidencia mantiene las fechas bancarias reales.

Cada fila muestra producto, corte, meta y faltante. **Desglose** distingue compras, suscripciones confirmadas, cargos excluidos y previstos, y enlaza las condiciones oficiales. El indicador no representa el pago mínimo ni sustituye el pago para no generar intereses.

Los dos campos JSON son opcionales y se agregan con la migración aditiva `20261011000000_add_card_usage_verification`. Aplicar con `prisma migrate deploy`, regenerar Prisma y reiniciar el servidor. La evidencia inicial y su verificación están en `estados_cuenta/consumo_minimo/`; no hay dependencia de esos archivos privados durante la ejecución. En conciliaciones futuras, actualizar estos metadatos junto con la evidencia del nuevo corte y preservar las notas de origen.

### PWA / modo offline

La app puede instalarse como PWA y soporta captura offline de gastos diarios en `/gastos`.

Archivos principales:
- `public/manifest.webmanifest`: metadata de instalación (`start_url: /gastos`, `display: standalone`, icono).
- `public/sw.js`: service worker propio. Cachea shell básico (`/`, `/gastos`, manifest, icono), assets estáticos de Next y respuestas GET relevantes (`/api/gastos/bootstrap`, `/api/expenses`) con estrategia network-first.
- `src/components/pwa/ServiceWorkerRegistration.jsx`: registra `/sw.js` desde el layout raíz.
- `src/lib/offlineExpenses.js`: cola local por usuario en `localStorage` (`afp:offline-expenses:{userId}`).
- `src/components/gastos/GastosContent.jsx`: integra lectura de cache, alta offline, visualización de pendientes y sincronización.

Flujo:
- El usuario debe abrir `/gastos` con internet al menos una vez en el dispositivo para cachear shell y datos iniciales (categorías, tarjetas, personas, cuentas, suscripciones y gastos del día).
- Si no hay conexión, los gastos nuevos se guardan en `localStorage` como pendientes y aparecen en la tabla con badge `Pendiente` / `En cola`.
- Al recuperar conexión, la pantalla intenta sincronizar automáticamente la cola contra `POST /api/expenses`. También hay botón manual `Reintentar`.
- Si un gasto falla por validación del servidor, permanece en la cola con `lastError`; no se descarta silenciosamente.
- Los pendientes offline solo existen en ese navegador/dispositivo hasta sincronizarse con Supabase.

Alcance actual:
- Soportado offline: crear gastos diarios desde `/gastos`.
- No soportado offline: editar/borrar gastos, alta/edición de catálogos, tarjetas, ingresos, suscripciones, cuentas por cobrar/pagar, dashboard. Esas operaciones requieren conexión.
- La lógica offline no escribe directamente en Supabase ni cambia el schema; solo reintenta el mismo contrato de `POST /api/expenses`.

### Reglas de BD

- No ejecutar `migrate reset` ni `db push` en ambiente compartido/productivo.
- Usar `prisma migrate deploy` para aplicar migraciones.
- Migraciones en `prisma/migrations/` — no modificar manualmente.
- No subir `.env` ni `.env.local` al repositorio.

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=          # conexión PostgreSQL para Prisma
```

> No subir estos valores al repo.

---

## Mapa rápido del repositorio

```
afp/
├── prisma/
│   ├── schema.prisma              → modelos Prisma (fuente de verdad de BD)
│   └── migrations/                → migraciones versionadas
├── public/
│   ├── manifest.webmanifest       → manifest PWA
│   ├── sw.js                      → service worker PWA/offline
│   └── icons/app-icon.svg         → icono instalable
├── src/
│   ├── app/
│   │   ├── layout.js              → layout raíz (Toaster, fuentes, dark mode)
│   │   ├── page.js                → redirect/home
│   │   ├── login/page.js          → auth Supabase
│   │   ├── gastos/page.js
│   │   ├── dashboard/page.js
│   │   ├── compras-a-meses/page.js
│   │   ├── suscripciones/page.js
│   │   ├── ingresos/page.js
│   │   ├── cuentas-por-cobrar/page.js
│   │   ├── cuentas-por-pagar/page.jsx
│   │   ├── tarjetas/page.js
│   │   ├── configuracion/page.js
│   │   └── api/                   → API routes (ver tabla arriba)
│   ├── actions/                   → server actions / helpers de API
│   │   ├── expenses.js
│   │   ├── cards.js
│   │   ├── cardCycles.js
│   │   ├── installmentPurchases.js
│   │   ├── subscriptions.js
│   │   ├── incomes.js
│   │   ├── receivables.js
│   │   └── settings.js
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppSidebar.jsx     → sidebar con nav + logout (Supabase)
│   │   │   └── AppShell.jsx       → shell que envuelve contenido con sidebar
│   │   ├── pwa/
│   │   │   └── ServiceWorkerRegistration.jsx → registro de service worker
│   │   ├── ui/                    → componentes shadcn locales (incl. data-table.jsx)
│   │   ├── gastos/GastosContent.jsx
│   │   ├── dashboard/DashboardContent.jsx
│   │   ├── compras-a-meses/ComprasAMesesContent.jsx
│   │   ├── suscripciones/SuscripcionesContent.jsx
│   │   ├── ingresos/IngresosContent.jsx
│   │   ├── cuentas-por-cobrar/CuentasPorCobrarContent.jsx
│   │   ├── cuentas-por-pagar/CuentasPorPagarContent.jsx
│   │   ├── tarjetas/TarjetasContent.jsx
│   │   ├── tarjetas/CyclesDataTable.jsx  → Data Table de ciclos + Dialogs de acciones
│   │   ├── tarjetas/CycleBreakdown.jsx   → desglose de cálculo por ciclo
│   │   └── configuracion/SettingsContent.jsx
│   ├── hooks/
│   │   └── use-mobile.js
│   └── lib/
│       ├── prisma.js              → PrismaClient singleton
│       ├── supabase.js            → Supabase client
│       ├── utils.js               → cn() utility
│       ├── dates.js               → utilidades de fecha
│       ├── money.js               → utilidades de formato monetario
│       ├── offlineExpenses.js     → cola local de gastos offline
│       ├── validations.js         → validaciones Zod compartidas
│       └── calculations/          → lógica de cálculo por módulo
│           ├── cardCycles.js
│           ├── dashboard.js
│           ├── installments.js
│           └── receivables.js
```

---

## Componentes UI (shadcn local)

Todos en `src/components/ui/`. No importar desde paquete externo — son locales.

Disponibles: `button`, `input`, `label`, `select`, `textarea`, `card`, `tabs`, `badge`, `table`, `data-table`, `dropdown-menu`, `separator`, `dialog`, `alert-dialog`, `sonner`, `spinner`, `tooltip`, `skeleton`, `sheet`, `sidebar`, `alert`, `chart`.

**Reglas:**
- `toast` siempre desde `@/components/ui/sonner` (o re-export de `sonner`). No importar `sonner` directamente si ya hay wrapper local.
- Botones destructivos siempre con `AlertDialog` de confirmación antes de ejecutar borrado.
- No recrear componentes similares a shadcn fuera de `src/components/ui/`.

---

## Comandos

```bash
# Instalar dependencias
npm install

# Dev (puerto 3000)
npm run dev

# Build (incluye prisma generate)
npm run build

# Lint
npm run lint
```

### Prisma (desde raíz del proyecto)

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma studio          # explorador visual de BD
```

---

## Convenciones de código

- **Lenguaje**: JavaScript (no TypeScript) — usar JSDoc si se necesitan tipos
- **Idioma del código**: inglés (variables, funciones, archivos)
- **Idioma UI/comentarios**: español
- **Nomenclatura**: camelCase variables/funciones · PascalCase componentes · kebab-case rutas y carpetas
- Formularios con React Hook Form + Zod
- UI exclusivamente con componentes en `src/components/ui/`
- No usar `any` ni apagar linting salvo caso justificado

---

## Deploy

Pendiente por confirmar: plataforma de deploy (Vercel u otra), pipeline CI/CD, ambientes dev vs prod.

---

## Reglas para futuras sesiones de Claude Code

1. **Leer README.md antes de modificar el proyecto.**
2. Si una tarea cambia arquitectura, módulos, modelos Prisma, rutas, convenciones o flujo de deploy → **actualizar README.md en la misma tarea**.
3. No agregar secretos, tokens, passwords ni URLs privadas al README.
4. No modificar producción sin confirmación explícita del usuario.
5. Para cambios de BD: explicar si la migración es destructiva o aditiva antes de ejecutar.
6. Para cambios de BD: no ejecutar `migrate reset` ni `db push` en ambientes compartidos.
7. Para cambios de UI: usar componentes existentes en `src/components/ui/`. No duplicar.
8. Si hay duda sobre borrar datos o archivos → detenerse y pedir confirmación.
9. Este proyecto es JavaScript, no TypeScript. No convertir archivos a `.ts`/`.tsx` salvo instrucción explícita.
