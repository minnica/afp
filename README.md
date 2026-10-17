# AFP — Control de Gastos (garatachia)

> Fuente principal de contexto del proyecto. Leer antes de hacer cambios.

---

## Descripción del proyecto

App web personal de finanzas personales. Single Next.js app (no monorepo).
Manejo de gastos diarios, tarjetas de crédito, compras a meses, suscripciones, ingresos, cuentas por cobrar y cuentas por pagar.
Auth por Supabase. DB PostgreSQL vía Prisma + Supabase. Modo oscuro forzado.

---

## Módulos (rutas)

La página inicial es `/dashboard`: `/` redirige allí, el login navega al Dashboard tras autenticar y el manifest de la PWA lo declara como `start_url`.

| Ruta | Componente principal | Descripción |
|---|---|---|
| `/gastos` | `GastosContent.jsx` | Registro y gestión de gastos diarios |
| `/dashboard` | `DashboardContent.jsx` | Resumen financiero del período |
| `/analisis` | `AnalysisContent.jsx` | Comparativos mensuales por semana, tarjeta y categoría |
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
- **UI**: shadcn/ui (componentes locales en `src/components/ui/`) + Radix UI + Tailwind CSS v4; el Combobox oficial usa Base UI para la selección múltiple
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
| `GET/POST /api/subscription-charges` | `src/app/api/subscription-charges/route.js` — cobros mensuales y acciones confirmar/omitir/restaurar; valida la sesión Supabase mediante Bearer |
| `GET /api/receivables` | `src/app/api/receivables/route.js` |
| `GET /api/payables` | `src/app/api/payables/route.js` |
| `GET /api/dashboard` | `src/app/api/dashboard/route.js` | Incluye comparativos por mes y categoría, `cardUsageWaiversCurrent` para consumo mínimo vigente y `cardUsageWaiverHistory` para cortes terminados; conserva `cardUsageWaivers` y `cardUsageWaiversByMonth` |
| `GET/POST/DELETE /api/notice-dismissals` | `src/app/api/notice-dismissals/route.js` | Preferencias mensuales de avisos ocultos; exige sesión Supabase mediante Bearer y obtiene el usuario del token |
| `GET /api/settings` | `src/app/api/settings/route.js` |
| `POST /api/setup-user` | `src/app/api/setup-user/route.js` |

---

### Autenticación y autorización de API (A01)

Todas las rutas de `src/app/api/`, incluido `/api/gastos/bootstrap` y `/api/setup-user`, exigen `Authorization: Bearer <access_token>`. `src/lib/apiAuth.js` valida el token con `supabase.auth.getUser(token)` antes de leer el cuerpo o consultar Prisma. Sin token o con token inválido/vencido responde **401**. La identidad procede exclusivamente del usuario validado; cualquier `userId` enviado en URL o cuerpo se ignora. `setup-user` también obtiene el correo de esa identidad.

- Las consultas se limitan al propietario. Editar o borrar usa conjuntamente ID y `userId`, también en las actualizaciones indirectas de cuentas. Un registro ajeno o inexistente devuelve **404**; no revela su existencia.
- Antes de escribir se verifica que tarjeta, categoría, persona, tipo de ingreso, suscripción y cuentas vinculadas pertenezcan al mismo usuario. Los IDs del cuerpo deben ser cadenas, nunca filtros de Prisma. El propietario no es editable desde la API.
- `src/lib/apiFetch.js` adjunta el token vigente a todas las llamadas del cliente y conserva headers, cuerpo y cancelación. Comprueba la cuenta esperada por la pantalla; la cola offline verifica además su propietario antes de cada envío. Si falta la sesión o cambió la cuenta, conserva los pendientes.
- Las respuestas de API usan `Cache-Control: private, no-store` y `Vary: Authorization`. El service worker v4 no intercepta rutas `/api/`, ni como navegación, y elimina la caché anterior al activarse. El respaldo local de Gastos sigue separado por usuario.
- Prisma continúa accediendo desde el servidor; estas comprobaciones son obligatorias aunque RLS esté activo. La corrección no cambia tablas, políticas RLS ni migraciones y conserva la denegación pública existente.

Regresiones: `node --test tests/*.test.cjs`. `tests/api-authorization.test.cjs` ejecuta todas las rutas con Auth y persistencia simulados, verifica acceso anónimo, tokens inválidos, suplantación de identidad, aislamiento entre dos usuarios, CRUD propio y referencias ajenas. `tests/api-fetch.test.cjs` cubre renovación de tokens, cambio de cuenta, cola offline y exclusión de API del service worker. Estas pruebas no escriben en Supabase ni sustituyen una prueba integrada con dos cuentas reales en un ambiente aislado. El despliegue a producción requiere autorización explícita.

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
| `SubscriptionCharge` | `subscription_charges` | Decisión por suscripción y mes: confirmada con un gasto vinculado, u omitida |
| `ReceivableAccount` | `receivable_accounts` | Cuentas por cobrar |
| `PayableAccount` | `payable_accounts` | Cuentas por pagar (simple o préstamo) |
| `Income` | `incomes` | Ingresos registrados |
| `NoticeDismissal` | `notice_dismissals` | Aviso concreto oculto por usuario y mes calendario; no modifica registros financieros |

### Enums relevantes

- `PaymentMethod`: `CASH` | `CARD`
- `SubscriptionChargeStatus`: `CONFIRMED` | `SKIPPED`
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

### Cobros de suscripciones — previstos y confirmados

En `/gastos`, `SubscriptionCharges` presenta un botón de icono junto a «Gastos filtrados», con un contador discreto solo cuando hay cobros por confirmar. Su nombre accesible y Tooltip describen la acción; los errores de consulta se indican con una insignia. Abre un Dialog de shadcn con los selectores `ResponsiveSelect` de mes y año, como los controles de otras páginas. Los cobros usan filas planas de `Item` y `ItemSeparator`, con nombre, importe, fecha abreviada y método. La acción de confirmar es un botón de verificación con Tooltip y nombre accesible; el menú conserva Ajustar y Omitir este mes. Se muestra un único resumen de pendientes y total, sin repetir etiquetas en cada fila. «Historial» reutiliza `DisclosureButton` y `Collapsible`, con los estados Registrado, Estado de cuenta y Omitido; se abre inicialmente cuando no hay pendientes. «Ajustar» cambia la vista dentro del mismo diálogo y ofrece Volver, monto y fecha; la confirmación de omisión conserva su `AlertDialog`.

