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

Iconos de instalación:
- `public/icons/app-icon.svg` es la fuente vectorial del símbolo de cartera, con fondo oscuro opaco y acento verde. No contiene texto pequeño ni depende de fuentes.
- El manifest utiliza PNG de 192, 512 y 1024 px, y una variante de 512 px con `purpose: "maskable"` cuyo símbolo queda dentro de la zona segura circular de Android. La imagen ocupa todo el fondo; el sistema aplica el recorte exterior.
- El layout declara `apple-touch-icon-v3.png` de 180 px para iPhone/iPad, y el favicon del proyecto incluye tamaños de 16 a 256 px con el mismo símbolo.
- `npm run icons:generate` vuelve a exportar los PNG y el ICO desde el SVG mediante Sharp, declarado como dependencia de desarrollo. Al cambiar el diseño, actualizar la versión de las rutas de los iconos, sus referencias en manifest/layout y `CACHE_NAME` del service worker para renovar la caché.
- Los iconos se precachean con el shell. Las instalaciones existentes pueden conservar la imagen anterior; una reinstalación se hace después de sincronizar cualquier gasto pendiente guardado en el dispositivo.

Referencias: [iconos y zona segura de PWA](https://web.dev/learn/pwa/web-app-manifest#icons), [metadata de iconos en Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons).

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
│   └── icons/                     → fuente SVG e iconos PNG de instalación
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

Disponibles: `button`, `input`, `number-input`, `create-record-surface`, `input-group`, `label`, `select`, `radio-group`, `command`, `responsive-select`, `searchable-select`, `payment-method-selector`, `textarea`, `calendar`, `popover`, `date-picker`, `card`, `tabs`, `badge`, `table`, `data-table`, `dropdown-menu`, `separator`, `dialog`, `alert-dialog`, `sonner`, `spinner`, `tooltip`, `skeleton`, `sheet`, `sidebar`, `alert`, `chart`, `collapsible`, `progress`, `empty`, `item`.

Los componentes base corresponden al registro oficial de shadcn con el estilo `radix-mira` de `components.json`. Mantener JavaScript, los alias locales y la librería de iconos configurada al incorporar actualizaciones. La revisión y sus comprobaciones están en [`docs/shadcn-audit.md`](docs/shadcn-audit.md).

**Reglas:**
- Los importes usan `Input type="number" formatNumber`: `NumberInput` compone `react-number-format` con el mismo control y estilos de shadcn. Muestra miles con coma y decimales con punto mientras se escribe (`9000.50` → `9,000.50`), sin símbolo ni decimales obligatorios. `onChange` entrega el valor sin separadores a los formularios; las API, cálculos y cola offline conservan su contrato numérico. Mantiene el teclado decimal, las etiquetas, refs, estados y restricciones `min`, `max`, `step` y `required`. Los campos de años, días y número de meses/pagos conservan el input numérico nativo.
- Los selectores usan `ResponsiveSelect`. El campo cerrado sigue la escala de `Input`: altura predeterminada de 28 px, texto de 14 px en pantallas pequeñas y 12 px desde 768 px. En la variante con panel inferior, una extensión transparente añade área táctil hasta 44 px sin agrandar el borde visible. En pantallas menores de 768 px o con puntero principal táctil abre un `Sheet` inferior: altura ajustada al contenido, máximo del 70 % de la pantalla, filas, buscador y cierre de al menos 48 px y desplazamiento interno de la lista. Los paneles con buscador enfocan su campo de búsqueda inmediatamente al abrir; los que no tienen buscador enfocan el título. `visualViewport` adapta el panel al teclado. En escritorio usa el `Select` oficial cuando no hay búsqueda y `Popover` + `Command` cuando la hay. Las opciones reciben `{ value, label, pinned?, disabled? }`; conserva los IDs, etiquetas, estado deshabilitado y manejadores `onValueChange`. La detección mantiene una instantánea de servidor estable para respetar la hidratación.
- `ResponsiveSelect` conserva el orden recibido; `sortOptions` permite ordenar alfabéticamente con opciones `pinned` al principio. `searchable` admite `false` (predeterminado), `true` y `"auto"`: activa la búsqueda con más de ocho opciones no fijadas. La presentación se conserva mientras el panel está abierto. La búsqueda ignora acentos y mayúsculas. `SearchableSelect` es la composición que aplica búsqueda automática y orden alfabético a categorías, personas, suscripciones y cuentas. Tarjetas y tipos de ingreso también usan búsqueda automática; meses, estados, frecuencias y tamaños de página conservan su orden y no muestran buscador.
- Efectivo/Tarjeta usa `PaymentMethodSelector`, una composición de `RadioGroup` con ambas opciones visibles en una fila sin fondo envolvente, texto de 12 px como las etiquetas del formulario y círculos de 14 px, en captura y edición de Gastos y Suscripciones. En escritorio la fila mide 28 px como los inputs; en pantallas menores de 768 px o con puntero principal táctil, las áreas de selección tienen al menos 48 px. La etiqueta del grupo lleva `id="${id}-label"`. Los valores siguen siendo `CASH` y `CARD`; seleccionar Efectivo limpia la tarjeta asociada.
- Los formularios de alta usan `CreateRecordSurface`: en pantallas menores de 768 px o con puntero principal táctil, un Dialog canónico se abre al entrar y enfoca su contenedor, sin enfocar inputs. Al guardar permanece abierto, limpia los datos del registro y vuelve al inicio del cuerpo; cerrar conserva el borrador. El botón fijo de apertura usa contorno y signo +; guardar usa estilo primario y disquete; «Cerrar» devuelve el foco al botón de apertura. Cuerpo desplazable, acciones visibles y adaptación a `visualViewport`. Los errores de alta se anuncian dentro del formulario; guardar bloquea nuevos envíos, edición de campos y cierre. Si falla el refresco tras un POST exitoso, se informa que el registro ya se guardó, sin ofrecer el envío como fallido. Los avisos de éxito se muestran arriba en móvil. En escritorio se mantiene la captura integrada. Se aplica a Gastos, Compras a meses, Suscripciones, Ingresos y Cuentas por cobrar/pagar. Tarjetas y Configuración conservan sus formularios integrados también en móvil, dentro de sus pestañas; no abren diálogos de alta ni muestran acciones fijas de captura.
- Tras guardar, Compras a meses conserva tarjeta/fecha/categoría; Suscripciones conserva método/tarjeta/categoría/frecuencia/mes y año de inicio; Ingresos conserva fecha/tipo; Cuentas por cobrar/pagar conserva persona/fecha de origen. Se limpian conceptos, importes, notas y relaciones específicas del registro; los meses y pagos previos de una compra y el día de cobro de una suscripción se vuelven a capturar. Tarjetas limpia todos sus campos. Configuración limpia solo los campos del catálogo guardado.
- En Gastos, `ExpenseCreateSurface` presenta la captura en un `Dialog` canónico de shadcn cuando la pantalla es menor de 768 px o el puntero principal es táctil. Al entrar en la página, el diálogo se abre automáticamente con foco en su contenedor, sin enfocar ningún campo; los primeros campos son Concepto, Monto y Categoría. Después de cerrarlo, permanece cerrado hasta pulsar la acción fija «Nuevo gasto» o volver a entrar en la página. El cuerpo se desplaza dentro del diálogo y `visualViewport` adapta el espacio disponible; las acciones permanecen visibles. Cerrar conserva el borrador. Guardar correctamente mantiene el diálogo abierto, actualiza la lista, limpia Concepto/Monto/Notas y las relaciones opcionales, conserva fecha/método/tarjeta/categoría y vuelve al inicio del cuerpo para agilizar la siguiente captura, sin enfocar automáticamente ningún input. «Guardar gasto» usa un icono de disquete y el estilo primario; «Nuevo gasto» usa el signo + y el estilo de contorno. «Cerrar» termina la captura y devuelve el foco al botón de apertura. Los errores aparecen dentro del formulario y conservan los datos para reintentar. El guardado en curso bloquea acciones duplicadas y cierre. En escritorio con puntero fino se mantiene el formulario integrado. Los avisos de guardado se muestran arriba en móvil para dejar libres las acciones del diálogo; los demás avisos se sitúan por encima de la acción fija.
- `toast` siempre desde `@/components/ui/sonner` (o re-export de `sonner`). No importar `sonner` directamente si ya hay wrapper local.
- Los campos de fecha usan `DatePicker` de `src/components/ui/date-picker.jsx`. En dispositivos con interacción táctil principal (`pointer: coarse`, incluidos celulares y la PWA instalada) usa `Input type="date"` para abrir el selector nativo del navegador o sistema; en escritorio usa `Popover` y `Calendar` de shadcn, con encabezado sin selectores y navegación por flechas. La detección no depende del ancho de pantalla y respeta la hidratación de React. Recibe y devuelve fechas `YYYY-MM-DD`; usar `clearable` en fechas opcionales que el usuario pueda borrar.
- Botones destructivos siempre con `AlertDialog` de confirmación antes de ejecutar borrado.
- Los paneles desplegables usan `Collapsible`; las barras de progreso, `Progress`; los avisos, `Alert`; las listas de registros, `Item`; los estados sin datos, `Empty`.
- Las gráficas usan `ChartContainer`, `ChartTooltipContent` y `ChartLegendContent` con la configuración y tokens del wrapper local. `DataTable` compone los controles shadcn con TanStack Table; el ordenamiento usa `Button` dentro del encabezado.
- Cada campo debe tener una etiqueta asociada o un nombre accesible; cada botón de icono, `aria-label`. Los diálogos incluyen título y descripción. Cuando se abren desde tablas o listas mediante estado, usar `useDialogFocus` para devolver el foco al botón de origen.
- No recrear componentes similares a shadcn fuera de `src/components/ui/`.

---

## Comandos

### Pruebas desde el emulador Android

Con el servidor de desarrollo ejecutándose en el puerto 3000, abrir `http://10.0.2.2:3000/gastos` en Chrome del emulador. `next.config.mjs` incluye `10.0.2.2` en `allowedDevOrigins` para permitir la conexión de desarrollo de Next.js. Sin esta entrada, el HTML puede mostrar el skeleton mientras la conexión `/_next/webpack-hmr` queda bloqueada y React no termina de activar la pantalla. Al cambiar esta configuración, el servidor de desarrollo debe reiniciarse; Next.js detecta el archivo y lo reinicia automáticamente.

La sesión pertenece al origen del navegador: si todavía no se ha iniciado sesión desde esa dirección, la app abre `/login`. Las pruebas usan los datos y la sesión propios del emulador.

```bash
# Instalar dependencias
npm install

# Dev (puerto 3000)
npm run dev

# Build (incluye prisma generate)
npm run build

# Lint
npm run lint

# Regenerar iconos de instalación desde el SVG
npm run icons:generate
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