El contenido se desplaza y el encabezado y cierre permanecen visibles. El foco inicial y los cambios de vista no abren el teclado; cerrar devuelve el foco al botón. Al cerrar se vuelve al mes actual para que el contador corresponda a ese mes. Las acciones táctiles miden al menos 44 px y no hay una sección desplegada sobre la lista de gastos.

Al llegar el día de cobro local aparece automáticamente como **Por confirmar**; se respetan frecuencia, inicio, desactivación y último día del mes para cobros del 29 al 31. Se consulta al abrir, recuperar foco/conexión y cambiar el día. Los meses anteriores se revisan con el selector. Los pendientes se calculan al consultar, sin cron ni escrituras al abrir la página.

- **Confirmar cobro** registra un `DailyExpense` con los datos de la suscripción. «Ajustar importe o fecha» permite corregir solo esa ocurrencia; conserva la tarifa recurrente. Se puede confirmar un cobro atrasado en otro mes sin consumir el siguiente cobro previsto.
- **Omitir este mes** pide confirmación y omite únicamente esa ocurrencia de los importes previstos y avisos. La suscripción sigue activa. «Restaurar» vuelve a dejarla pendiente.
- «Historial» muestra los resueltos y distingue los respaldados por estado de cuenta. Un gasto vinculado existente o evidencia bancaria válida identifica un cobro ya confirmado; no crea un segundo gasto. La evidencia documental conserva su importe histórico.
- Los pendientes mantienen el tratamiento previsto de los cálculos existentes y no acreditan consumo mínimo confirmado. Confirmar sustituye la previsión por el gasto real; omitir retira la previsión. Dashboard, Tarjetas y análisis mensual usan la misma identidad suscripción/mes.
- `subscriptionCharges.js` contiene las reglas de calendario y conciliación. `subscriptionChargeService.js` bloquea la fila de la suscripción y crea gasto + decisión en una transacción. La unicidad por suscripción/mes y los reintentos idempotentes evitan duplicados entre pestañas y altas manuales vinculadas. Editar conserva el vínculo de un cobro confirmado; eliminar el gasto vuelve a dejarlo pendiente, salvo que exista evidencia bancaria.
- Las acciones requieren conexión. Los botones táctiles miden al menos 44 px; errores y confirmaciones aparecen dentro de la sección o diálogo. El éxito desaparece a los tres segundos. Las respuestas tardías de otro mes se descartan.

La migración **aditiva** `20261016000000_add_subscription_charges` agrega un enum, la tabla de decisiones, sus índices y relaciones. No modifica ni elimina gastos existentes. Activa RLS sin políticas públicas; la nueva API valida el usuario de la sesión e ignora el `userId` del cliente. Aplicar `prisma migrate deploy` y regenerar Prisma **antes de ejecutar esta versión**, porque Dashboard y Tarjetas también consultan las decisiones. No aplicar a producción sin confirmación explícita.

Las pruebas unitarias están en `tests/subscription-charges.test.cjs`, con regresiones adicionales de Dashboard, ciclos y consumo mínimo. `tests/subscription-charges-integration.test.cjs` comprueba transacciones y concurrencia con PostgreSQL cuando se configura `AFP_TEST_DATABASE_URL`: solo admite localhost y una base cuyo nombre empiece por `afp_test`, con las migraciones aplicadas; sin esa variable se omite. No usar la base personal para estas pruebas.

### Compras a meses (MSI) — cálculo de cuota actual

`InstallmentPurchase` no guarda la cuota actual; se calcula dinámicamente en cada ciclo a partir de `purchaseDate` y el `usualCutDay` de la tarjeta. Dashboard y Tarjetas comparten `src/lib/calculations/cardCycles.js` (`getPurchaseCycleNumber` / `shouldIncludePurchaseInCycle`):

- `firstCycleIndex`: ciclo (año*12+mes) donde cae la primera cuota — el mismo mes de `purchaseDate` si la fecha es **antes o igual** al `usualCutDay`, o el mes siguiente si es posterior.
- `currentMonth` de un ciclo objetivo = `(targetCycleIndex - firstCycleIndex) + 1`.
- Se incluye en el ciclo solo si `1 <= currentMonth <= months` (y, para `ACTIVE`, si `purchaseDate` no es posterior al `cutDate` del ciclo).
- `initialPaymentsMade` **no** se usa para este cálculo — solo sirve como ancla en `getNextPaymentDueDate` (`ComprasAMesesContent.jsx`). Antes el cálculo mezclaba un valor dinámico con un fallback estático `initialPaymentsMade + 1`, lo que dejaba la cuota "congelada" en vez de avanzar mes a mes (y de excluirse al completarse).
- La ausencia de ciclos anteriores en la BD no desplaza la primera cuota. Listado, detalle y dashboard usan la misma numeración; las compras liquidadas conservan únicamente sus cuotas históricas dentro de plazo.

### Desgloses — consistencia de importes y períodos

- `cardCycles.js` calcula una vez las partidas y sus subtotales para ambas API. Los límites incluyen el día UTC completo, incluso cuando un gasto histórico tiene una hora distinta a la del corte.
- Cada importe se redondea a centavos antes de sumarlo, de modo que las partidas visibles sumen exactamente al subtotal. Las cuotas sin referencia bancaria siguen siendo estimaciones.
- Las suscripciones se incluyen por la fecha del cobro y su frecuencia, no por el mes del corte. Un gasto con `subscriptionId` sustituye la previsión de esa suscripción y mes. Las categorías y comparativos mensuales aplican la misma deduplicación, aunque haya cambiado el método de pago o la categoría.
- Un estado de cuenta de cero es un importe confirmado; no se sustituye por el cálculo estimado. El desglose de Tarjetas muestra cargos, bonificaciones, total calculado, estado de cuenta y diferencia cuando corresponda.
- `cycleDataQuality.js` detecta fechas de ciclos superpuestas o días sin cubrir. En dashboard, un icono de ayuda junto a “Pagos de tarjetas” abre un popover con las tarjetas y fechas por confirmar del mes seleccionado; se oculta cuando no hay pendientes. Los desgloses de Tarjetas conservan el detalle. No reasigna movimientos ni corrige fechas bancarias automáticamente. Los avisos y las diferencias requieren conciliación con evidencia.
- Consumo mínimo mantiene separado su período bancario verificado. Si un gasto vinculado contradice el importe de un comprobante de suscripción, la partida queda por revisar y no confirma la exención. Los metadatos inválidos no interrumpen el dashboard.
- `node --test tests/*.test.cjs` ejecuta las regresiones de cálculos, referencias, bonificaciones y desgloses. `python3 scripts/audit-card-breakdowns.py <directorio-evidencia> [antes|despues]` contrasta un snapshot de solo lectura (`snapshot.json`) con respuestas guardadas de las API (`tarjetas-<fase>.json`, `dashboard-<fase>.json`) mediante aritmética decimal independiente; conserva las discrepancias bancarias como pendientes de conciliación. Los archivos con datos personales permanecen en `estados_cuenta/`, excluido de Git.

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

### Análisis

`/analisis` comienza directamente con el selector de mes y las vistas Semanas, Tarjetas y Categorías. Conserva el mes al cambiar de vista y el filtro de categoría al volver a Semanas. Las comparaciones semanales y por categoría usan meses calendario; Tarjetas usa meses de corte.

- Categorías muestra inicialmente las cinco de mayor gasto del mes elegido con barras horizontales; «Ver todas» permite consultar el resto. Los importes de ambos meses se consultan en los tooltips de las barras, con valores completos e identificación de los estimados cuando corresponde. Los totales mensuales se muestran en el resumen de Semanas.
- La página usa `useAnalysis` sobre `DashboardProvider` y el contrato existente de `GET /api/dashboard`, con carga diferida de las gráficas, skeleton propio y recuperación de errores. `categoryBreakdownByMonth[-1]` contiene diciembre del año anterior para comparar enero correctamente.
- Análisis se abre desde la navegación compartida y concentra los tres comparativos. Dashboard conserva avisos, consumo mínimo y pagos de tarjetas con su presentación original; no carga las gráficas ni sus placeholders. Tarjetas mantiene su presentación y sus flujos originales.

### Dashboard — selección de mes en Pagos de tarjetas

En «Pagos de tarjetas», el Dashboard móvil sustituye las pestañas de los doce meses por `ResponsiveSelect`, con el nombre completo del mes y el año, y un área táctil de 44 px. Empieza en el mes en curso; al abrir el panel inferior, la opción seleccionada queda visible sin recorrer desde enero. Cambiar de mes actualiza los pagos y los avisos de fechas del período. La selección se conserva al cambiar entre celular y escritorio, donde se mantienen las pestañas. Las listas sin buscador de `ResponsiveSelect` también abren alrededor de su opción seleccionada, conservando el orden y el foco en el título del panel.

En móvil y escritorio, Dashboard muestra un único importe por tarjeta y destaca el límite de pago. `getDashboardPayment`, en `cardPaymentPresentation.js`, usa el estado de cuenta capturado desde el día de corte; antes del corte o sin estado capturado, muestra el calculado identificado como «Estimado». Un estado de cero es válido. El día UTC almacenado del corte se compara con el día local del usuario; las fechas visibles conservan el día UTC bancario. La comparativa entre calculado y estado de cuenta queda en Tarjetas, también en las filas de su tabla de escritorio.

El límite de pago del Dashboard móvil muestra primero el tiempo relativo y luego la fecha: «Es en 8 días [22 octubre]», «Es hoy [14 octubre]» o «Fue hace 2 días [12 octubre]». Para una diferencia de un día usa «Es mañana [15 octubre]» o «Fue ayer [13 octubre]», también en los avisos que comparten el formato. Cuenta días calendario desde la fecha local y conserva el día bancario UTC; escritorio y las fechas de corte mantienen su formato.

El resumen compacto, compuesto con `Item` y `Separator`, muestra el total del mes y las cargas Q15/Q30 sumadas a centavos con los mismos importes elegidos para las tarjetas. Conserva los ciclos pagados como parte del total del período y su estado «Pagado»; no representa un saldo pendiente ni descuenta pagos parciales. Q15 conserva su indicador cian y Q30 el rosa, correspondientes a los acentos de las tarjetas de cada nómina; los textos identifican también cada grupo.

### Dashboard — consumo mínimo para exentar comisión de tarjeta

En celular (ancho menor de 768 px), Avisos importantes y Consumo mínimo están disponibles permanentemente en la cabecera sticky de todas las secciones, incluso en la cabecera de los formularios de captura abiertos. Son dos botones de 44 px: campana con cantidad de avisos y una meta de consumo. Cada uno abre un Dialog canónico con título, cierre siempre visible y cuerpo desplazable; cerrar devuelve el foco al icono y conserva el borrador de captura. Ambos accesos permanecen disponibles al cargar o cuando no hay datos, con skeleton, estados vacíos y recuperación de errores. Durante el guardado se bloquean junto con la navegación del formulario.

Las descripciones de Avisos importantes separan cada dato en una línea y destacan solo su etiqueta en negrita («Vencido:», «Pago esperado:», etc.). Los valores de «Vencido:», «Vence:» y «Corte:» reutilizan `formatPaymentDeadline` con la fecha del aviso y el día local compartido: «Es en 8 días [22 octubre]», «Es hoy [14 octubre]» o «Fue hace 2 días [12 octubre]». Este formato se comparte entre cortes, pagos de tarjetas, suscripciones en efectivo y cobros. Conservan los títulos e importes, con sus etiquetas de estado de cuenta, calculado o estimado según el aviso. Omiten las explicaciones sobre ingresos, gastos o pagos sin registrar y las instrucciones adicionales de actualización de cortes. El mismo formato se aplica al diálogo móvil y al panel de escritorio; no cambian las condiciones que generan o retiran cada aviso.

Cada aviso es un enlace completo con indicador de navegación y foco visible. Cortes y pagos de tarjeta abren `/tarjetas`; cobros pendientes o programados, `/ingresos`; suscripciones en efectivo, `/gastos`, para registrar el movimiento. En el diálogo móvil, `DialogClose` cierra los avisos al activar el enlace, incluso si el destino es la sección actual. Navegar no guarda ni modifica registros. Los tipos desconocidos conservan el aviso visible sin un destino inventado.

En celular, el menú de tres puntos de cada aviso conocido ofrece «Ocultar este aviso por este mes». Se sitúa en la esquina inferior derecha, con un área táctil de 44 × 44 px separada del título y de la flecha de navegación superior. Solo los detalles reservan espacio a su derecha y una altura mínima para evitar superposiciones en avisos cortos; el título conserva todo el ancho. El menú es independiente del enlace y abre un `AlertDialog` con concepto, fecha, importe y fin de vigencia. «Conservar aviso» recibe el foco inicial; los pagos de tarjeta exigen además marcar que ocultarlos no registra su pago. Confirmar guarda primero la preferencia sincronizada; si falla, el aviso permanece visible y el diálogo permite reintentar. No hay gestos de descarte ni borrado de movimientos.

«Ocultos este mes» se consulta mediante un icono de ojo tachado junto al título de Avisos importantes, con área táctil de 44 × 44 px y un contador secundario. Solo aparece cuando hay ocultos; el contador usa la variante `warning` si incluyen pagos de tarjeta, con la misma información en su nombre accesible. Sustituye al bloque desplegable de la lista principal. Abre una vista dentro del mismo panel, con título «Ocultos este mes», flecha para volver, detalle de los pagos ocultos y acciones «Volver a mostrar». Restaurar el último conserva un estado vacío y el acceso de vuelta; abrir Avisos de nuevo siempre muestra los activos. Cambiar de vista enfoca el título y devuelve el desplazamiento al inicio. `HeaderDialog` admite `contentTitle`, `headerLeading` y `headerActions` para esta composición, conservando el cierre independiente y el uso habitual de Consumo mínimo. Escritorio ofrece el mismo icono y permite recuperar avisos dentro de la tarjeta, conservando la creación de ocultaciones en móvil.

`noticeDismissals.js` identifica cada ocurrencia por tipo, ID y fecha; los cortes próximos y ya realizados comparten identidad, mientras que su pago es independiente. Los cambios de fecha o de importe de un pago de tarjeta vuelven a mostrarlo. La ocultación vence al terminar el mes local en que se confirmó, incluso si el aviso sigue pendiente. Otro cobro del mismo mes y los del mes siguiente se mantienen visibles. `DashboardProvider` comparte las preferencias, aisladas por sesión/mes, actualiza el día al llegar la medianoche y sincroniza al abrir Avisos o recuperar foco/conexión. Si la consulta de preferencias falla, se muestran todos los avisos y se deshabilita ocultar hasta recuperar la sincronización; la API del dashboard conserva todos los avisos originales.

La migración **aditiva** `20261015000000_add_notice_dismissals` agrega únicamente la tabla de preferencias y sus índices. Activa RLS sin políticas públicas: la tabla se consulta a través de la API autenticada con Prisma, sin acceso directo desde PostgREST. Aplicar con `prisma migrate deploy` y regenerar Prisma antes de usar la función; no cambia saldos, pagos, cobros ni ciclos. No aplicar a producción sin confirmación explícita. Las preferencias se consultan por el usuario validado en Supabase; el endpoint ignora cualquier `userId` enviado por el cliente.

`DashboardProvider`, montado en el layout raíz, comparte la respuesta de `GET /api/dashboard` entre las consultas de todas las cabeceras, Dashboard y Análisis. Reutiliza peticiones en curso, actualiza la información al cambiar de sección móvil, recuperar el foco o la conexión y abrir una consulta, y descarta respuestas canceladas al cambiar de usuario. No consulta desde el login. Los headers de escritorio se mantienen sin estos accesos y las otras secciones de escritorio no hacen esta carga. Consumo mínimo conserva el mes/año del Historial al navegar entre secciones; cada apertura del diálogo comienza en «En curso». Tocar una fila abre el desglose y cerrar devuelve el foco a esa fila. Los paneles se reutilizan desde `DashboardPanels.jsx`; consumo mínimo se implementa en `CardUsageWaiverProgress.jsx`. Dashboard móvil empieza con Pagos de tarjetas; escritorio conserva ambas secciones integradas.

Consumo mínimo usa `Tabs` con «En curso» e «Historial», en el diálogo móvil y en la sección de escritorio. En celular, las pestañas comparten la misma fila del título y el cierre de `HeaderDialog`, mediante `headerActions`, fuera del cuerpo desplazable. En anchos estrechos, el título puede ocupar dos líneas sin reducir las áreas táctiles ni añadir otra fila de pestañas. Cambiar de pestaña devuelve el cuerpo al inicio. «En curso» reúne un período vigente por tarjeta con mínimo configurado, aunque sus cortes pertenezcan a meses/años distintos; no tiene selector de mes ni de orden. Prioriza las metas pendientes por corte más próximo y nombre. En móvil, cada tarjeta ocupa un `Item` con variante `outline`, separado del siguiente por espacio y sin divisores internos: nombre y faltante en la primera fila, corte y `Progress` debajo. Omite la línea de consumo registrado frente a la meta; sus importes siguen en el Desglose y en la descripción accesible del progreso. La etiqueta es siempre «Corte:», con etiqueta y valor de peso normal. Reutiliza `formatPaymentDeadline` con `includeDate: false`: «Corte: Es hoy», «Corte: Es mañana» o «Corte: Es en 2 días», sin fecha absoluta ni corchetes. Los estados «Revisar fechas» y «Por revisar» usan un `Badge` de advertencia y omiten el faltante y el progreso mientras no se pueda confirmar la meta. Escritorio conserva su lista con consumo registrado frente a la meta; Historial, Desglose, Avisos y Pagos de tarjetas mantienen sus fechas y su presentación.

Los importes previstos/por confirmar se consultan en el Desglose y se omite esa línea en las filas móviles. No se suman al consumo confirmado ni permiten completar la meta sin un gasto vinculado o evidencia del cargo; se conservan la API, los cálculos y su presentación de escritorio. Las metas alcanzadas quedan en un `Collapsible` cerrado al final. Una tarjeta sin período vigente aparece con un `Badge` «Sin período» en móvil y como «Período sin registrar» en escritorio, sin progreso ni importes inventados. «Historial» contiene solo cortes terminados, agrupados por mes y año de corte, con el mes más reciente seleccionado inicialmente y sus filas ordenadas del corte más antiguo al más reciente. Sus fechas conservan el formato absoluto. Una meta histórica no alcanzada conserva «Faltaron $X» y añade un `Badge` tenue en ámbar, «Posible comisión»; los períodos cumplidos o por confirmar no reciben esa etiqueta. El color usa el token semántico `warning` y la variante local homónima de `Badge`.

Las pestañas de consumo mínimo usan la variante `line` de shadcn, como Análisis, con ancho ajustado al texto y altura visible de 32 px. Una extensión transparente conserva un área táctil de 44 px. El subrayado del componente compartido se orienta a partir de `TabsList` para funcionar también cuando el encabezado se monta en el portal del diálogo.

`buildCurrentCardUsageWaivers` y `buildCardUsageWaiverHistory`, en `cardUsageWaivers.js`, reutilizan las reglas de consumo existentes. Seleccionan por `startDate <= fecha local del cliente <= cutDate`, dando prioridad a las fechas bancarias verificadas; incluyen todo el día del corte y pasan al siguiente período al día siguiente. El estado de pago no determina la vigencia. Consultan todos los ciclos almacenados, incluido enero del siguiente año; no generan ni modifican ciclos. Si varios períodos contienen el día actual, muestran «Revisar fechas» y no acreditan una meta ambigua. Los cortes terminados se excluyen de «En curso» independientemente de su cumplimiento o de cargos por confirmar. Se conservan los campos mensuales anteriores de la API para sus otros consumidores.

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

Cada fila muestra el nombre personalizado de la tarjeta; omite el nombre del producto bancario. Tocar la fila abre **Desglose**, que distingue compras, suscripciones confirmadas, cargos excluidos y previstos, y enlaza las condiciones oficiales. El indicador no representa el pago mínimo ni sustituye el pago para no generar intereses.

Los dos campos JSON son opcionales y se agregan con la migración aditiva `20261011000000_add_card_usage_verification`. Aplicar con `prisma migrate deploy`, regenerar Prisma y reiniciar el servidor. La evidencia inicial y su verificación están en `estados_cuenta/consumo_minimo/`; no hay dependencia de esos archivos privados durante la ejecución. En conciliaciones futuras, actualizar estos metadatos junto con la evidencia del nuevo corte y preservar las notas de origen.

### PWA / modo offline

La app puede instalarse como PWA y soporta captura offline de gastos diarios en `/gastos`.

Archivos principales:
- `public/manifest.webmanifest`: metadata de instalación (`start_url: /dashboard`, `display: standalone`, icono).
- `public/sw.js`: service worker propio. Cachea shell básico (`/`, `/gastos`, manifest, icono) y assets estáticos de Next con estrategia network-first. Excluye todas las rutas `/api/`; los datos offline de Gastos usan el respaldo local separado por usuario.
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
│   │   ├── analisis/page.js
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
│   │   ├── analisis/AnalysisContent.jsx   → filtros y vistas de comparativos
│   │   ├── analisis/AnalysisCharts.jsx    → gráficas e importes, carga diferida
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
│   │   ├── use-mobile.js
│   │   └── use-analysis.js         → sesión y carga de Análisis
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

Disponibles: `button`, `field`, `input`, `number-input`, `create-record-surface`, `input-group`, `label`, `select`, `radio-group`, `command`, `responsive-select`, `searchable-select`, `payment-method-selector`, `textarea`, `calendar`, `popover`, `date-picker`, `card`, `tabs`, `badge`, `table`, `data-table`, `record-card`, `dropdown-menu`, `separator`, `dialog`, `header-dialog`, `alert-dialog`, `sonner`, `spinner`, `tooltip`, `skeleton`, `sheet`, `sidebar`, `alert`, `chart`, `collapsible`, `progress`, `empty`, `item`.

Los componentes base corresponden al registro oficial de shadcn con el estilo `radix-mira` de `components.json`. Mantener JavaScript, los alias locales y la librería de iconos configurada al incorporar actualizaciones. La revisión y sus comprobaciones están en [`docs/shadcn-audit.md`](docs/shadcn-audit.md).

**Reglas:**
- En celular (ancho menor de 768 px), «Cambiar sección» abre `MobileNavigationSheet`, una composición del Sheet canónico de shadcn con `side="top"`. Está disponible en `AppHeader`, una cabecera sticky compartida por todas las páginas: mide 48 px en celular y 56 px en escritorio. El acceso móvil usa icono y texto sin fondo ni borde, con un área táctil de 44 px y foco visible. Con un diálogo de alta abierto, la cabecera se mantiene como una superficie independiente por encima de la tarjeta de captura; no ocupa espacio en el encabezado del formulario. Permite navegar en dos toques sin cerrar primero la captura. Muestra los destinos definidos en `src/lib/navigation.js`, con Gastos, Tarjetas, Dashboard y Análisis como primeras opciones en móvil, iconos, enlaces de 48 px, `aria-current` y cierre de sesión. El menú empieza directamente con las secciones; título y descripción quedan solo para lectores de pantalla. «Cerrar menú» aparece en el pie junto a «Cerrar sesión», ambos sin fondo ni borde y con áreas táctiles de 48 px. Enfoca el título accesible sin abrir el teclado; cancelar devuelve el foco y conserva el formulario. La lista se desplaza y `visualViewport` ajusta el panel. Cambiar de página cierra las capas; durante el guardado se bloquea el acceso desde la captura. Escritorio conserva SidebarTrigger y la navegación habitual.
- Los borradores de las seis capturas con diálogo se conservan en la pestaña mediante `useCreationDraft`, separados por usuario y sección. Usa sessionStorage y respaldo en memoria si el almacenamiento está bloqueado. Incluye campos y selecciones de alta, sin afectar edición, filtros, API ni cola offline. Tras guardar se persiste el reinicio habitual del formulario, para no recuperar como borrador un registro ya enviado. La restauración solo se activa en celular; al pasar de escritorio a celular conserva los datos que ya se estaban editando.
- Los importes usan `Input type="number" formatNumber`: `NumberInput` compone `react-number-format` con el mismo control y estilos de shadcn. Muestra miles con coma y decimales con punto mientras se escribe (`9000.50` → `9,000.50`), sin símbolo ni decimales obligatorios. `onChange` entrega el valor sin separadores a los formularios; las API, cálculos y cola offline conservan su contrato numérico. Mantiene el teclado decimal, las etiquetas, refs, estados y restricciones `min`, `max`, `step` y `required`. Los campos de años, días y número de meses/pagos conservan el input numérico nativo.
- Los selectores usan `ResponsiveSelect`. El campo cerrado sigue la escala de `Input`: altura predeterminada de 28 px, texto de 14 px en pantallas pequeñas y 12 px desde 768 px. En la variante con panel inferior, una extensión transparente añade área táctil hasta 44 px sin agrandar el borde visible. En pantallas menores de 768 px o con puntero principal táctil abre un `Sheet` inferior: altura ajustada al contenido, máximo del 70 % de la pantalla, filas, buscador y cierre de al menos 48 px y desplazamiento interno de la lista. Los paneles con buscador enfocan su campo de búsqueda inmediatamente al abrir; los que no tienen buscador enfocan el título. `visualViewport` adapta el panel al teclado. En escritorio usa el `Select` oficial cuando no hay búsqueda y `Popover` + `Command` cuando la hay. Las opciones reciben `{ value, label, pinned?, disabled? }`; conserva los IDs, etiquetas, estado deshabilitado y manejadores `onValueChange`. La detección mantiene una instantánea de servidor estable para respetar la hidratación.
- `ResponsiveSelect` conserva el orden recibido; `sortOptions` permite ordenar alfabéticamente con opciones `pinned` al principio. `searchable` admite `false` (predeterminado), `true` y `"auto"`: activa la búsqueda con más de ocho opciones no fijadas. La presentación se conserva mientras el panel está abierto. La búsqueda ignora acentos y mayúsculas. `SearchableSelect` es la composición que aplica búsqueda automática y orden alfabético a categorías, personas, suscripciones y cuentas. Tarjetas y tipos de ingreso también usan búsqueda automática; meses, estados, frecuencias y tamaños de página conservan su orden y no muestran buscador.
- Efectivo/Tarjeta usa `PaymentMethodSelector`, una composición de `RadioGroup` con ambas opciones visibles en una fila sin fondo envolvente, texto de 12 px como las etiquetas del formulario y círculos de 14 px, en captura y edición de Gastos y Suscripciones. En escritorio la fila mide 28 px como los inputs; en pantallas menores de 768 px o con puntero principal táctil, las áreas de selección tienen al menos 48 px. La etiqueta del grupo lleva `id="${id}-label"`. Los valores siguen siendo `CASH` y `CARD`; seleccionar Efectivo limpia la tarjeta asociada.
- Los formularios de alta usan `CreateRecordSurface`: en pantallas menores de 768 px o con puntero principal táctil, un Dialog canónico se abre al entrar y enfoca su contenedor, sin enfocar inputs. El encabezado muestra solo el título; las descripciones de los formularios de alta y edición usan `sr-only` y no ocupan espacio visual. Al guardar permanece abierto, limpia los datos del registro y vuelve al inicio del cuerpo; cerrar conserva el borrador. El botón fijo de apertura usa contorno y signo +; guardar usa estilo primario y disquete; «Cerrar» devuelve el foco al botón de apertura. Cuerpo desplazable, acciones visibles y adaptación a `visualViewport`. Los errores de alta se anuncian dentro del formulario; guardar bloquea nuevos envíos, edición de campos y cierre. Si falla el refresco tras un POST exitoso, se informa que el registro ya se guardó, sin ofrecer el envío como fallido. Los avisos de éxito se muestran arriba en móvil. En escritorio se mantiene la captura integrada. Se aplica a Gastos, Compras a meses, Suscripciones, Ingresos y Cuentas por cobrar/pagar. Tarjetas y Configuración conservan sus formularios integrados también en móvil, dentro de sus pestañas; no abren diálogos de alta ni muestran acciones fijas de captura.
- Tras guardar, Compras a meses conserva tarjeta/fecha/categoría; Suscripciones conserva método/tarjeta/categoría/frecuencia/mes y año de inicio; Ingresos conserva fecha/tipo; Cuentas por cobrar/pagar conserva persona/fecha de origen. Se limpian conceptos, importes, notas y relaciones específicas del registro; los meses y pagos previos de una compra y el día de cobro de una suscripción se vuelven a capturar. Tarjetas limpia todos sus campos. Configuración limpia solo los campos del catálogo guardado.
- En Gastos, `ExpenseCreateSurface` presenta la captura en un `Dialog` canónico de shadcn cuando la pantalla es menor de 768 px o el puntero principal es táctil. Al entrar en la página, el diálogo se abre automáticamente con foco en su contenedor, sin enfocar ningún campo; los primeros campos son Concepto, Monto y Categoría. En la captura móvil, Enter/Siguiente avanza de Concepto a Monto y después abre Categoría; al confirmar una categoría, se cierra su panel y se abre Fecha mediante showPicker en el mismo gesto del usuario (o el calendario web si corresponde). Si el navegador restringe la apertura nativa, Fecha queda enfocada. Cancelar el selector devuelve el foco a Categoría. Después de cerrarlo, permanece cerrado hasta pulsar la acción fija «Nuevo gasto» o volver a entrar en la página. El cuerpo se desplaza dentro del diálogo y `visualViewport` adapta el espacio disponible; las acciones permanecen visibles. Cerrar conserva el borrador. Guardar correctamente mantiene el diálogo abierto, actualiza la lista, limpia Concepto/Monto/Notas y las relaciones opcionales, conserva fecha/método/tarjeta/categoría y vuelve al inicio del cuerpo para agilizar la siguiente captura, sin enfocar automáticamente ningún input. «Guardar gasto» usa un icono de disquete y el estilo primario; «Nuevo gasto» usa el signo + y el estilo de contorno. «Cerrar» termina la captura y devuelve el foco al botón de apertura. Los errores aparecen dentro del formulario y conservan los datos para reintentar. El guardado en curso bloquea acciones duplicadas y cierre. En escritorio con puntero fino se mantiene el formulario integrado. En la captura móvil de Gastos, Compras a meses, Suscripciones, Ingresos, Cuentas por cobrar y Cuentas por pagar, las confirmaciones de guardado se muestran con Alert dentro del formulario, en una zona reservada sobre las acciones: no cubren la cabecera ni los botones de cierre y no desplazan las acciones al aparecer. La confirmación conserva el icono de verificación y el tratamiento verde de éxito. La región de estado anuncia el resultado sin mover el foco y desaparece automáticamente tras 3 segundos, sin desplazar los botones; también se limpia al intentar otro guardado o cerrar el diálogo. El modo sin conexión indica que el gasto está pendiente de sincronizar. Escritorio conserva el toast de guardado; los demás avisos se sitúan por encima de la acción fija.
- Al guardar un gasto válido en la captura móvil, `ExpenseCreateSurface` habilita `showSavingOverlay` de `CreateRecordSurface`: una capa de pantalla completa compuesta con `Dialog` y el `Spinner` canónicos de shadcn. Anuncia «Guardando gasto», cubre también la cabecera y bloquea la interacción mientras el POST y la actualización de la lista están pendientes. Se retira al terminar o fallar la operación y devuelve el foco al contenedor de captura, sin abrir el teclado. El manejo habitual de errores conserva los datos para reintentar. El formulario expone su estado con `aria-busy`.
- `toast` siempre desde `@/components/ui/sonner` (o re-export de `sonner`). No importar `sonner` directamente si ya hay wrapper local.
- Los campos de fecha usan `DatePicker` de `src/components/ui/date-picker.jsx`. En dispositivos con interacción táctil principal (`pointer: coarse`, incluidos celulares y la PWA instalada) usa `Input type="date"` para abrir el selector nativo del navegador o sistema; en escritorio usa `Popover` y `Calendar` de shadcn, con encabezado sin selectores y navegación por flechas. La detección no depende del ancho de pantalla y respeta la hidratación de React. Recibe y devuelve fechas `YYYY-MM-DD`; usar `clearable` en fechas opcionales que el usuario pueda borrar.
- Botones destructivos siempre con `AlertDialog` de confirmación antes de ejecutar borrado.
- Los paneles desplegables usan `Collapsible`; las barras de progreso, `Progress`; los avisos, `Alert`; las listas de registros, `Item`; los estados sin datos, `Empty`.
- En Gastos móvil, categoría, concepto, tarjeta/efectivo y monto exacto se reúnen en `ExpenseFilterCombobox`, compuesto con el Combobox múltiple oficial de shadcn. Día y mes conservan sus controles. Las selecciones aparecen como etiquetas removibles; «Limpiar filtros» borra las etiquetas y la búsqueda, conservando el período. La acción móvil «Quitar filtros», junto al título «Gastos filtrados», borra además el día y el mes; los tres campos conservan el mismo ancho completo. La búsqueda ofrece los catálogos, conceptos e importes del período; permite añadir conceptos parciales y montos MXN escritos (con punto decimal y coma de millares). Varias opciones del mismo campo son alternativas y los campos distintos se intersectan. `expenseFilters.js` aplica las mismas reglas a gastos guardados y pendientes, a centavos e ignorando acentos/mayúsculas en conceptos. Móvil consulta el período completo desde la API existente y filtra localmente; seleccionar etiquetas no genera nuevas peticiones. Escritorio conserva sus cuatro filtros y consultas originales, con estado independiente; cambiar de tamaño vuelve a consultar según la presentación. El componente Base UI se instala como dependencia del Combobox sin migrar los demás componentes Radix.
- En Gastos, «Gastos filtrados» usa `DailyExpenseCards` en pantallas menores de 768 px: una tarjeta por día, del más reciente al más antiguo, con cantidad de gastos y total de los movimientos filtrados sumado a centavos. Incluye los pendientes de sincronizar y los identifica en el resumen y las filas. Cada gasto conserva concepto, importe, categoría, método, notas, relaciones y acciones de edición/eliminación; las acciones requieren conexión y los pendientes no se editan. Al consultar varios días se muestra el total filtrado y se cargan siete días completos por tanda con «Ver más días», sin dividir un día entre páginas. Los filtros reinician la tanda; los estados de carga y sin resultados también se adaptan a móvil. Escritorio conserva la tabla y su paginación.
- En móvil, Compras registradas, Suscripciones, Ingresos y Cuentas por cobrar usan cards de `record-card.jsx`, compuestas con `Item`, en lugar de filas de tabla. Compras destaca mensualidad, saldo, próximo pago y avance de cuotas con `Progress`; Suscripciones, importe por cobro, frecuencia, método y estado; Ingresos, monto, fecha, tipo y cuenta vinculada; Cuentas por cobrar, persona, concepto, saldo y acceso a pagos. Conservan notas, relaciones, edición y eliminación. `DataTable` comparte los registros filtrados, el orden y la paginación con escritorio; `RecordListToolbar` ofrece ordenamiento móvil por las columnas existentes y totales de todas las filas filtradas, sumados a centavos. Cuentas por pagar adopta la misma jerarquía móvil, con saldo pendiente destacado y su historial `Collapsible` y edición integrada. Los listados evitan una card contenedora adicional en celular y tienen acciones de 44 px y carga con `Skeleton`; escritorio conserva su presentación.
- Las gráficas usan `ChartContainer`, `ChartTooltipContent` y `ChartLegendContent` con la configuración y tokens del wrapper local. `DataTable` compone los controles shadcn con TanStack Table; el ordenamiento usa `Button` dentro del encabezado.
- En Tarjetas, «Ciclos mensuales» usa `Item` con fondo y borde propios y separación de 12 px en pantallas menores de 768 px; el contenedor general deja de verse como una tarjeta en móvil. Cada ciclo muestra tarjeta, estado, la comparativa «Pago calculado» (estimado) y «Estado de cuenta» (o «Sin capturar»), corte, límite de pago y acceso al desglose. La comparación conserva los estados de cuenta de cero y está visible sin abrir Detalles. «Detalles» abre el Dialog canónico con el nombre de la tarjeta, importes, fechas y pagos registrados. Los formularios se componen con `FieldGroup`, `Field` y `FieldLabel`. Fechas, cuenta y pago cambian la vista dentro del mismo diálogo, con «Volver a detalles»; guardar actualiza la lista y cierra el diálogo, restaurando el foco al botón de origen sin expandir los registros. Las respuestas tardías de un desglose cerrado se descartan. La página comienza directamente con los ciclos, sin contadores, pestañas de navegación, botón de generación ni búsqueda por tarjeta o estado. Mes y orden comparten una fila de `ResponsiveSelect`; el mes usa una etiqueta abreviada en el selector móvil y nombres completos en las opciones, con nombres accesibles y sin la etiqueta visible «Ordenar», en móvil y escritorio. El orden predeterminado es por límite más próximo; se conserva al cambiar de mes dentro del año actual. La administración de tarjetas permanece en un `Collapsible` cerrado al final de la página. Escritorio conserva la tabla y su ordenamiento por encabezados. `DataTable` admite `initialSorting`, `toolbarStart` como contenido o función de la tabla, `renderMobileRow`, `mobileToolbar` y `mobileRowSeparator`, compartiendo orden y paginación. Las fechas se muestran respetando el día UTC almacenado.
- El desglose del ciclo en Tarjetas prioriza en móvil el total calculado, el estado de cuenta y la diferencia. Gastos, suscripciones, compras a meses y bonificaciones usan el Accordion canónico de shadcn en móvil: cada sección tiene borde propio y presenta su subtotal y número de movimientos; solo una se abre a la vez. Su encabezado permanece visible mientras se recorren sus movimientos dentro del diálogo y termina al llegar a la siguiente sección. Abrir o cerrar una sección ajusta el desplazamiento para mantener visible su encabezado, también en horizontal. Los conceptos se muestran completos en filas sin tarjetas anidadas. Los avisos de fechas se consultan mediante un icono de ayuda junto al período, visible solo cuando hay avisos, en móvil y escritorio; el Popover «Fechas por revisar» conserva sus textos completos y sustituye el bloque desplegable. Un icono de información junto a «Total calculado» abre el Popover canónico «Cómo se calcula» al tocarlo; conserva cargos, bonificaciones y criterios del cálculo sin ocupar una sección del listado. Se cierra con Escape o al tocar fuera y devuelve el foco al icono. «Referencia» conserva las notas de conciliación. Los grupos sin movimientos se muestran como resúmenes de cero. El diálogo mantiene el encabezado y un cierre táctil de 44 px fuera del cuerpo desplazable; escritorio conserva los grupos abiertos y el resumen completo. Cambia la presentación, sin alterar cálculos ni registros.
- El desglose de Consumo mínimo del dashboard aplica el mismo patrón móvil mediante `CardUsageWaiverBreakdown`: consumo que cuenta, meta, faltante y estado visibles; grupos desplegables con subtotales y cantidades, conceptos completos y cargos excluidos o previstos separados. El icono junto a «Consumo que cuenta» abre el Popover «Qué cuenta para la meta», con las reglas y el enlace oficial del banco; reemplaza la explicación desplegable al final del listado. Indica si el período es verificado o previsto y mantiene visibles los importes por revisar, períodos futuros y ciclos ausentes. Tarjetas y dashboard comparten `BreakdownHelp`, `BreakdownSections`, `BreakdownSection`, `DisclosureButton` y `BreakdownDialogContent` de `ui/responsive-breakdown.jsx`; escritorio conserva los grupos abiertos. La presentación no cambia las reglas de consumo ni la API.
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

Producción en Vercel, proyecto `afp`. La dirección personalizada es `https://finanzas.garatachia.com`; `https://afp-virid.vercel.app` sigue disponible.

El subdominio `finanzas.garatachia.com` está agregado al proyecto de producción en Vercel. En Namecheap se creó el CNAME de `finanzas` hacia `767214e385092158.vercel-dns-017.com`, confirmado mediante consulta al DNS autoritativo y validación de Vercel (`misconfigured: false`). HTTPS y las respuestas de `/login`, `/dashboard`, `/gastos` y el manifest se verificaron usando la IP de Vercel; `/` redirige a `/dashboard` en el nuevo dominio. El usuario confirmó posteriormente el acceso desde el nuevo dominio. Los DNS del dominio se administran fuera de Vercel.

El nuevo dominio conserva todas las rutas (`/login`, `/dashboard`, `/gastos`, etc.); no requiere `basePath`. En Supabase Auth, la captura del panel proporcionada por el usuario muestra **Site URL** como `https://finanzas.garatachia.com` y estas **Redirect URLs**:

- `http://localhost:3000/`
- `https://finanzas.garatachia.com`
- `https://finanzas.garatachia.com/login`
- `https://finanzas.garatachia.com/dashboard`

La configuración se revisó visualmente; no se enviaron correos ni se probó un enlace de confirmación. El login actual con correo y contraseña utiliza navegación relativa. La sesión y los datos locales de la PWA pertenecen a cada origen; será necesario iniciar sesión de nuevo en el subdominio.

Pendiente por documentar: pipeline CI/CD y separación de ambientes dev vs prod.

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
