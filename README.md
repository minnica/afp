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
| `/tarjetas` | `TarjetasContent.jsx` | Ciclos de corte, registro de pagos y administración de tarjetas |
| `/credito-y-deuda` | `CreditBalancesContent.jsx` | Deuda total, límite y crédito disponible de todas las tarjetas |
| `/configuracion` | `SettingsContent.jsx` | Categorías, personas, tipos de ingreso |
| `/login` | `src/app/login/page.js` | Auth Supabase |

---

## Stack

- **Framework**: Next.js 16.3.8 (App Router)
- **Lenguaje**: JavaScript (jsconfig.json, no TypeScript)
- **UI**: shadcn/ui (componentes locales en `src/components/ui/`) + Radix UI + Tailwind CSS v4; el Combobox oficial usa Base UI para la selección múltiple
- **Íconos**: lucide-react + @hugeicons/react
- **Tablas**: @tanstack/react-table 8.x (vía `src/components/ui/data-table.jsx`)
- **Gráficas**: recharts 3.x (vía `src/components/ui/chart.jsx`, wrapper shadcn canónico)
- **Formularios**: React Hook Form + Zod
- **Auth**: Supabase (`@supabase/supabase-js`)
- **BD**: PostgreSQL en Supabase, ORM Prisma 7.x con adapter pg
- **PWA / offline**: manifest + service worker propio; cola transaccional de gastos en IndexedDB
- **Toasts**: sonner (montado en root layout, `position="bottom-center"`)
- **Tema**: dark mode forzado (`html class="dark"`)
- **Fuente**: Geist Sans + Geist Mono

---

## API Routes

| Endpoint | Archivo |
|---|---|
| `POST/GET /api/expenses` | `src/app/api/expenses/route.js` |
| `GET/POST/PATCH/DELETE /api/cards` | `src/app/api/cards/route.js` — saldo estimado automático desde una captura bancaria inicial |
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
| `POST/PATCH /api/captures/pairings` | Iniciar vinculación / autorizar código con sesión Supabase |
| `GET/PATCH /api/captures/devices` | Listar dispositivos propios; pausar, reanudar y revocar con sesión Supabase |
| `GET/POST/DELETE /api/captures/device` | Estado/configuración, pausa/reanudación y desvinculación de la propia identidad; credencial `Capture` |
| `POST /api/captures/events` | Recepción, interpretación y registro transaccionales; credencial `Capture` activa |
| `GET/PATCH /api/captures/configuration` | Cobertura, alias, reglas y requisitos de activación/observación por tarjeta y formato; Bearer Supabase |
| `GET/PATCH /api/captures/movements` | Bandeja por estado y detalle de evidencias; corrección, registro, vínculo a gasto/MSI existente, compra distinta, descarte y conversión a MSI; Bearer Supabase |
| `GET/PATCH /api/captures/reconciliation` | Cotejo manual de cargos por tarjeta/período, confirmaciones, faltantes idempotentes, total y explicación de diferencias; Bearer Supabase |

---

### Autenticación y autorización de API (A01)

Las rutas financieras de `src/app/api/`, incluido `/api/gastos/bootstrap` y `/api/setup-user`, exigen `Authorization: Bearer <access_token>`. `src/lib/apiAuth.js` valida el token con `supabase.auth.getUser(token)` antes de leer el cuerpo o consultar Prisma. Sin token o con token inválido/vencido responde **401**. La identidad procede exclusivamente del usuario validado; cualquier `userId` enviado en URL o cuerpo se ignora. `setup-user` también obtiene el correo de esa identidad.

- Las consultas se limitan al propietario. Editar o borrar usa conjuntamente ID y `userId`, también en las actualizaciones indirectas de cuentas. Un registro ajeno o inexistente devuelve **404**; no revela su existencia.
- Antes de escribir se verifica que tarjeta, categoría, persona, tipo de ingreso, suscripción y cuentas vinculadas pertenezcan al mismo usuario. Los IDs del cuerpo deben ser cadenas, nunca filtros de Prisma. El propietario no es editable desde la API.
- `src/lib/apiFetch.js` adjunta el token vigente a todas las llamadas del cliente y conserva headers, cuerpo y cancelación. Comprueba la cuenta esperada por la pantalla; la cola offline verifica además su propietario antes de cada envío. Si falta la sesión o cambió la cuenta, conserva los pendientes.
- Las respuestas de API usan `Cache-Control: private, no-store` y `Vary: Authorization`. El service worker v4 no intercepta rutas `/api/`, ni como navegación, y elimina la caché anterior al activarse. El respaldo local de Gastos sigue separado por usuario.
- Prisma continúa accediendo desde el servidor; estas comprobaciones son obligatorias aunque RLS esté activo. La corrección no cambia tablas, políticas RLS ni migraciones y conserva la denegación pública existente.

Regresiones: `node --test tests/*.test.cjs`. `tests/api-authorization.test.cjs` ejecuta todas las rutas con Auth y persistencia simulados, verifica acceso anónimo, tokens inválidos, suplantación de identidad, aislamiento entre dos usuarios, CRUD propio y referencias ajenas. `tests/api-fetch.test.cjs` cubre renovación de tokens, cambio de cuenta, cola offline y exclusión de API del service worker. Estas pruebas no escriben en Supabase ni sustituyen una prueba integrada con dos cuentas reales en un ambiente aislado. El despliegue a producción requiere autorización explícita.

La captura Android tiene un ámbito separado: el inicio de vinculación es público y limitado; su autorización y administración exigen la sesión Supabase. Solo los endpoints nativos bajo `/api/captures` aceptan la credencial `Capture`. Esa credencial no permite consultar las API financieras. La identidad y el propietario nunca proceden del cuerpo de un evento. Véase [Fase 2](#vinculación-y-recepción--fase-2).

### Errores y recuperación de interacciones

`RequestErrorDialog`, montado en el layout raíz, compone el `AlertDialog` local de shadcn. `apiFetch` detecta fallos de conexión, respuestas HTTP fallidas o JSON incompleto y limita cada intento de red a 20 segundos. `requestErrors.js` convierte los fallos en mensajes en español sin mostrar detalles internos del servidor; `requestRecovery.js` mantiene una sola superficie para fallos concurrentes.

- **Reintentar** vuelve a ejecutar únicamente la petición fallida y continúa la interacción original. Conserva cuerpo, propietario y cancelación, y consulta el token vigente en cada intento. Durante el reintento muestra progreso y bloquea clics repetidos. **Ahora no** libera la interacción y deja su error en el formulario o sección, conservando el borrador.
- La sesión vencida ofrece **Iniciar sesión**. Permisos insuficientes, registros ausentes, conflictos y restricciones al eliminar explican el bloqueo. La validación 400/422 de altas y ediciones permanece junto al formulario. Un 429 respeta `Retry-After`, con cuenta regresiva.
- Las altas sin garantía idempotente no se reenvían después de perder la respuesta o recibir un 5xx: el diálogo pide revisar la lista antes de guardar otra vez. Si el navegador detectó desconexión antes de enviar, sí admite reintentar. Gastos conserva el UUID de su cola; cobros de suscripciones, preferencias de avisos y preparación de cuenta mantienen sus contratos repetibles.
- Las lecturas posteriores a una mutación usan `mutationCompleted`: si solo quedan lecturas recuperables, el diálogo muestra **«Cambio guardado»** y **Actualizar**. Su reintento solo actualiza los datos; nunca repite el alta. Si además hay un bloqueo, conserva su mensaje y la confirmación del guardado. El inicio de sesión también permite recuperar fallos de conexión sin borrar correo y contraseña.
- Los diálogos usan títulos breves y una indicación de recuperación. `AlertDialogMedia` ofrece variantes semánticas: círculo rojo para errores y triángulo ámbar para advertencias (sesión, permisos, restricciones, espera o guardado incierto). Conservan los tokens del tema y los botones habituales. La cuenta regresiva vive en el botón; el estado de reintento se anuncia al lector de pantalla sin añadir párrafos repetidos.
- `errorMode: "inline"` reserva los fallos de fondo a su aviso local: sincronización automática de pendientes, preferencias de avisos, consultas automáticas de cobros y actualizaciones de dashboard por foco/conexión. Gastos usa su respaldo local cuando existe; la captura sin conexión continúa funcionando. Los envíos manuales y la captura online muestran recuperación, indicando que el gasto sigue en el dispositivo. Si falla IndexedDB antes de capturar, el diálogo conserva el formulario y permite reintentar el almacenamiento.
- Navegar, salir de la sesión o abortar una consulta retira sus recuperaciones pendientes. El diálogo enfoca el título sin abrir el teclado, conserva el foco de retorno y ofrece controles de al menos 44 px, con desplazamiento en pantallas pequeñas.

`tests/request-recovery.test.cjs` verifica reintentos, concurrencia, token renovado, cambio de propietario, cancelación, desconexión, timeout, JSON inválido, permisos, conflictos, `Retry-After` y refrescos tras un alta confirmada. Estas pruebas usan red y sesión simuladas. No hay cambios de esquema, migraciones ni despliegue.

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
| `ExpenseOperation` | `expense_operations` | Recibo idempotente por usuario y UUID de captura; conserva la respuesta original |
| `InstallmentPurchase` | `installment_purchases` | Compras a meses en tarjeta |
| `Subscription` | `subscriptions` | Suscripciones recurrentes |
| `SubscriptionCharge` | `subscription_charges` | Decisión por suscripción y mes: confirmada con un gasto vinculado, u omitida |
| `ReceivableAccount` | `receivable_accounts` | Cuentas por cobrar |
| `PayableAccount` | `payable_accounts` | Cuentas por pagar (simple o préstamo) |
| `Income` | `incomes` | Ingresos registrados |
| `NoticeDismissal` | `notice_dismissals` | Aviso concreto oculto por usuario y mes calendario; no modifica registros financieros |
| `CaptureDevice` | `capture_devices` | Identidad nativa revocable y propietario inmutable tras autorizar |
| `CapturePairing` | `capture_pairings` | Código temporal de un solo uso, conservado como hash |
| `CaptureEvent` | `capture_events` | Aviso, interpretación y recibo durable por dispositivo/UUID |
| `CaptureCardAlias` | `capture_card_aliases` | Terminaciones físicas/digitales/Wallet verificables por tarjeta y fuente |
| `CaptureAutomation` | `capture_automations` | Observación/automatización por tarjeta y versión de formato |
| `CaptureMerchantRule` | `capture_merchant_rules` | Comercio exacto a categoría y suscripción opcional |
| `CaptureMovement` | `capture_movements` | Propuesta y resolución durables; evidencia vinculada a gasto/MSI |
| `CaptureStatement` | `capture_statements` | Cotejo manual por tarjeta/período, huellas por movimiento y recibos de cargos faltantes |
| `ExpenseTombstone` | `expense_tombstones` | Huella de borrados desde Fase 4 para revisar avisos tardíos |
| `CaptureRateLimit` | `capture_rate_limits` | Límites de intentos persistentes entre instancias del servidor |

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

### Tarjetas — crédito y deuda total

**Implementada y migración aplicada en Supabase · 21 de octubre de 2026.** El resumen vive ahora en la página independiente **Crédito y deuda** (`/credito-y-deuda`), accesible desde el menú de escritorio y «Cambiar sección» en móvil. Presenta deuda total, límite de crédito y crédito disponible, en MXN, seguidos de todas las tarjetas siempre visibles con sus tres importes. Escritorio añade porcentaje utilizado como texto, fecha base y acciones Capturar/Actualizar; en móvil se abre el formulario al tocar el frente. `/tarjetas` conserva los ciclos mensuales, pagos y administración; ambas páginas tienen un enlace directo a la otra.

- `Card.creditLimit`, `usedBalance` y `balanceAsOf` conservan la última captura del banco. **Por solicitud posterior del usuario, esa captura es ahora el punto de partida del seguimiento automático** descrito abajo. El límite se actualiza manualmente; el saldo y el disponible visibles se calculan con los movimientos de AFP. «Actualizar» permite ajustar nuevamente contra el banco, conservando el formato monetario y la fecha de consulta.
- `src/lib/cardBalances.js` valida importes con hasta dos decimales y fechas reales no futuras (día de México). El límite admite cero y no negativos; el saldo admite negativos para representar saldo a favor. `PATCH /api/cards`, con `action: UPDATE_CREDIT_BALANCE`, exige sesión y propietario y guarda la captura y su nuevo punto de partida en una transacción. La edición habitual de nombre/días/notas conserva la captura.
- El **disponible calculado** de cada tarjeta es `max(límite − saldo utilizado, 0)`. Se muestran los excesos sobre el límite y los saldos a favor. La deuda total suma solo los saldos positivos; un saldo a favor aumenta el disponible de su tarjeta, sin compensar deuda de otras. Los totales se suman a centavos; las retenciones/cargos pendientes pueden hacer que el disponible calculado difiera del banco, como explica la ayuda.
- Una tarjeta sin captura muestra «Sin capturar» e importes «—». Si faltan tarjetas, el resumen se identifica como **Deuda capturada** y explica que sus totales están incompletos. Un saldo capturado de cero sí cuenta. Con seguimiento activo muestra **Deuda estimada**, la fecha del saldo base y «Se actualiza con tus movimientos». El listado de escritorio identifica «Automático · Estimado»; en móvil esa información permanece en el resumen para conservar el frente compacto. Un error de carga ofrece reintento y no presenta saldos anteriores como una consulta completa.
- `src/components/credito-y-deuda/CardBalances.jsx` compone los controles locales de shadcn. El formulario usa React Hook Form + Zod y controles monetarios mediante `Controller`, para validar el valor sin separadores de miles. Ofrece vista previa, validación junto a los campos y resumen enfocable, conserva los datos ante un fallo y bloquea envíos/cierre durante el guardado. Abrir enfoca el título; cerrar devuelve el foco al botón de la tarjeta. El detalle admite teclado, pantallas estrechas y movimiento reducido. `CreditBalancesContent.jsx` gestiona la sesión, la carga con Skeleton, el reintento y la actualización automática de esta página; la pantalla vacía enlaza a la administración de tarjetas.

El traslado a la página independiente se verificó con build y lint correctos, navegación móvil/escritorio, guardado de saldo, retorno del foco y pago real sobre datos ficticios: aumentar el total pagado de $500 a $750 reduce el saldo de $12,500.25 a $12,250.25 al regresar al resumen. Sin desbordamiento a 320, 375 y 1280 px ni errores de JavaScript. No requiere nuevas migraciones. [Evidencia del traslado](artifacts/credito-y-deuda/verificacion.json).

**Presentación móvil por plástico.** Por debajo de 768 px, `MobileCreditCard.jsx` compone Card y Button de shadcn con un frente horizontal de proporción **1.586:1** inspirado en cada referencia de `estados_cuenta/referencias_tarjetas`. No hay barras de progreso en móvil ni escritorio. Escritorio conserva el porcentaje como texto; móvil reserva el pie a las marcas del plástico. BBVA muestra Visa con Platinum debajo; HSBC, Zero 1/2 arriba a la izquierda, HSBC arriba a la derecha y Visa abajo; Joy conserva el modelo bajo Banamex y Mastercard al pie; LikeU, Nu y DiDi muestran Mastercard abajo a la derecha. Mercado Pago lleva su marca abajo a la izquierda y Visa con «crédito» abajo a la derecha. Los tres importes siguen siendo HTML accesible. Se conservan los nombres completos como encabezados accesibles, saldo a favor, exceso y la acción de tocar cualquier parte del frente para Actualizar/Capturar. La altura puede crecer con texto ampliado o nombres largos. Enter/Espacio abre el formulario; Escape cierra y devuelve el foco.

**Recursos nítidos de LikeU · 21 de octubre de 2026.** El logotipo de LikeU, la marca Santander y su llama son trazos vectoriales extraídos de la portada del folleto oficial, sin ampliar las capturas anteriores. `node scripts/generate-likeu-pattern.cjs` crea la trama iridiscente con **110 contornos vectoriales** a distancia constante de la llama, mediante curvas suaves. El fondo, las tres marcas de Santander/LikeU y Visa/Mastercard son SVG sin mapas de bits incrustados. El frente usa la referencia blanca. `cardAppearance.js` define la red y la posición de marca/modelo por plástico; conserva las dos instancias de Zero y Joy. La tarjeta desconocida mantiene una apariencia neutra.

Los materiales y velos de contraste se definen en `globals.css`, exclusivamente bajo `.mobile-credit-card`. Los recursos están en `public/card-brands/` y sus [fuentes](public/card-brands/sources.json) registran procedencia, adaptación y huella del folleto. `node scripts/prepare-card-reference-assets.cjs` conserva los seis recortes WebP activos de los otros plásticos; ya no regenera las versiones rasterizadas de LikeU/Santander. Los archivos anteriores permanecen solo como antecedentes. La revisión modifica la presentación y conserva `usagePolicy`, importes, formularios y reglas financieras.

Verificación con componentes reales, Auth y datos ficticios en memoria: **cero barras** a 320, 375, 430, 767, 768 y 1280 px; proporción 1.586:1 en las nueve tarjetas a 320 y 375 px, sin desbordamiento ni recortes de importes o redes. Se revisaron SVG a densidad Retina, texto al 200 %, apertura con tap/Enter, cierre con Escape y retorno del foco. La cabecera compartida conserva su limitación anterior al ampliar la raíz al 200 %. Axe WCAG A/AA no detecta violaciones; el contraste sobre fondos gráficos se completa midiendo **124 textos**, con mínimo **4.74:1**. Build correcto, seis regresiones de saldos correctas y lint sin errores, con el aviso previo de TanStack Table. La revisión usa datos en memoria, sin BD ni persistencia bancaria real; no modifica producción. [Capturas y verificación actuales](artifacts/tarjetas-referencias-v2/verificacion.json), [comparativa Retina](artifacts/tarjetas-referencias-v2/tarjetas.png) y [evidencia de la versión anterior](artifacts/tarjetas-referencias/verificacion.json).

La migración **aditiva** `20261021040000_add_card_credit_balances` agrega tres columnas opcionales y una restricción que exige una captura completa o tres valores nulos. No deduce saldos para tarjetas existentes ni modifica movimientos, ciclos, RLS o migraciones anteriores. **Aplicada a Supabase con autorización explícita del usuario el 21 de octubre de 2026**, mediante `prisma migrate deploy`, después de guardar un respaldo privado y confirmar que era la única pendiente. Quedaron **22 migraciones aplicadas, ninguna pendiente, checksums correctos y diff de esquema vacío**; Prisma se regeneró. Las nueve tarjetas recibieron los tres campos nulos, sin asignar importes.

La comparación exacta con el respaldo confirmó que todas las filas y columnas anteriores, el historial previo, los índices, restricciones, enums, permisos y automatización se conservaron. Las 27 tablas mantienen RLS y cero políticas públicas. El respaldo de AFP en `public` está en `estados_cuenta/saldos_tarjetas_2026-10-21-YxjnqP/`, excluido de Git; no incluye Supabase Auth. El usuario realizó commit y push de la funcionalidad (`d3d837e`); esta operación aplicó y verificó únicamente la BD. [Evidencia de producción](artifacts/saldos-tarjetas/produccion.json). En otras instalaciones, aplicar las migraciones y regenerar Prisma antes de ejecutar esta versión.

Validación: **359 pruebas correctas, sin omisiones**, con PostgreSQL 16 desechable y Auth simulada. `tests/card-balances.test.cjs` cubre cálculo, centavos, cobertura incompleta, cero, saldo a favor, exceso, validación y aislamiento; `tests/card-balances-integration.test.cjs` verifica persistencia, actualización concurrente completa, restricciones y conservación de ciclos/pagos/movimientos. `pnpm db:verify` verifica las 22 migraciones desde cero y desde el historial, checksums, diff vacío, conservación de registros y RLS. La revisión de navegador utiliza componentes/API reales, datos ficticios y PostgreSQL local; los detalles están en [la verificación](artifacts/saldos-tarjetas/verificacion.json).

### Tarjetas — seguimiento automático del saldo

**Implementado; BD aplicada · 21 de octubre de 2026.** `Card.balanceTracking` conserva el día de inicio, la identidad de la captura y la exposición de los movimientos que ya existían al establecer el saldo bancario. `cardBalanceTracking.js` calcula `saldo estimado = saldo bancario + exposición actual − exposición inicial`, con Decimal a centavos. El valor bancario original permanece guardado; no se escribe al consultar ni se genera un gasto, ingreso o pago ficticio.

- El punto inicial incluye los cargos del día ya registrados y los pagos/bonificaciones existentes, de modo que no se vuelven a aplicar. Los gastos y MSI anteriores al día de inicio quedan incluidos en el saldo base: añadir cargos históricos anteriores no incrementa la deuda otra vez. Los cargos futuros esperan su fecha; los importes se actualizan al consultar, sin cron.
- Gastos con tarjeta suman el **cargo completo**, incluidas suscripciones confirmadas y capturas Android ya registradas. Efectivo, aportaciones personales, ingresos generales, suscripciones previstas y avisos sin registrar no modifican el crédito. Un gasto offline se refleja al sincronizarse; su recibo idempotente evita contarlo dos veces. Editar importe/tarjeta/método/fecha y eliminar modifica la contribución correspondiente; cambiar concepto, categoría o notas no cambia el importe.
- Una nueva MSI suma su importe original completo una sola vez. Las cuotas calculadas, referencias de estados de cuenta y cambios administrativos de `initialPaymentsMade` o `PAID_OFF` no liberan crédito por sí solos. Los pagos reales del corte lo liberan. Eliminar o cancelar una compra retira su contribución; convertir un gasto registrado a MSI en la transacción de captura conserva un único cargo.
- Los pagos acumulados de cortes se comparan contra el punto inicial: pasar de $1,000 a $1,500 resta solamente $500. Repetir el mismo total no lo vuelve a restar; editar o deshacer recalcula la diferencia. Las devoluciones posteriores al corte y las bonificaciones explícitas `CardCycleCredit` también reducen la exposición. Las fechas futuras no se aplican antes de su día. El estado de cuenta y los importes mensuales calculados no se suman como otro cargo.
- `GET /api/cards` lee tarjetas y movimientos del propietario en una transacción `RepeatableRead`, sin escrituras. Conserva `usedBalance` como saldo visible estimado y añade `bankUsedBalance`, `balanceAdjustment`, `balanceTrackingStatus` y fecha de cálculo. Cuatro consultas de movimientos sirven a todas las tarjetas; el detalle no consulta el banco.
- Guardar un nuevo saldo bancario reemplaza el punto inicial en el mismo snapshot. `balanceCaptureId` permite repetir una respuesta perdida sin absorber movimientos posteriores; reutilizarlo con otro importe devuelve 409. `expectedBalanceCaptureId` evita sobrescribir una conciliación de otra pantalla. Un conflicto pide cerrar y reabrir el formulario; conserva el borrador. Las transacciones se reintentan de forma acotada solo ante conflictos de serialización.
- Crédito y deuda consulta al entrar, recuperar foco/conexión y cada 30 segundos mientras está visible. Después de registrar/editar/deshacer un pago o devolución en Tarjetas, volver a Crédito y deuda consulta los importes actualizados. Las consultas anteriores se cancelan y el guardado de una captura bloquea refrescos simultáneos para conservar la respuesta confirmada y el borrador. El resultado sigue identificado como estimado porque comisiones, retenciones o movimientos ausentes de AFP necesitan cotejo con el banco.

La migración **aditiva** `20261022000000_add_card_balance_tracking` agrega únicamente un JSON opcional y su restricción en `cards`. Inicializa el seguimiento de las tarjetas que ya tienen límite, saldo y fecha, **conservando exactamente esos tres datos y el resto de los registros**. Las tarjetas sin captura siguen pendientes. Requiere `prisma migrate deploy` y regenerar Prisma antes de ejecutar esta versión; la activación comienza al aplicar la migración. Verificación local: **378 pruebas correctas sin omisiones**, con API y PostgreSQL reales, Auth ficticia, 23 migraciones desde cero y desde el historial, transición de saldos manuales llenos sin diferencias iniciales, pagos históricos sin fecha, rollback, concurrencia, idempotencia y aislamiento. Build y lint sin errores; permanece el aviso previo de TanStack Table. La comprobación móvil recorrió Gastos → registro real → Tarjetas, pago acumulado y conciliación bancaria, y verificó un cargo posterior mediante el refresco por foco. [Evidencia](artifacts/saldos-automaticos/verificacion.json).

**BD de producción aplicada con autorización explícita.** Se verificó que fuera la única migración pendiente y se guardó un respaldo privado de las 27 tablas de AFP en `estados_cuenta/saldos_automaticos_2026-10-21-mzj44j/`, excluido de Git. Las nueve tarjetas quedaron con seguimiento inicializado y exactamente los mismos límites, saldos, fechas y demás datos anteriores; las 23 migraciones y sus checksums coinciden, el diff Prisma está vacío y RLS, permisos y automatizaciones se conservaron. Una lectura posterior con el cálculo real confirmó las nueve tarjetas activas sin ajuste inicial. [Aplicación](artifacts/saldos-automaticos/produccion.json) y [lectura sin escrituras](artifacts/saldos-automaticos/lectura-produccion.json). El código web queda en el árbol de trabajo, **pendiente del commit y push del usuario para publicarse**; no se hizo despliegue web en esta tarea.

### Tarjetas — bonificaciones aplicadas al corte

`CardCycleCredit` vincula un ingreso existente con un ciclo e indica el importe aplicado a sus cargos. El ingreso se registra una sola vez; la aplicación no crea otro ingreso ni modifica los gastos, MSI o pagos.

- Tarjetas y dashboard calculan `calculatedAmount = grossCalculatedAmount - creditsAmount`. El desglose muestra cargos, bonificaciones y total a pagar.
- Se descuenta únicamente el importe aplicado a los cargos de ese corte. La parte destinada al adeudo anterior queda documentada en las notas y no se vuelve a descontar de otro corte.
- Cada par ingreso/ciclo admite una sola aplicación. Las aplicaciones deben pertenecer al mismo usuario, ser positivas, no exceder el ingreso disponible entre todos los ciclos ni los cargos del corte y conservar la evidencia del estado de cuenta en `notes` directamente en Supabase.
- La carga se realiza mediante conciliación revisada. Los ingresos generales no se descuentan automáticamente de las tarjetas.
- Un ingreso con aplicaciones no se puede eliminar desde la app ni reducir por debajo del importe aplicado. Hay que revisar primero la conciliación correspondiente.
- La migración de este modelo es aditiva. Debe aplicarse con `prisma migrate deploy` antes de iniciar la versión que consulta la nueva tabla.

### Tarjetas — saldo y liquidación de cortes (A03)

**Implementación concluida · 17 de octubre de 2026.** `src/lib/calculations/cardCyclePayments.js` determina la situación a centavos en Tarjetas, Dashboard y las respuestas de edición. Ni `paidAt` ni el estado `PAID` guardado bastan para liquidar un corte.

- `pendingAmount = max(estado de cuenta − devoluciones posteriores aplicadas − total pagado, 0)`. `paymentStatus` distingue `PENDING`, `PARTIALLY_PAID`, `PAID`, `NO_PAYMENT_DUE` y `UNCONFIRMED` (sin estado capturado). `excessAmount` informa pagos superiores al importe exigible tras devoluciones; no los transfiere a otros períodos. El vencimiento se presenta aparte: un parcial vencido muestra «Vencido» y conserva «Pago parcial» y su saldo.
- Un pago de $1 para un estado de $1,000 deja $999 pendientes y conserva los avisos. Estos muestran el saldo pendiente; sin estado de cuenta mantienen el importe calculado como estimación por confirmar. Los ciclos liquidados y sin importe exigible se excluyen de los avisos de pago y permiten avanzar el lote de pagos del dashboard.
- `UPDATE_STATEMENT` acepta cero numérico o texto. Un estado de cero queda automáticamente «Sin importe por pagar», sin crear gasto, ingreso, pago ni fecha ficticia. Editar el estado recalcula la situación y conserva el pago existente; aumentar el importe puede reabrir un corte liquidado.
- «Registrar pago» captura el **total pagado acumulado**, que reemplaza el anterior; no suma un abono individual. Conserva el total y fecha existentes al reabrir, explica el saldo resultante antes de guardar y mantiene el formulario ante errores. La fecha corresponde al último pago. Sin estado de cuenta exige capturarlo primero. Los importes admiten hasta dos decimales y no pueden ser negativos; los pagos positivos requieren una fecha válida.
- `MARK_AS_PAID` conserva su nombre por compatibilidad, pero ya no fuerza `PAID`. Cero retira el total y fecha de pago; solo liquida si el estado de cuenta es cero. `UNMARK_AS_PAID` también recalcula el saldo. Importes, fechas y estado se actualizan en una transacción, con bloqueo de la fila por ID y propietario para serializar ediciones simultáneas.
- El enum persistido no cambia: los parciales se guardan como `PAYMENT_PENDING` o `OVERDUE`; los cortes sin importe exigible como `PAID`. La API deriva `paymentStatus`, `displayStatus`, `pendingAmount`, `excessAmount` e `isSettled` en cada lectura, también para registros antiguos incoherentes, sin reescribir el historial al consultar.
- El total mensual y las cargas Q15/Q30 conservan el importe completo del período, incluidos los ciclos pagados. Las filas muestran el saldo parcial por separado. El historial de abonos individuales (`CardCyclePayment`) queda como evolución; no se introduce en esta corrección.

No requiere migración ni modifica datos de producción. La regla de calendario de vencimientos de A04 conserva su alcance pendiente. Regresiones: `tests/card-cycle-payments.test.cjs`, más los casos existentes de desgloses, bonificaciones, presentación y autorización. `node --test --experimental-test-isolation=none tests/*.test.cjs`: 163 casos, 161 correctos y 2 integraciones PostgreSQL omitidas sin `AFP_TEST_DATABASE_URL`. Las pruebas nuevas ejecutan las rutas reales con autenticación y persistencia simuladas; no acreditan concurrencia ni rollback contra PostgreSQL real.

### Tarjetas — devoluciones posteriores al corte

**Implementación verificada y migración aplicada con autorización · 17 de octubre de 2026.** Un reembolso que el banco ya aplicó al pago de un estado emitido se registra en **Tarjetas → Detalles → Devoluciones después del corte**; escritorio ofrece «Devoluciones» en las acciones de la tabla. No hace falta esperar al siguiente PDF para registrar una aplicación confirmada por el banco.

- `CardCycle.postCutCreditAmount` conserva el **total acumulado aplicado a ese pago**, `postCutCreditDate` la fecha de aplicación de la última devolución y `postCutCreditNotes` sus conceptos/referencias. Si son varias, se documentan importes y fechas en la referencia. Volver a guardar sustituye el total, no lo suma; cero retira importe, fecha y referencia. No es un historial individual de devoluciones.
- `UPDATE_POST_CUT_CREDIT` exige sesión y propietario, importe válido a centavos, estado capturado, referencia y fecha real posterior al corte, no futura. El importe aplicado no puede superar el estado; si existe un remanente de la devolución, no se asigna automáticamente. Las ediciones de estado y fechas también conservan esas condiciones. La escritura comparte el bloqueo transaccional del ciclo con pagos y otras ediciones.
- `paymentDueAmount = max(statementAmount − postCutCreditAmount, 0)` y `pendingAmount = max(paymentDueAmount − paidAmount, 0)`. Por ejemplo, $8,355.21 de estado − $1,499.50 de devolución − $6,855.71 pagados deja cero. Se conservan el estado original, el pago y su fecha. Una devolución que cubre todo deja «Sin importe por pagar», sin crear un pago ficticio; una cobertura insuficiente mantiene el saldo y los avisos. Retirar o reducir la devolución puede reabrir el corte.
- La devolución no crea ingresos ni gastos y no altera el cálculo de cargos, MSI, consumo mínimo ni la diferencia de conciliación del estado original. Las bonificaciones `CardCycleCredit` ya incorporadas a los cargos/estado no se vuelven a descontar del pago. Los ingresos generales tampoco se aplican automáticamente. Al conciliar el siguiente estado, documentar la parte ya destinada al adeudo anterior para no aplicarla otra vez a sus cargos.
- Dashboard, sus avisos y Tarjetas usan el mismo saldo. El total del mes y Q15/Q30 muestran el importe del período **después de devoluciones confirmadas**, conservando los pagos realizados dentro del total; no representan saldo pendiente. La etiqueta indica «Estado de cuenta menos devoluciones». Antes del corte o sin estado sigue la estimación. Detalles y desglose conservan la referencia. Guardar y deshacer pagos fuerzan una lectura nueva de Dashboard, cancelando una consulta anterior para evitar un aviso desactualizado en la cabecera móvil.

La migración **aditiva** `20261017030000_add_post_cut_credits` agrega tres columnas a `card_cycles`, con importe cero por defecto; no modifica estados, pagos ni otras tablas. **Aplicada a Supabase con autorización explícita el 17 de octubre de 2026** mediante `prisma migrate deploy`: 16 migraciones, checksums correctos, sin pendientes y diff de esquema vacío. Se verificó que la migración preservó los registros y RLS. Después se corrigió únicamente el pago de BBVA de septiembre y se registró su devolución conforme a la autorización; los demás registros conservaron sus huellas. La evidencia y el respaldo privados están en `estados_cuenta/devoluciones_2026-10-17/`, excluido de Git. En instalaciones nuevas, aplicar las migraciones y regenerar Prisma antes de iniciar esta versión, porque Tarjetas y Dashboard consultan las columnas nuevas.

Validación: **189 pruebas correctas, sin omisiones**, con PostgreSQL 16 desechable. Incluye reintentos, centavos, validación, aislamiento, ocho ediciones concurrentes y rollback real; Auth se simula. `scripts/verify-database-reproduction.cjs` verifica las 16 migraciones desde cero y desde el esquema histórico, defaults, catálogo, diff vacío, checksums, RLS y conservación de datos. Prueba de navegador a 390 y 1280 px con los componentes y API reales, Auth simulada y datos ficticios locales: captura, persistencia, saldo cero, retirada del aviso y retorno del foco. Build con `pnpm exec next build --webpack` correcto; `pnpm build` con Turbopack bloqueado en este entorno al abrir un puerto (`Operation not permitted`). Lint sin errores y con la advertencia previa de TanStack Table.

### Cuentas por cobrar y pagar — saldo y estado al editar (A05)

**Actividad concluida · 17 de octubre de 2026.** `src/lib/calculations/debtAccounts.js` centraliza saldo y estado con aritmética Decimal: redondea cada abono y el principal a centavos antes de sumar. Se reutiliza en las cuentas, el bootstrap de Gastos y el Dashboard.

- Crear, editar o borrar un gasto vinculado recalcula la cuenta por pagar; las mismas operaciones de ingresos recalculan la cuenta por cobrar. Trasladar o desvincular un ingreso actualiza tanto la cuenta anterior como la nueva. La edición habitual de gastos conserva su cuenta vinculada.
- Editar el principal también recalcula el estado. Por ejemplo, una deuda de $100 liquidada con un abono de $100 vuelve a `ACTIVE` al reducir el abono a $50 o aumentar el principal a $200. Solo un saldo a centavos menor o igual a cero corresponde a `PAID_OFF`.
- `CANCELLED` siempre se conserva. Un pago excedente mantiene `PAID_OFF`, `pendingBalance` negativo y `excessAmount` positivo en la API; no se pierde, transfiere ni devuelve dinero automáticamente. En cuentas por cobrar el excedente representa un cobro de más; en cuentas por pagar, un pago de más.
- `src/lib/debtAccountService.js` guarda movimiento/principal y estado en una sola transacción `ReadCommitted`. Un bloqueo asesor de PostgreSQL por usuario se adquiere antes de leer los registros y dura hasta commit/rollback. Serializa estas mutaciones del mismo usuario, incluidos traslados y borrados de cuentas; otros usuarios tienen claves distintas. Un fallo al actualizar el estado revierte también el movimiento o el principal. El POST de gastos conserva su recibo idempotente de A02 dentro de esa misma transacción.
- Las lecturas derivan el estado del saldo actual, también para datos históricos incoherentes, sin escribir en la BD al consultar. El estado persistido se corrige al modificar el principal o un abono. No hay migración, reparación masiva de datos ni cambios de interfaz.

Verificación: `node --test --experimental-test-isolation=none tests/*.test.cjs` terminó con **175 casos: 171 correctos, 4 omitidos sin `AFP_TEST_DATABASE_URL`, cero fallos**. `tests/debt-accounts.test.cjs` contiene diez regresiones de rutas y cálculo, incluidas cancelaciones, centavos, excedentes, traslados simultáneos y rollback. `tests/debt-accounts-integration.test.cjs` ejecutó **dos pruebas correctas contra PostgreSQL 16 desechable**, con diez abonos concurrentes por tipo de cuenta, ediciones concurrentes, principal, rollback real y lecturas de Gastos/Dashboard. La autenticación se simula; Prisma y PostgreSQL son reales. Para repetirlas, configurar `AFP_TEST_DATABASE_URL` exclusivamente a localhost y una BD `afp_test…` con el esquema actual, y ejecutar ese archivo con `node --test --experimental-test-isolation=none`. La base desechable se inicializó desde `schema.prisma`; esa prueba no validaba el historial de migraciones; A11 lo verifica posteriormente. Build correcto; lint sin errores y con la advertencia previa de `useReactTable`. [Evidencia y cierre A05](artifacts/auditoria-2026-10-15/informe.md#A05-seguimiento).

No se modificó Supabase ni se desplegó producción. A06 completa la protección de los flujos relacionados, incluida la creación desde compras a meses, como se describe a continuación.

### Operaciones relacionadas — transacciones (A06)

**Actividad concluida · implementación local · 17 de octubre de 2026.** El alta de compras a meses guarda la cuenta por cobrar opcional, la compra y `ReceivableAccount.originId` en una sola transacción `ReadCommitted`, mediante `runDebtAccountOperation`. Si falla cualquier escritura, se revierten todas; reintentar una operación revertida no deja cuentas huérfanas. Las compras sin persona también se crean dentro de la transacción.

- Tarjeta, categoría y persona se validan dentro de la transacción antes de crear registros. La edición de MSI y gastos también valida las relaciones dentro de la misma transacción que escribe, después del bloqueo por usuario compartido con A05. La validación inicial del cuerpo no consulta la BD.
- Gastos conserva la transacción de A02/A05: recibo, cuenta por cobrar opcional, gasto, decisión de suscripción y estado de la cuenta por pagar. El UUID permite recuperar la respuesta original sin repetir escrituras; otro contenido con la misma clave devuelve 409.
- Ingresos conserva las transacciones de A05 para alta, edición y borrado. Trasladar un ingreso actualiza ambas cuentas; un fallo al actualizar la segunda revierte el movimiento y el estado de la primera.
- La atomicidad no equivale a deduplicar una respuesta perdida después del commit. La garantía idempotente por UUID sigue siendo la de Gastos; MSI e Ingresos conservan su contrato actual, sin recibo idempotente. No se modifican las reglas de edición o eliminación de cuentas independientes vinculadas a compras.
- Sin cambios de interfaz, esquema o migraciones; no repara retroactivamente cuentas huérfanas ni modifica datos de Supabase. El despliegue sigue pendiente de autorización explícita.

Verificación: `tests/installment-transactions.test.cjs` agrega tres regresiones de rollback, reintento, propietario, compra sin cuenta y edición. La suite completa ejecuta **179 casos: 174 correctos y 5 integraciones omitidas sin `AFP_TEST_DATABASE_URL`, cero fallos**. Las cinco integraciones se ejecutaron además contra PostgreSQL 16 desechable, todas correctas. `tests/related-operations-integration.test.cjs` fuerza **24 fallos después de escrituras reales** y compara el estado completo de siete tablas antes/después; comprueba también cinco reintentos concurrentes del gasto y el conflicto de contenido. Se corrigieron dos adaptadores antiguos de integración (dato obligatorio `originType` y carga de dependencias reales de Gastos en suscripciones).

Para repetir la integración, configurar `AFP_TEST_DATABASE_URL` exclusivamente a localhost y una base `afp_test…` con el esquema actual, y ejecutar `node --test --experimental-test-isolation=none tests/*integration.test.cjs`. La base de prueba se inicializó con `prisma migrate diff --from-empty --to-schema prisma/schema.prisma`; no valida el historial de migraciones de A11. Auth simulada, Prisma y PostgreSQL reales; datos ficticios eliminados al finalizar. [Evidencia y cierre A06](artifacts/auditoria-2026-10-15/informe.md#A06-seguimiento).

### Recuperación de registros desde estados de cuenta

La skill `conciliar-estados-cuenta` se mantiene en `skills/conciliar-estados-cuenta/SKILL.md`. Documenta la extracción, revisión, carga autorizada y verificación de gastos y MSI contra Supabase.

- El PDF y `<banco>_conciliacion.json` conservan los datos bancarios y su evidencia.
- El usuario edita `<banco>_aclaraciones.json` desde VS Code: nombres, categorías, personas por cobrar y notas. Su esquema local ofrece categorías y personas existentes; las fechas e importes bancarios se conservan en la conciliación.
- `python3 skills/conciliar-estados-cuenta/scripts/revision_json.py validar estados_cuenta/<mes>/<banco>_conciliacion.json` comprueba el JSON y el SHA-256 del PDF. Código de salida 2 significa aclaraciones pendientes; 1, datos inválidos; 0, revisión completa. No escribe en la BD.
- Las notas visibles de cargas directas usan únicamente «Registrado desde la BD.» para un alta o «Actualizado desde la BD.» para una conciliación de un registro existente, conservando aparte las notas personales previas. Esta es la preferencia expresa del usuario: no añadir rutas, hashes, filas del PDF ni explicaciones técnicas a la nota visible. La evidencia completa permanece en los JSON privados de conciliación y en los metadatos bancarios correspondientes; los IDs de cargos excluidos de Consumo mínimo deben conservar su clasificación al resumir las notas.

**Notas resumidas en Supabase · 21 de octubre de 2026.** Por solicitud del usuario se actualizaron 190 notas: 109 altas y 81 actualizaciones de registros existentes. Se conservaron nueve notas personales y el resto de los campos, incluidos importes, fechas y metadatos bancarios. La comparación de los cálculos de 108 ciclos y Consumo mínimo no mostró cambios. Los textos originales y el lote se respaldaron privadamente en `estados_cuenta/notas_breves_2026-10-21-FplqST/`, excluido de Git. La lectura posterior al commit confirmó las notas; no hubo migración ni despliegue. [Verificación](artifacts/notas-breves/verificacion.json).

### Análisis

`/analisis` comienza directamente con el selector de mes y las vistas Semanas, Tarjetas y Categorías. Conserva el mes al cambiar de vista y el filtro de categoría al volver a Semanas. Las comparaciones semanales y por categoría usan meses calendario; Tarjetas usa meses de corte.

- Categorías muestra inicialmente las cinco de mayor gasto del mes elegido con barras horizontales; «Ver todas» permite consultar el resto. Los importes de ambos meses se consultan en los tooltips de las barras, con valores completos e identificación de los estimados cuando corresponde. Los totales mensuales se muestran en el resumen de Semanas.
- La página usa `useAnalysis` sobre `DashboardProvider` y el contrato existente de `GET /api/dashboard`, con carga diferida de las gráficas, skeleton propio y recuperación de errores. `categoryBreakdownByMonth[-1]` contiene diciembre del año anterior para comparar enero correctamente.
- Análisis se abre desde la navegación compartida y concentra los tres comparativos. Dashboard conserva avisos, consumo mínimo y pagos de tarjetas con su presentación original; no carga las gráficas ni sus placeholders. Tarjetas mantiene su presentación y sus flujos originales.

### Gastos compartidos — aportaciones recibidas en efectivo

En **Gastos**, al crear o editar un registro, «Gasto compartido» con el badge «Efectivo» permite capturar el total que otras personas ya entregaron para ese gasto. **Monto** conserva todo lo que se pagó al comercio; **Efectivo recibido** reduce la parte personal. El formulario destaca **Tu parte** en una franja verde antes de guardar, sin repetir la explicación ni los importes. Por ejemplo, $600 pagados con Santander y $500 recibidos dejan **$100 de gasto personal**, conservando el cargo bancario de $600. Si otro gasto recibe $100, se descuenta ese importe de su propio total. Los listados usan el mismo badge verde para lo recibido y la etiqueta «Tu parte» para el gasto personal; las ayudas accesibles y los errores se conservan.

- `DailyExpense.cashContributionAmount` guarda el acumulado recibido, con cero por defecto. Editarlo **sustituye** el importe anterior; desmarcar la opción lo deja en cero. Se permiten hasta dos decimales, sin negativos ni importes superiores al total pagado; una aportación igual al total deja gasto personal cero. La API conserva el valor si un cliente anterior omite el campo al editar y rechaza reducir el cargo por debajo de la aportación existente.
- La aportación pertenece al gasto y a su fecha/categoría. No crea un ingreso ni una cuenta por cobrar: el dinero ya se recibió y se descuenta una sola vez. Se puede añadir una persona como referencia sin crear deuda. Para evitar duplicar cobros/abonos, no se combina con cuentas por cobrar o pagar vinculadas; estas conservan su propio flujo. Las suscripciones confirmadas admiten la aportación en su gasto real, sustituyendo la previsión sin duplicarla.
- `sharedExpenses.js` comparte validación y cálculo a centavos entre cliente y API. Semanas, sus totales/filtros de categoría, Categorías y el resumen mensual usan `amount − cashContributionAmount`. La vista **Gasto personal por tarjeta** conserva los meses de corte: usa el estado de cuenta (incluido cero), o el cálculo estimado, menos las aportaciones de los gastos de ese período, con mínimo cero. Su tooltip muestra la base y lo recibido. Los meses calendario y los meses de corte pueden contener movimientos distintos.
- Tarjetas, pagos y avisos del Dashboard, conciliación del estado y consumo mínimo conservan el **cargo completo**. Recibir efectivo no es un abono al banco. Los listados de Gastos muestran total pagado, recibido y parte personal; sus resúmenes conservan el total pagado y añaden el personal cuando corresponde. El filtro por monto sigue buscando el total del movimiento.
- La captura offline, el borrador móvil y el recibo idempotente conservan la aportación con el mismo UUID. Guardar limpia la opción para el siguiente gasto. Edición y eliminación requieren conexión; borrar el gasto elimina también su aportación y actualiza los cálculos en la siguiente consulta.

La migración **aditiva** `20261020000000_add_cash_expense_contributions` agrega una columna con cero por defecto y una restricción de importe en `daily_expenses`; conserva cargos, ingresos y RLS. **Aplicada a Supabase con autorización explícita el 20 de octubre de 2026** mediante `prisma migrate deploy`: 17 migraciones, checksums correctos, sin pendientes y diff de esquema vacío. La comparación del respaldo anterior con la base posterior confirmó que los registros existentes, el historial previo, los permisos, RLS y la automatización se conservaron; todos los gastos anteriores tienen aportación cero. El respaldo privado está en `estados_cuenta/gastos_compartidos_2026-10-20/`, excluido de Git; [evidencia de aplicación](artifacts/gastos-compartidos/produccion.json). **La app se publicó con autorización el 20 de octubre de 2026 al desplegar Digital Asset Links para Android.** En otras instalaciones, aplicar las migraciones y regenerar Prisma antes de ejecutar esta versión, porque Gastos, Dashboard y Tarjetas consultan la columna nueva. No registra automáticamente los ejemplos personales ni interpreta notas antiguas como aportaciones.

Validación local: 212 pruebas correctas, sin omisiones, con PostgreSQL 16 desechable y Auth simulada; incluye CRUD, aislamiento, concurrencia, reintentos, captura offline, restricciones SQL, suscripciones y las tres vistas de Análisis. `db:verify` verifica las 17 migraciones desde cero y desde el esquema histórico, datos preservados, defaults, checksums, RLS y diff vacío. Build con `pnpm exec next build --webpack` correcto; lint sin errores, con la advertencia previa de TanStack Table.

Comprobación en Chromium a 1280 y 390 px con componentes/API reales, PostgreSQL local y Auth simulada: alta del ejemplo $600/$500, las tres gráficas en $100, edición persistida, validación al reducir el cargo, borrador al cerrar/reabrir y captura offline de $250.50/$100 que conserva su UUID y se sincroniza una sola vez. Sin desbordamiento horizontal en móvil. [Evidencia de verificación](artifacts/gastos-compartidos/verificacion.json) y [captura móvil](artifacts/gastos-compartidos/captura-mobile.png). Esta comprobación usó únicamente datos ficticios locales.

Refinamiento de copy y UI: comprobado en Chromium a 1280, 390 y 320 px con componentes reales y API/Auth simuladas en memoria. Alta y edición muestran «Tu parte»; teclado, errores y aportación del total conservan su comportamiento. Badge y resultado cumplen contraste AA (7.80:1 en oscuro; 4.64:1 en claro), con ayudas accesibles y sin desbordamiento móvil. [Evidencia de UI](artifacts/gastos-compartidos/ui-verificacion.json) y [captura móvil actualizada](artifacts/gastos-compartidos/ui-mobile.png).

### Dashboard — selección de mes en Pagos de tarjetas

En «Pagos de tarjetas», el Dashboard móvil sustituye las pestañas de los doce meses por `ResponsiveSelect`, con el nombre completo del mes y el año, y un área táctil de 44 px. Empieza en el mes en curso; al abrir el panel inferior, la opción seleccionada queda visible sin recorrer desde enero. Cambiar de mes actualiza los pagos y los avisos de fechas del período. La selección se conserva al cambiar entre celular y escritorio, donde se mantienen las pestañas. Las listas sin buscador de `ResponsiveSelect` también abren alrededor de su opción seleccionada, conservando el orden y el foco en el título del panel.

En móvil y escritorio, Dashboard muestra un único importe por tarjeta y destaca el límite de pago. `getDashboardPayment`, en `cardPaymentPresentation.js`, usa el estado de cuenta capturado desde el día de corte; antes del corte o sin estado capturado, muestra el calculado identificado como «Estimado». Un estado de cero es válido. El día UTC almacenado del corte se compara con el día local del usuario; las fechas visibles conservan el día UTC bancario. La comparativa entre calculado y estado de cuenta queda en Tarjetas, también en las filas de su tabla de escritorio.

El estado del pago compara días calendario y conserva el día bancario UTC, sin usar la hora guardada como límite: permanece «Pendiente» (o «Pago parcial») durante todo el día de vencimiento y pasa a «Vencido» desde el día siguiente si queda saldo. La API del Dashboard usa `clientDate`, la fecha local enviada por el navegador, también al derivar `displayStatus`; los pagos liquidados y los cortes sin importe por pagar conservan su estado. `tests/card-cycle-payments.test.cjs` cubre el fin del día, cambios de mes/año y la fecha del cliente distinta de la del servidor.

El límite de pago del Dashboard móvil muestra primero el tiempo relativo y luego la fecha: «Es en 8 días [22 octubre]», «Es hoy [14 octubre]» o «Fue hace 2 días [12 octubre]». Para una diferencia de un día usa «Es mañana [15 octubre]» o «Fue ayer [13 octubre]», también en los avisos que comparten el formato. Cuenta días calendario desde la fecha local y conserva el día bancario UTC; escritorio y las fechas de corte mantienen su formato.

El resumen compacto, compuesto con `Item` y `Separator`, muestra el total del mes y las cargas Q15/Q30 sumadas a centavos con los mismos importes elegidos para las tarjetas, después de devoluciones posteriores confirmadas cuando hay estado de cuenta. Conserva los ciclos pagados como parte del total del período y su estado «Pagado»; no representa un saldo pendiente ni descuenta pagos parciales. Q15 conserva su indicador cian y Q30 el rosa, correspondientes a los acentos de las tarjetas de cada nómina; los textos identifican también cada grupo.

### Dashboard — consumo mínimo y condición de Cajita Turbo

En celular (ancho menor de 768 px), Avisos importantes y Consumo mínimo están disponibles permanentemente en la cabecera sticky de todas las secciones, incluso en la cabecera de los formularios de captura abiertos. Son dos botones de 44 px: campana con cantidad de avisos y una meta de consumo. Cada uno abre un Dialog canónico con título, cierre siempre visible y cuerpo desplazable; cerrar devuelve el foco al icono y conserva el borrador de captura. Ambos accesos permanecen disponibles al cargar o cuando no hay datos, con skeleton, estados vacíos y recuperación de errores. Durante el guardado se bloquean junto con la navegación del formulario.

Las descripciones de Avisos importantes separan cada dato en una línea y destacan solo su etiqueta en negrita («Vencido:», «Pago esperado:», etc.). Los valores de «Vencido:», «Vence:» y «Corte:» reutilizan `formatPaymentDeadline` con la fecha del aviso y el día local compartido: «Es en 8 días [22 octubre]», «Es hoy [14 octubre]» o «Fue hace 2 días [12 octubre]». Este formato se comparte entre cortes, pagos de tarjetas, suscripciones en efectivo y cobros. Conservan los títulos y distinguen saldo pendiente, calculado o estimado según el aviso; los avisos de pago de tarjetas usan el saldo restante del estado de cuenta. Omiten las explicaciones sobre ingresos, gastos o pagos sin registrar y las instrucciones adicionales de actualización de cortes. El mismo formato se aplica al diálogo móvil y al panel de escritorio; no cambian las condiciones que generan o retiran cada aviso.

Cada aviso es un enlace completo con indicador de navegación y foco visible. Cortes y pagos de tarjeta abren `/tarjetas`; cobros pendientes o programados, `/ingresos`; suscripciones en efectivo, `/gastos`, para registrar el movimiento. En el diálogo móvil, `DialogClose` cierra los avisos al activar el enlace, incluso si el destino es la sección actual. Navegar no guarda ni modifica registros. Los tipos desconocidos conservan el aviso visible sin un destino inventado.

En celular, el menú de tres puntos de cada aviso conocido ofrece «Ocultar este aviso por este mes». Se sitúa en la esquina inferior derecha, con un área táctil de 44 × 44 px separada del título y de la flecha de navegación superior. Solo los detalles reservan espacio a su derecha y una altura mínima para evitar superposiciones en avisos cortos; el título conserva todo el ancho. El menú es independiente del enlace y abre un `AlertDialog` con concepto, fecha, importe y fin de vigencia. «Conservar aviso» recibe el foco inicial; los pagos de tarjeta exigen además marcar que ocultarlos no registra su pago. Confirmar guarda primero la preferencia sincronizada; si falla, el aviso permanece visible y el diálogo permite reintentar. No hay gestos de descarte ni borrado de movimientos.

«Ocultos este mes» se consulta mediante un icono de ojo tachado junto al título de Avisos importantes, con área táctil de 44 × 44 px y un contador secundario. Solo aparece cuando hay ocultos; el contador usa la variante `warning` si incluyen pagos de tarjeta, con la misma información en su nombre accesible. Sustituye al bloque desplegable de la lista principal. Abre una vista dentro del mismo panel, con título «Ocultos este mes», flecha para volver, detalle de los pagos ocultos y acciones «Volver a mostrar». Restaurar el último conserva un estado vacío y el acceso de vuelta; abrir Avisos de nuevo siempre muestra los activos. Cambiar de vista enfoca el título y devuelve el desplazamiento al inicio. `HeaderDialog` admite `contentTitle`, `headerLeading` y `headerActions` para esta composición, conservando el cierre independiente y el uso habitual de Consumo mínimo. Escritorio ofrece el mismo icono y permite recuperar avisos dentro de la tarjeta, conservando la creación de ocultaciones en móvil.

`noticeDismissals.js` identifica cada ocurrencia por tipo, ID y fecha; los cortes próximos y ya realizados comparten identidad, mientras que su pago es independiente. Los cambios de fecha o de importe de un pago de tarjeta vuelven a mostrarlo. La ocultación vence al terminar el mes local en que se confirmó, incluso si el aviso sigue pendiente. Otro cobro del mismo mes y los del mes siguiente se mantienen visibles. `DashboardProvider` comparte las preferencias, aisladas por sesión/mes, actualiza el día al llegar la medianoche y sincroniza al abrir Avisos o recuperar foco/conexión. Si la consulta de preferencias falla, se muestran todos los avisos y se deshabilita ocultar hasta recuperar la sincronización; la API del dashboard conserva todos los avisos originales.

La migración **aditiva** `20261015000000_add_notice_dismissals` agrega únicamente la tabla de preferencias y sus índices. Activa RLS sin políticas públicas: la tabla se consulta a través de la API autenticada con Prisma, sin acceso directo desde PostgREST. Aplicar con `prisma migrate deploy` y regenerar Prisma antes de usar la función; no cambia saldos, pagos, cobros ni ciclos. No aplicar a producción sin confirmación explícita. Las preferencias se consultan por el usuario validado en Supabase; el endpoint ignora cualquier `userId` enviado por el cliente.

`DashboardProvider`, montado en el layout raíz, comparte la respuesta de `GET /api/dashboard` entre las consultas de todas las cabeceras, Dashboard y Análisis. Reutiliza peticiones en curso, actualiza la información al cambiar de sección móvil, recuperar el foco o la conexión y abrir una consulta, y descarta respuestas canceladas al cambiar de usuario. No consulta desde el login. Los headers de escritorio se mantienen sin estos accesos y las otras secciones de escritorio no hacen esta carga. Consumo mínimo conserva el mes/año del Historial al navegar entre secciones; cada apertura del diálogo comienza en «En curso». Tocar una fila abre el desglose y cerrar devuelve el foco a esa fila. Los paneles se reutilizan desde `DashboardPanels.jsx`; consumo mínimo se implementa en `CardUsageWaiverProgress.jsx`. Dashboard móvil empieza con Pagos de tarjetas; escritorio conserva ambas secciones integradas.

Consumo mínimo usa `Tabs` con «En curso» e «Historial», en el diálogo móvil y en la sección de escritorio. En celular, las pestañas comparten la misma fila del título y el cierre de `HeaderDialog`, mediante `headerActions`, fuera del cuerpo desplazable. En anchos estrechos, el título puede ocupar dos líneas sin reducir las áreas táctiles ni añadir otra fila de pestañas. Cambiar de pestaña devuelve el cuerpo al inicio. «En curso» reúne un período vigente por tarjeta con mínimo configurado, aunque sus cortes pertenezcan a meses/años distintos; no tiene selector de mes ni de orden. Prioriza las metas pendientes por corte más próximo y nombre. En móvil, cada tarjeta ocupa un `Item` con variante `outline`, separado del siguiente por espacio y sin divisores internos: nombre y faltante en la primera fila, señal de suscripciones del período, corte y `Progress` debajo. Omite la línea de consumo registrado frente a la meta; sus importes siguen en el Desglose y en la descripción accesible del progreso. La etiqueta es siempre «Corte:», con etiqueta y valor de peso normal. Reutiliza `formatPaymentDeadline` con `includeDate: false`: «Corte: Es hoy», «Corte: Es mañana» o «Corte: Es en 2 días», sin fecha absoluta ni corchetes. Los estados «Revisar fechas» y «Por revisar» usan un `Badge` de advertencia y omiten el faltante y el progreso mientras no se pueda confirmar la meta. Escritorio conserva su lista con consumo registrado frente a la meta; Historial, Desglose, Avisos y Pagos de tarjetas mantienen sus fechas y su presentación.

En las metas pendientes de «En curso», móvil y escritorio muestran de inmediato si hay suscripciones previstas antes del corte, con cantidad e importe; si no hay cobros futuros ni por confirmar, indican «Sin suscripciones previstas». Los cargos cuya fecha ya pasó y siguen sin registrar aparecen como «por confirmar», separados de los futuros. La señal solo toma los cobros de la tarjeta dentro del período vigente: una suscripción asociada sin cobro en ese ciclo no cuenta como prevista. Los demás importes previstos/por confirmar se consultan en el Desglose; las filas móviles no repiten el total de todas las proyecciones. Las suscripciones previstas no se suman al consumo confirmado ni completan la meta sin un gasto vinculado o evidencia del cargo. Las metas alcanzadas quedan en un `Collapsible` cerrado al final. Una tarjeta sin período vigente aparece con un `Badge` «Sin período» en móvil y como «Período sin registrar» en escritorio, sin progreso ni importes inventados. «Historial» contiene solo cortes terminados, agrupados por mes y año de corte, con el mes más reciente seleccionado inicialmente y sus filas ordenadas del corte más antiguo al más reciente. Sus fechas conservan el formato absoluto. Una meta histórica no alcanzada conserva «Faltaron $X» y añade un `Badge` tenue en ámbar, «Posible comisión»; los períodos cumplidos o por confirmar no reciben esa etiqueta. El color usa el token semántico `warning` y la variante local homónima de `Badge`.

Las pestañas de consumo mínimo usan la variante `line` de shadcn, como Análisis, con ancho ajustado al texto y altura visible de 32 px. Una extensión transparente conserva un área táctil de 44 px. El subrayado del componente compartido se orienta a partir de `TabsList` para funcionar también cuando el encabezado se monta en el portal del diálogo.

`buildCurrentCardUsageWaivers` y `buildCardUsageWaiverHistory`, en `cardUsageWaivers.js`, reutilizan las reglas de consumo existentes. Seleccionan por `startDate <= fecha local del cliente <= cutDate`, dando prioridad a las fechas bancarias verificadas; incluyen todo el día del corte y pasan al siguiente período al día siguiente. El estado de pago no determina la vigencia. Consultan todos los ciclos almacenados, incluido enero del siguiente año; no generan ni modifican ciclos. Si varios períodos contienen el día actual, muestran «Revisar fechas» y no acreditan una meta ambigua. Los cortes terminados se excluyen de «En curso» independientemente de su cumplimiento o de cargos por confirmar. Se conservan los campos mensuales anteriores de la API para sus otros consumidores.

Las reglas se resuelven por el producto verificado en `Card.usagePolicy.productKey`, nunca por coincidencias en el nombre editable. La política conserva fecha de verificación, fuente oficial y PDF de identidad. Productos comprobados el 11 de octubre de 2026:
- HSBC 1 y HSBC 2: **HSBC Zero**, $300 por período entre cortes. [Condiciones](https://www.hsbc.com.mx/tarjetas-de-credito/productos/zero/).
- Banamex 1 y Banamex 2: **Joy Banamex**, $300 por período entre cortes. [Condiciones](https://www.banamex.com/es/personas/tarjetas-credito/tarjeta-de-credito-sin-anualidad-joy-ab/index.html).
- Santander: **LikeU**, $200 por período. [Condiciones](https://www.santander.com.mx/personas/credito-y-financiamiento/tarjetas-de-credito/likeu).
- DiDi Card y Mercado Pago no tienen meta de consumo para esta comisión. BBVA es Oro: su anualidad y posibles promociones personales se revisan aparte. Estos productos no aparecen en el indicador. Una tarjeta sin producto verificado tampoco recibe una meta inferida por banco.

Nu aparece en «En curso» por su producto verificado `NU`, con una condición distinta: **1 compra cada 30 días, sin monto mínimo**, para Cajita Turbo. [Condiciones de Nu](https://blog.nu.com.mx/productos-nu/cuenta-nu/cajitas-nu-preguntas-respuestas/), consultadas el 21 de octubre de 2026. Se calcula desde la última compra de crédito registrada, independientemente del corte; una compra nueva reinicia el plazo. El día 30 conserva la meta alcanzada durante todo el día local y su Desglose indica «Compra hoy»; después vuelve a pendientes con «Falta 1 compra». Cuenta gastos positivos confirmados, cargos de suscripción documentados sin duplicarlos y compras nuevas a meses en su fecha original. Excluye movimientos futuros, capturas pendientes, cargos bancarios, disposiciones de efectivo y mensualidades de compras anteriores. Su fila comparte el formato de las demás tarjetas: barra de progreso de 0 de 1 o 1 de 1 compra y agrupación automática en el desplegable «Meta alcanzada» cuando cumple. La próxima renovación se consulta al desplegar la fila; el Desglose muestra la última compra y las compras recientes. No crea una meta monetaria, historial de cortes ni una posible comisión para Nu. AFP solo observa el crédito registrado: la ayuda aclara que Nu también acepta débito y que la activación del beneficio se confirma en Nu. No fija una tasa promocional permanente.

`src/lib/calculations/cardUsageWaivers.js` calcula el consumo y el faltante a centavos:
- Cuenta gastos registrados con tarjeta; excluye comisiones, intereses y sus impuestos. Los IDs de cargos excluidos verificados conservan la clasificación al renombrar un gasto. La descripción bancaria original en notas antiguas sigue admitida como respaldo; las notas visibles de cargas directas se mantienen breves. Para cargos manuales sin evidencia usa conceptos bancarios reconocibles; una categoría como Servicios no basta para excluirlo.
- Las suscripciones cuentan cuando existe un gasto vinculado o un cargo documentado en el estado. Se emparejan por suscripción y mes del cargo para no duplicar el gasto, la referencia y el calendario. Se conserva el importe histórico del comprobante.
- Las suscripciones sin comprobante y los movimientos futuros aparecen como previstos/por confirmar; no completan la meta. En un corte revisado no se inventan cargos de suscripciones ausentes del PDF.
- Una compra nueva a meses cuenta por su importe original en el período de compra, incluso si ahora está liquidada; las mensualidades de compras anteriores y las canceladas no se suman.
- `CardCycle.usageReconciliation` guarda `version: 1`, `source`, `sourceSha256`, `startDate`, `cutDate`, `subscriptionCharges` (subscriptionId, name, date, amount) y `excludedExpenseIds`. Sus fechas prevalecen **solo en Consumo mínimo**. Los períodos sin documento se muestran como previstos. Los importes y fechas del cálculo financiero del corte se conservan.

Para un descuento temporal de suscripción, una conciliación autorizada puede marcar un cargo bancario con `applyToCycleAmount: true`. `subscriptionStatements.js` usa ese importe también en Tarjetas y en el cálculo del corte del dashboard, únicamente para esa suscripción, mes del cargo y corte. Requiere evidencia válida y un solo cargo coincidente; conserva la tarifa mensual, los demás cortes y los comprobantes históricos sin esa marca. No crea un gasto adicional ni un ingreso ficticio por el descuento. La fecha programada del cálculo financiero se conserva; la evidencia mantiene las fechas bancarias reales.

Cada fila muestra el nombre personalizado de la tarjeta; omite el nombre del producto bancario. Tocar la fila abre **Desglose**, que distingue compras, suscripciones confirmadas, cargos excluidos y previstos, y enlaza las condiciones oficiales. El indicador no representa el pago mínimo ni sustituye el pago para no generar intereses.

Los dos campos JSON son opcionales y se agregan con la migración aditiva `20261011000000_add_card_usage_verification`. Aplicar con `prisma migrate deploy`, regenerar Prisma y reiniciar el servidor. La evidencia inicial y su verificación están en `estados_cuenta/consumo_minimo/`; no hay dependencia de esos archivos privados durante la ejecución. En conciliaciones futuras, actualizar estos metadatos junto con la evidencia del nuevo corte y preservar las notas de origen.

### PWA / modo offline

La APK Android nativa en desarrollo se documenta por separado en [Captura automática Android](#captura-automática-android--fase-1). La cola web descrita aquí conserva su funcionamiento independiente.

La app puede instalarse como PWA y soporta captura offline de gastos diarios en `/gastos`.

Archivos principales:
- `public/manifest.webmanifest`: metadata de instalación (`start_url: /dashboard`, `display: standalone`, icono).
- `public/sw.js`: service worker propio. Cachea shell básico (`/`, `/gastos`, manifest, icono) y assets estáticos de Next con estrategia network-first. Excluye todas las rutas `/api/`; los datos offline de Gastos usan el respaldo local separado por usuario.
- `src/components/pwa/ServiceWorkerRegistration.jsx`: registra `/sw.js` desde el layout raíz.
- `src/lib/offlineExpenses.js`: cola transaccional por usuario en IndexedDB (`afp-offline-expenses`), con almacenes `expenses` y `legacyImports`. Las lecturas y altas son asíncronas.
- `src/lib/expenseOperations.js`: idempotencia de `POST /api/expenses`, con recibo y escrituras dentro de una sola transacción Prisma.
- `src/components/gastos/GastosContent.jsx`: integra lectura de cache, alta offline, visualización de pendientes y sincronización.

Iconos de instalación:
- `public/icons/app-icon.svg` es la fuente vectorial del símbolo de cartera, con fondo oscuro opaco y acento verde. No contiene texto pequeño ni depende de fuentes.
- El manifest utiliza PNG de 192, 512 y 1024 px, y una variante de 512 px con `purpose: "maskable"` cuyo símbolo queda dentro de la zona segura circular de Android. La imagen ocupa todo el fondo; el sistema aplica el recorte exterior.
- El layout declara `apple-touch-icon-v3.png` de 180 px para iPhone/iPad, y el favicon del proyecto incluye tamaños de 16 a 256 px con el mismo símbolo.
- `pnpm icons:generate` vuelve a exportar los PNG y el ICO desde el SVG mediante Sharp, declarado como dependencia de desarrollo. Al cambiar el diseño, actualizar la versión de las rutas de los iconos, sus referencias en manifest/layout y `CACHE_NAME` del service worker para renovar la caché.
- Los iconos se precachean con el shell. Las instalaciones existentes pueden conservar la imagen anterior; una reinstalación se hace después de sincronizar cualquier gasto pendiente guardado en el dispositivo.

Referencias: [iconos y zona segura de PWA](https://web.dev/learn/pwa/web-app-manifest#icons), [metadata de iconos en Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons).

Flujo:
- El usuario debe abrir `/gastos` con internet al menos una vez en el dispositivo para cachear shell y datos iniciales (categorías, tarjetas, personas, cuentas, suscripciones y gastos del día).
- Toda captura, también con conexión, recibe un UUID y se confirma primero en IndexedDB. Solo después se limpia el formulario y comienza el POST. Si falla el almacenamiento, no se envía el gasto ni se limpia el formulario. Los pendientes aparecen con badge `Pendiente` / `En cola`.
- Al recuperar conexión, la pantalla intenta sincronizar automáticamente la cola contra `POST /api/expenses`. También hay botón manual `Reintentar`.
- Cada envío conserva `operationId`, incluso tras perder la respuesta o cerrar la pestaña. Solo se elimina la entrada concreta tras recibir una respuesta exitosa con el ID del gasto; una captura concurrente no se sobrescribe. Errores HTTP, respuestas truncadas o incompletas y cambios de sesión conservan el pendiente con `lastError`.
- Web Locks serializa la sincronización por usuario entre pestañas; BroadcastChannel notifica cambios y recuperar el foco relee la cola. Sin Web Locks se serializa dentro de cada pestaña y la unicidad del servidor sigue evitando duplicados.
- Los pendientes offline solo existen en ese navegador/dispositivo hasta sincronizarse con Supabase.

Alcance actual:
- Soportado offline: crear gastos diarios desde `/gastos`.
- No soportado offline: editar/borrar gastos, alta/edición de catálogos, tarjetas, ingresos, suscripciones, cuentas por cobrar/pagar, dashboard. Esas operaciones requieren conexión.
- La cola accede exclusivamente a la API autenticada. `POST /api/expenses` admite `operationId` UUID; `/gastos` siempre lo envía. Clientes anteriores sin esa propiedad conservan compatibilidad, pero no tienen garantía idempotente.

**A02 · implementación concluida (17 de octubre de 2026).** La clave primaria de `ExpenseOperation` es `(userId, operationId)`. La operación reserva el recibo, valida relaciones y crea gasto/cuenta/decisión de suscripción y actualiza la cuenta por pagar dentro de la misma transacción. Un conflicto concurrente espera su resolución: el reintento devuelve la respuesta original; si cambia el contenido devuelve **409**. El recibo se conserva aunque el gasto se edite o elimine, para que una captura antigua no lo recree. La identidad siempre procede del Bearer. Este cambio cubre el alta de gastos; A05 amplía posteriormente las transacciones a abonos y principales de cuentas. A06 completa después las transacciones de los demás flujos relacionados, como se documenta en su sección.

Migración **aditiva** `20261017000000_add_expense_operations`: crea únicamente la tabla de recibos, su clave única, relación con usuario y RLS sin políticas públicas. Se generó el SQL con Prisma y se añadió la activación de RLS. Aplicar `prisma migrate deploy`, generar Prisma y desplegar servidor/cliente compatibles antes de usar la versión nueva. La migración se aplicó posteriormente a Supabase con autorización del usuario el 17 de octubre de 2026, junto con la de seguridad A11; se verificaron historial, checksum y estructura. Esa operación no publicó la aplicación.

Los pendientes anteriores de `afp:offline-expenses:{userId}` se importan automáticamente en una transacción junto con un marcador por entrada; dos pestañas no los importan dos veces. Se conserva la copia de localStorage para recuperación, pero los marcadores impiden reencolar confirmados. JSON corrupto produce un error visible y conserva la fuente. Al actualizar, cerrar o recargar las pestañas de la versión anterior antes de sincronizar: su código no conoce los UUID. No se deduplican retroactivamente gastos enviados por esa versión cuya respuesta ya se había perdido. Borrar los datos del sitio elimina los pendientes locales; la política de limpieza al salir sigue en A12.

Verificación: `node --test --experimental-test-isolation=none tests/*.test.cjs` ejecuta 154 casos (152 correctos y 2 de PostgreSQL omitidos sin `AFP_TEST_DATABASE_URL`). `tests/offline-expenses.test.cjs` cubre IndexedDB con `fake-indexeddb`, migración, concurrencia, cierres, respuesta perdida y fallos; `tests/expense-operations.test.cjs` ejecuta el POST con persistencia transaccional simulada. `tests/expense-operations-integration.test.cjs` prueba unicidad y rollback en PostgreSQL local, con las mismas restricciones de base `afp_test…` que cobros. Para repetir la comprobación en Chromium, iniciar `node tests/helpers/offline-browser-server.cjs` y usar `window.q` desde dos pestañas en `http://127.0.0.1:4192`; `perdida` corta la primera respuesta y `cierre` la retiene hasta `/release`. El servidor usa únicamente datos ficticios en memoria. [Resultados de aceptación A02](artifacts/auditoria-2026-10-15/a02-verificacion.json).

### Reglas de BD

- No ejecutar `migrate reset` ni `db push` en ambiente compartido/productivo.
- Usar `prisma migrate deploy` para aplicar migraciones.
- Migraciones en `prisma/migrations/`: no modificar SQL ya aplicado ni sus checksums. Recuperar archivos ausentes solo con checksum verificado; versionar los cambios posteriores en migraciones nuevas.
- No subir `.env` ni `.env.local` al repositorio.

### Reconstrucción de la BD desde Git (A11)

**Actividad concluida · implementación verificada y migraciones aplicadas a Supabase · 17 de octubre de 2026.** Las **15 migraciones** permiten crear el esquema completo desde una base vacía con `prisma migrate deploy`. La fuente de estructura es `schema.prisma`; la configuración RLS también requiere el SQL versionado. No usar `migrate diff --from-empty` como sustituto del historial para inicializar entornos.

- Se reconstruyó `20260518234708_add_payable_loan_support` desde los metadatos de solo lectura y el SQL generado por Prisma. Su SHA-256 **coincide exactamente** con el almacenado al aplicarla: `8ef7dcd79b9e4439e96092a131bbb569cb04b405721054e6916e71479a8c40b1`. No se inventó otro archivo bajo el nombre antiguo ni se modificó `_prisma_migrations`. Los otros doce checksums aplicados también coinciden.
- El esquema incorpora los objetos históricos omitidos: enum `PayableAccountType`, nueve campos de préstamos en `PayableAccount`, tres campos de desglose de abonos en `DailyExpense`, relación de reembolso e índices de reembolso/suscripción. Conserva sus tipos, valores predeterminados y relaciones existentes. Esto alinea la persistencia; no introduce reglas nuevas de amortización ni formularios de préstamos.
- La migración **aditiva de seguridad** `20261017020000_enable_application_rls` activa RLS en las 16 tablas de aplicación y en `_prisma_migrations`, en una transacción. Es repetible y no cambia registros, grants ni políticas. Conserva la denegación sin políticas públicas y el acceso del propietario desde Prisma; A01 sigue siendo obligatorio en la API. También reproduce `public.rls_auto_enable()` y el event trigger `ensure_rls`, existentes en Supabase, para activar RLS al crear tablas en `public`. Se conserva su definición observada, incluido el registro de errores; las futuras tablas deben seguir declarando RLS explícitamente en su migración.
- **Aplicación autorizada en producción · 17 de octubre de 2026, 08:23 UTC:** se aplicaron `20261017000000_add_expense_operations` (A02) y `20261017020000_enable_application_rls` mediante `prisma migrate deploy`. Supabase tiene **15 migraciones aplicadas, todos los checksums coincidentes y cero pendientes**; `migrate status` está actualizado y el diff frente al esquema es vacío. Se verificaron por MCP las 17 tablas con RLS y cero políticas. Las huellas de los registros preexistentes y de las 13 filas originales del historial no cambiaron; la función y event trigger se conservaron. La migración histórica recuperada no se volvió a ejecutar. No se realizó push ni despliegue de la aplicación en esta operación. [Evidencia](artifacts/auditoria-2026-10-15/a11-produccion.json).

`pnpm db:audit-history` verifica nombres y SHA-256 contra `_prisma_migrations` en una transacción de solo lectura. Exige `AFP_MIGRATION_AUDIT_DATABASE_URL` explícita y no carga conexiones de `.env`. Devuelve 0 con historial completo, 2 si solo hay pendientes y 1 ante archivos ausentes, SQL alterado, duplicados o migraciones incompletas. `migrate status` no sustituye esta comprobación de checksums; `migrate deploy` tampoco demuestra ausencia de drift.

La migración de seguridad requiere permiso para administrar event triggers: superusuario en PostgreSQL o el rol `postgres` habilitado por Supautils en Supabase. Para verificar la reconstrucción local se requiere Podman y una conexión desechable con esos permisos y capacidad de crear bases/roles:

```bash
podman run --rm -d --name afp-a11-postgres \
  -e POSTGRES_PASSWORD=afp_test_only -e POSTGRES_DB=afp_test_a11 \
  -p 127.0.0.1:55441:5432 docker.io/library/postgres:16-alpine
AFP_MIGRATION_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a11 pnpm db:verify
podman stop afp-a11-postgres
```

`db:verify` solo acepta localhost y una base `afp_test…`, sin parámetros de conexión. Crea dos bases y tres roles con nombres aleatorios y los elimina al terminar; no modifica las tablas de la base indicada. Prueba una instalación vacía y una actualización desde las 13 migraciones aplicadas, usando exclusivamente `migrate deploy`. Contrasta columnas, tipos, defaults, índices, claves y enums con el snapshot de Supabase; comprueba `migrate diff --exit-code`, checksums, segundo deploy sin cambios, conservación del préstamo/abono/reembolso e historial, y RLS con roles sin privilegios y un propietario sin `BYPASSRLS`. Compara también la función/event trigger con su snapshot y prueba `CREATE TABLE`, `CREATE TABLE AS` y `SELECT INTO`, limitados a `public`. Ejecuta las 182 regresiones con esa base recién migrada, incluidas las cinco integraciones. La consulta SQL y el snapshot no contienen datos financieros ni credenciales.

En un entorno nuevo, configurar `DIRECT_URL`, aplicar `pnpm exec prisma migrate deploy` y ejecutar `pnpm exec prisma generate` antes de arrancar la app. Para actualizar un ambiente compartido, revisar primero historial/checksums, pendientes y diff de solo lectura, contar con respaldo y autorización explícita; aplicar mediante `migrate deploy` y repetir las comprobaciones. Después de esta aplicación, el diff desde la base conectada al esquema actual debe estar vacío; Prisma no representa RLS, que se comprueba aparte en el catálogo. No ejecutar automáticamente el SQL de un diff.

La reconstrucción cubre el esquema `public` de AFP y su RLS, no usuarios/datos financieros, configuración de Supabase Auth, roles administrados por el proveedor ni secretos. [Evidencia y cierre A11](artifacts/auditoria-2026-10-15/informe.md#A11-seguimiento). Referencias: [historial de Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/migration-histories) y [RLS en PostgreSQL](https://www.postgresql.org/docs/16/ddl-rowsecurity.html) y [event triggers de Supabase](https://supabase.com/docs/guides/database/postgres/event-triggers).

---

## Captura automática Android — Fase 1

`android/` contiene una aplicación Kotlin/Compose con variantes `debug` (`com.garatachia.afp.dev`) y `release` (`com.garatachia.afp`), firmas propias y apertura de AFP mediante Trusted Web Activity en `https://finanzas.garatachia.com/dashboard`. La pantalla nativa permite activar/pausar el diagnóstico, comprobar el acceso especial a notificaciones, seleccionar BBVA México, Wallet, HSBC, Banamex, Santander, Nu, DiDi Finanzas y Mercado Pago, ver el estado del lector y consultar el estado de batería y las instrucciones de bloqueo para Samsung. No solicita permiso para mostrar notificaciones propias.

El `NotificationListenerService` acepta únicamente los ocho paquetes verificados de la [matriz](android/diagnostics/format-matrix.md), excluye resúmenes agrupados y empieza pausado. Las fuentes nuevas permanecen desactivadas al actualizar; se conserva la selección anterior, incluso vacía. Cada fuente tiene interruptor, versión instalada y contadores; el botón «Seleccionar todas las instaladas» aplica una selección explícita. Conserva hasta 100 muestras en un búfer local AES-GCM con Android Keystore, fuera de copias de seguridad. El texto solo se revela en el teléfono; la exportación oculta letras, cifras, fechas e identificadores. El búfer de diagnóstico sigue siendo local. Desde la Fase 3, los avisos admitidos recibidos con una identidad autorizada también se conservan en Room y se envían a AFP con WorkManager. La interpretación de compras se incorpora en la Fase 4; las fuentes reales conservan su bloqueo hasta disponer de muestras verificadas.

**Plan ajustado el 21 de octubre de 2026:** el inventario y diagnóstico de todas las tarjetas se adelantan a la Fase 1, con fuentes verificadas y alias separados para tarjetas físicas, digitales y Wallet. BBVA sigue como primer piloto de registro automático; las demás tarjetas se habilitarán por formato validado. La ampliación está implementada en la APK **0.1.2 / versionCode 3**, instalada en el S24 Ultra con la misma firma y el permiso conservado. Se contrastaron en modo de solo lectura las **nueve tarjetas actuales**, correspondientes a siete emisores; las ocho aplicaciones de diagnóstico están instaladas y seleccionadas explícitamente. HSBC 1/2 y BANAMEX 1/2 conservan identidades separadas; sus alias y los tokens de Wallet todavía requieren evidencia real. El [plan](PLAN_CAPTURA_AUTOMATICA_ANDROID.md) y la [matriz](android/diagnostics/format-matrix.md) distinguen la cobertura prevista de la comprobada.

`public/.well-known/assetlinks.json` declara la identidad pública de la APK de producción. **Publicado en Vercel con autorización el 20 de octubre de 2026:** responde 200 como JSON público por HTTPS, coincide con el certificado de la APK y Android verifica el dominio como `verified` en el S24 Ultra. La firma de desarrollo no se autoriza en el dominio de producción. Las claves están en `android/.private/` y `android/signing.properties`, excluidas de Git: respaldarlas privadamente antes de distribuir y conservarlas para futuras actualizaciones. La [evidencia de despliegue](artifacts/android-fase1/deployment.json) registra la versión y sus comprobaciones; la APK 0.1.1 abre como TWA sin barra de direcciones en Chrome del S24 Ultra, confirmado por el usuario. La revisión de batería y las pruebas actuales se documentan en la [verificación de ocho fuentes](artifacts/android-fase1/multi-source-verification.json). Quedan pendientes los avisos reales, su anonimización revisada y la captura real con pantalla bloqueada; el usuario avisará al recibir un cargo nuevo.

Guía de instalación, compilación, firma y pruebas: [docs/android-captura.md](docs/android-captura.md). Alcance, actividades concluidas y comprobaciones pendientes: [PLAN_CAPTURA_AUTOMATICA_ANDROID.md](PLAN_CAPTURA_AUTOMATICA_ANDROID.md). Evidencia de fuentes y campos: [matriz de formatos](android/diagnostics/format-matrix.md). La fase solo podrá cerrarse después de verificar TWA y avisos reales en el S24 Ultra; los ejemplos sintéticos no acreditan cobertura bancaria.

### Vinculación y recepción — Fase 2

**Implementada, verificada y vinculada en producción en el S24 Ultra · 21 de octubre de 2026.** La APK **0.2.0 / versionCode 4**, ya instalada, incorpora vinculación nativa, estado, pausa/reanudación y desvinculación. Configuración incluye «Captura automática», con autorización de código, lista propia, pausa/reanudación y revocación confirmadas. Las pruebas automatizadas utilizaron exclusivamente desarrollo; posteriormente se actualizó y vinculó la APK de producción con autorización del usuario.

- El teléfono genera 32 bytes aleatorios y los persiste antes de enviar. El servidor guarda únicamente el hash del secreto y del código de doce caracteres, con vigencia de cinco minutos. Reintentar el inicio recupera la misma identidad y vencimiento. La autorización exige Bearer Supabase, consume el código una sola vez y fija el propietario en una transacción, incluso entre cuentas concurrentes.
- La credencial `Authorization: Capture <deviceId>.<secret>` permite únicamente enviar eventos y consultar/administrar el estado de su propia captura. No da acceso a Gastos, tarjetas ni otras cuentas. Cerrar la TWA o vencer/cerrar la sesión web conserva la autorización. Pausar o revocar son acciones explícitas.
- `BindingStore` usa AES-GCM, Android Keystore, escritura atómica y `noBackupFilesDir`. Conserva las identidades anteriores al revincular y rechaza cambiar su propietario. La BD también impide reasignar un dispositivo autorizado; la relación compuesta dispositivo/propietario protege los eventos ya recibidos. La cola de Fase 3 guarda esa misma identidad original en cada pendiente.
- `POST /api/captures/events` valida contrato v1, UUID, paquete del catálogo, hash de notificación, fechas y campos de texto acotados. Autentica antes de leer el cuerpo y vuelve a comprobar dentro de la transacción. Confirma únicamente después del commit; mismo UUID/contenido devuelve el recibo existente y contenido distinto devuelve 409. Pausa, revocación y recepción comparten bloqueo para evitar envíos posteriores a una revocación confirmada. Los eventos permanecen en recepción/observación: esta fase no interpreta compras ni crea gastos.
- Los límites de inicio y autorización se conservan en PostgreSQL, con 429 y `Retry-After`. Las respuestas excluyen secretos, usan `private, no-store` y no registran texto bancario ni credenciales. No se depende de cookies o almacenamiento del navegador TWA.

La migración **aditiva** `20261021000000_add_android_capture_linking` agrega cuatro tablas, índices, relaciones, RLS explícito sin políticas públicas y un trigger de propietario inmutable. **Aplicada a Supabase con autorización explícita el 21 de octubre de 2026, 07:10 UTC**, mediante `prisma migrate deploy`, después de guardar un respaldo privado y comprobar que era la única pendiente. Se regeneró Prisma y se verificaron **18 migraciones, todos los checksums coincidentes, cero pendientes y diff de esquema vacío**. Las filas financieras y el historial anterior conservaron sus huellas; columnas, restricciones, índices, enums, permisos, RLS y automatización anteriores se conservaron. Las cuatro tablas nuevas quedaron vacías al terminar la migración y con RLS, sin políticas públicas. El respaldo está en `estados_cuenta/android_fase2_2026-10-21-lfHFCZ/`, excluido de Git; [evidencia de aplicación](artifacts/android-fase2/produccion.json). El MCP de Supabase requería renovar OAuth, por lo que se utilizó la conexión Prisma existente del mismo proyecto. Esa operación solo aplicó la migración; el usuario gestiona commit y push. En otras instalaciones, aplicar migraciones y regenerar Prisma antes de publicar esta versión.

**Activación real concluida el mismo día:** se actualizó la APK firmada de 0.1.2 a 0.2.0 mediante `adb install -r`, conservando la instalación, el permiso de notificaciones y las cero muestras locales existentes. Se autorizó el código desde Configuración en el teléfono, con su sesión web ya abierta, y la APK confirmó «Teléfono autorizado para enviar eventos» después de consultar el servidor y al reabrir la pantalla. Supabase confirmó código consumido, autorización activa, sin pausa ni revocación. El flujo autenticado del dominio público funciona; no se comprobó el SHA exacto del despliegue. No se enviaron avisos bancarios ni se crearon gastos. [Evidencia de actualización y vinculación](artifacts/android-fase2/phone-activation.json). La sincronización automática y el registro financiero corresponden a las Fases 3 y 4. No se hizo commit ni push de esta documentación.

Verificación: **234 pruebas web correctas, sin omisiones**, con PostgreSQL 16 local y Auth ficticia; reconstrucción de las 18 migraciones desde cero y actualización histórica, checksums, diff vacío, conservación de datos y 21 tablas con RLS. **14 pruebas Kotlin/JVM correctas**, incluyendo el cliente real contra HTTPS/API/PostgreSQL locales, y **cuatro pruebas instrumentadas nuevas correctas en el S24 Ultra**: Keystore, reapertura, alteraciones, conservación del propietario y flujo de entrega/pausa/revocación. Builds web, ambas APK y lint correctos; se conservan los avisos previos de TanStack Table y cinco de Android. Las pruebas no enviaron avisos bancarios reales ni escribieron en Supabase. [Evidencia](artifacts/android-fase2/verification.json), [contrato y procedimiento reproducible](docs/android-captura.md#vinculación-y-recepción-segura--fase-2).

### Cola y sincronización Android — Fase 3

Implementación del **21 de octubre de 2026**, APK **0.3.0 / versionCode 5**. `CaptureQueueDatabase` añade una base Room local en `noBackupFilesDir`, con esquema versionado en `android/app/schemas/`; no hay cambios de esquema del servidor. Cada aviso conserva su UUID, cuerpo, dispositivo y propietario antes de programar su envío. El texto usa AES-GCM con Android Keystore y autenticación de la identidad de la fila. Credenciales, pendientes y datos de WorkManager quedan excluidos de backups y transferencia.

- El lector respeta activación y fuentes seleccionadas; excluye resúmenes agrupados, categoría promocional de Android y patrones explícitos de promociones/códigos de acceso. Conserva formatos desconocidos para interpretación posterior. Al reconectar revisa solo notificaciones todavía activas. La misma publicación/contenido conserva el UUID; una actualización diferente permanece como revisión, sin inferir una compra nueva. Las muestras anteriores no se importan ni asignan a una cuenta.
- `CaptureSyncWorker` exige conexión, aplica reintentos exponenciales desde 30 segundos y respeta `Retry-After`. Una recuperación periódica de 15 minutos cubre una interrupción entre el commit de Room y la programación del trabajo. No se promete un plazo exacto bajo restricciones de Android. El recibo debe identificar el mismo UUID y confirmar persistencia; una respuesta perdida o incompleta mantiene el pendiente. Tras confirmar se elimina el texto de la cola y se conserva la identidad/huella del recibo para evitar reenviar avisos activos ya entregados. Los pendientes no se limitan al búfer diagnóstico de 100 muestras.
- Un 401/403 bloquea esa identidad hasta consultar de nuevo su autorización. Reintentar no cambia el propietario ni usa otra credencial. Los rechazos permanentes quedan por revisar; un cifrado alterado permanece intacto y no se reenvía. La pantalla muestra pendientes, revisiones, entregados, último envío confirmado, errores y acciones de pausa/reintento. **Pausar envíos** conserva la captura; desactivar **Guardar avisos y diagnóstico** detiene nuevas capturas. Borrar muestras no borra la cola.

Verificación: **18 pruebas JVM y 25 instrumentadas correctas** en el S24 Ultra, más dos comprobaciones de persistencia sin conexión y tras reinicio físico. Las 11 pruebas de cola/HTTPS se repitieron después del refuerzo de propiedad y pasaron. Pasaron 234 regresiones web, compilaciones, lint y reconstrucción de migraciones. La APK 0.3.0 quedó instalada con la firma existente, permiso, vinculación, captura activa y ocho fuentes conservados. Se verificaron pausa/reanudación y reintento en la pantalla real. [Evidencia sin datos personales](artifacts/android-fase3/verification.json).

Al cerrar esta fase, el servidor recibía en observación. La Fase 4 incorpora el motor financiero; las muestras bancarias reales de la Fase 1 siguen pendientes. Procedimientos, resultados y límites: [guía Fase 3](docs/android-captura.md#cola-local-y-sincronización--fase-3), [plan y actividades](PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-3-cola-local-y-sincronización-resistente-a-fallos).

### Interpretación y registro Android — Fase 4

**Motor implementado y verificado · 21 de octubre de 2026; validación bancaria real pendiente.** `captureParsers.js` registra analizadores deterministas por fuente/versión. Los dos contratos iniciales de BBVA/Wallet son **sintéticos y no activables** (`verified: false`); un formato desconocido o incompleto queda en revisión. No existe un bypass de entorno ni un dato del cliente que los convierta en formatos comprobados. Las demás fuentes se incorporarán cuando tengan muestras reales revisadas.

- `expenseService.js` extrae la creación de gastos para reutilizar una transacción Prisma existente. La API manual conserva sus recibos UUID y validaciones; la recepción nativa guarda evento, propuesta/resolución y gasto dentro del mismo commit, bajo los bloqueos de dispositivo y financiero por propietario. Un fallo revierte todo. El contrato Android v1 y su recibo `RECEIVED` conservan compatibilidad con la APK **0.3.0**.
- Alias físicos/digitales/Wallet se resuelven por fuente, tipo y terminación; una colisión o alias sin verificar bloquea la automatización. El modo se guarda por tarjeta y versión de analizador. Las reglas de comercio son exactas y pueden indicar categoría y una suscripción existente; sin regla se usa **Por clasificar**. Se preservan los IDs y nombres existentes, incluidos HSBC 1/2 y BANAMEX 1/2.
- Operación y recepción se conservan por separado. El analizador usa `America/Mexico_City`, rechaza horas inexistentes/repetidas y mantiene el importe decimal como cadena canónica. El gasto utiliza el día bancario UTC habitual de AFP. `DailyExpense.reconciliationStatus` y `InstallmentPurchase.reconciliationStatus` tienen `CONFIRMED` para históricos/manuales; las capturas y sus conversiones usan `PENDING` (**Por conciliar**). Se incluyen en gasto y cortes estimados, pero no en consumo confirmado para exención. Editar no cambia esa condición.
- UUID repetido nunca reprocesa un evento ni restablece correcciones. Solo una referencia bancaria inequívoca permite reunir canales automáticamente. Coincidencias de tarjeta/importe en ±3 días y claves de notificación reutilizadas requieren decisión; dos cargos iguales conservan multiplicidad. Las huellas de borrado empiezan con esta versión. Las altas manuales que coincidan con una captura por conciliar devuelven 409; `confirmDistinctCapture: true` expresa una compra distinta. La revisión de avisos ofrece vínculo o compra distinta sin sobrescribir el gasto. La Fase 5 completa esa decisión explícita en la interfaz general de captura manual.
- Suscripciones comparten bloqueo, unicidad mensual, omisiones y evidencia bancaria. MSI, preautorizaciones, devoluciones, cancelaciones, abonos y moneda distinta de MXN permanecen en revisión. La conversión del gasto a MSI es transaccional, idempotente y conserva los datos editados; los vínculos personales/aportaciones requieren revisión previa. No se infieren personas, efectivo recibido ni cuentas por cobrar.
- Configuración incluye una revisión básica con motivos, lista paginada, importación de alias y resoluciones confirmadas. Los controles completos de reglas/automatización, corrección y conciliación desde la interfaz se completan en la Fase 5 documentada abajo. Gastos muestra **Por conciliar** en móvil y escritorio y conserva el dato en el respaldo offline.

Para completar las **nueve tarjetas**, editar **`captura-tarjetas.local.json` en la raíz**, excluido de Git. La plantilla pública es [`captura-tarjetas.example.json`](captura-tarjetas.example.json). Cada tarjeta conserva `name`/`bankPackage`; `physical`, `digital` y `wallet` son listas de cuatro cifras entre comillas, incluidas las que empiecen por cero. `[]` significa desconocido/no disponible. Marcar `verified: true` al comprobarlas y describir el origen en `evidence`; no incluir PAN completo, CVV, claves ni códigos. Importar desde Configuración → Captura automática. La operación es aditiva y repetible, resuelve IDs desde la cuenta autenticada y no habilita automatización. **Alias personales importados y verificados el 21 de octubre de 2026:** nueve físicos, nueve digitales y seis de Wallet, asociados a los IDs existentes de las nueve tarjetas y sin ambigüedades. BANAMEX 1 queda verificada por confirmación explícita del propietario. HSBC 1/2 y MERCADOPAGO conservan Wallet vacío por incompatibilidad declarada. Se preservaron filas financieras y automatización, sin crear gastos ni activar formatos. Las terminaciones y el respaldo permanecen privados; la plantilla pública está vacía. [Evidencia de importación](artifacts/android-fase4/personal-alias-import.json).

Migraciones **aditivas**: `20261021010000_add_capture_processing` añade cinco tablas, relaciones, interpretación y estado de conciliación del gasto; `20261021020000_capture_installment_reconciliation` conserva ese estado al convertir a MSI. Ambas incluyen restricciones y las nuevas tablas RLS explícito sin políticas públicas. La primera **alcanzó Supabase por una conexión de prueba mal dirigida** y se recuperó tras respaldo, comparación de filas, diff vacío, RLS y checksum; el recibo interrumpido se cerró con `migrate resolve --applied`. [Incidencia y verificación de recuperación](artifacts/android-fase4/production-recovery.json).

**Publicación completada el 21 de octubre de 2026:** el push del usuario publicó web y backend en Vercel, commit `3af06ed`, estado `READY` en `finanzas.garatachia.com`. Después, con autorización explícita, se respaldaron privadamente las tablas de AFP en `public`, metadatos, permisos y automatización, y se aplicó la segunda migración mediante `prisma migrate deploy`. Quedan **20 migraciones aplicadas y ninguna pendiente**, checksums correctos y diff de esquema vacío; se regeneró Prisma. La comparación exacta de filas conservó todos los valores anteriores, y las MSI existentes recibieron únicamente `reconciliationStatus = CONFIRMED`. Se conservaron RLS en 26 tablas, cero políticas públicas, permisos y automatización. El respaldo excluye Supabase Auth. La APK personal sigue en **0.3.0 / versionCode 5**; los formatos bancarios reales permanecen bloqueados hasta validar sus muestras. [Evidencia de publicación](artifacts/android-fase4/production-deployment.json).

Verificación: **266 pruebas web correctas sin omisiones**, incluidos seis casos de analizadores y 25 escenarios transaccionales nuevos con PostgreSQL local, Auth y avisos ficticios. Reconstrucción de las **20 migraciones**, actualización histórica, checksums, diff vacío, conservación de datos y **26 tablas con RLS**. Las pruebas de automatización simulan evidencia validada exclusivamente en su cargador aislado; no acreditan formatos bancarios reales. Build web y lint correctos, conservando la advertencia previa de TanStack Table. **18 pruebas JVM y 25 instrumentadas correctas** en el S24 Ultra, sin omisiones y con API/PostgreSQL locales; ambas APK y lint Android correctos, sin modificar la APK personal. Revisión básica comprobada en Chromium con importación de nueve tarjetas y resoluciones persistidas; móvil de 320 y 390 px sin desbordamiento y controles nuevos de 44 px. [Guía y repetición de Fase 4](docs/android-captura.md#interpretación-y-registro-financiero--fase-4), [plan y pendientes](PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-4-interpretación-y-registro-financiero-automático), [evidencia agregada](artifacts/android-fase4/verification.json).

### Revisión y conciliación desde AFP — Fase 5

**Fase 5 concluida y verificada · 21 de octubre de 2026.** Configuración → Captura automática reúne dispositivos y fuentes, y las pestañas **Bandeja**, **Tarjetas y reglas** y **Conciliar**. Tras conectar el S24 Ultra por USB se completó la aceptación nativa con **29 pruebas instrumentadas correctas sin omisiones**, incluidas la pausa/reanudación en la pantalla real y la recepción de ambos reportes por la API/PostgreSQL locales. Las siete actividades y la comprobación nativa están marcadas como concluidas en el [plan](PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-5-revisión-y-conciliación-desde-afp). La publicación se completó durante la Fase 6, según el seguimiento siguiente.

- **Dispositivos y fuentes:** pausa/reanudación individual por aplicación, estado solicitado y estado reportado con su fecha. Acceso a notificaciones, conexión del lector, captura local, envíos y batería son una fotografía del último reporte. Una APK antigua aparece sin reporte; no se deduce que sus permisos estén revocados. La APK **0.4.0 / versionCode 6** consulta pausas al sincronizar o consultar estado y las guarda por identidad. Respeta la selección local; reanudar una fuente no seleccionada no la activa. Una respuesta de la identidad anterior no afecta una nueva vinculación. La pausa remota conserva la entrega de los avisos guardados anteriormente; se aplica con conexión, sujeta a los tiempos de Android y a la recuperación periódica de 15 minutos.
- **Tarjetas y reglas:** edición individual de alias físicos/digitales/Wallet y su evidencia, eliminación confirmada, importación JSON existente, reglas de comercio exactas con categoría/suscripción y modo por tarjeta/formato. El servidor sigue rechazando activar los formatos sintéticos sin muestras reales. Eliminar una regla o un alias conserva gastos y evidencias ya recibidos.
- **Bandeja:** Por revisar, Registrado, Conciliado y Descartado, con paginación. Observación pertenece a Por revisar; los gastos vinculados y MSI pertenecen a Registrado hasta tener un cotejo explícito. Abrir un aviso muestra sus evidencias originales, corrección y coincidencias actuales. Corregir conserva `proposal` y guarda `correction` por separado, con control de cambios concurrentes. Permite registrar un aviso desconocido tras revisar tarjeta, día, importe final MXN, concepto y categoría; el gasto queda Por conciliar. Los cargos iguales requieren confirmar otra compra o vincular evidencia a un gasto/MSI existente. Vincular conserva notas, aportaciones y relaciones personales. La conversión a MSI sustituye el gasto transaccionalmente; si estaba cotejado, exige cotejar la nueva cuota.
- **Cotejo manual:** se eligen tarjeta y fechas inclusivas, hasta 63 días. Compara cargos de compras y cuotas MSI del mes de la fecha final usando los cálculos existentes. El total opcional del estado admite cero y la explicación de diferencias queda guardada. Es un subtotal de cargos: pagos, abonos, saldo anterior, comisiones e intereses se explican aparte; el saldo a pagar continúa en Tarjetas. Cada confirmación corresponde a un ID y una huella de sus datos financieros. Dos cargos iguales permanecen separados; una ausencia no elimina ni cancela el movimiento. Cambiar importe, tarjeta, fecha o condiciones de la MSI invalida el cotejo; editar concepto, categoría, notas o aportación conserva la decisión. Los borradores de total/notas no sobrescriben cambios de otra pantalla; «Recargar total y explicación» recupera los guardados.
- **Faltantes y recuperación:** el cargo faltante se crea dentro de la transacción del cotejo, con UUID/recibo durable, y se confirma después individualmente. Reintentar, incluso después de borrar el gasto, no lo recrea. Antes de enviar, conserva UUID y datos en sessionStorage por usuario/período para recuperar una respuesta perdida tras recargar. La cola habitual de Gastos ofrece «Es otra compra» o retirar expresamente el pendiente cuando ya existe una captura similar, conservando su UUID al reintentar; retirar advierte que sus notas/aportaciones locales no se copian al gasto existente.
- **Vistas financieras:** Gastos móvil/escritorio y su respaldo offline muestran origen y Por conciliar/Conciliado; Compras a meses y el desglose de Tarjetas comparten esos estados. Los datos offline representan la última consulta guardada; las resoluciones necesitan conexión. La bandeja consulta al recuperar foco/conexión y cada 30 segundos cuando su región y la pestaña del navegador están visibles, cancela respuestas anteriores y conserva borradores abiertos. Los dispositivos muestran nuevas consultas cada 30 segundos mientras Configuración está activa.

Migración **aditiva** `20261021030000_capture_review_and_reconciliation`: añade `capture_statements` con RLS explícito sin políticas públicas, corrección separada, fecha de cotejo y preferencias/reportes de dispositivos. No modifica migraciones aplicadas ni reclasifica históricos. **Al cerrar Fase 5, solo estaba aplicada localmente.** La migración y publicación se completaron durante Fase 6, con respaldo y la autorización de esta tarea; se instaló la APK 0.5.0 con la firma existente. Véase el seguimiento de Fase 6.

Verificación: **288 regresiones web correctas sin omisiones**, con 19 escenarios nuevos de revisión/cotejo en PostgreSQL y dos de conflictos offline; **18 pruebas JVM correctas y 29 instrumentadas correctas en el S24 Ultra**, todas sin omisiones, incluido cliente Kotlin → HTTPS/API/PostgreSQL locales, pausas y reporte. Las cuatro instrumentadas nuevas cubren preferencias remotas y pantalla Compose; las otras 25 conservan la regresión histórica. Compilaciones de ambas APK, firma release y APK de pruebas correctas. Reconstrucción de **21 migraciones** desde cero y desde el historial antiguo, diff vacío, checksums, filas conservadas y **27 tablas con RLS**. La revisión de navegador usa componentes y API reales con Auth/datos ficticios. Detalles, comandos y límites: [guía de Fase 5](docs/android-captura.md#revisión-y-conciliación-en-afp--fase-5). Evidencia agregada: [verificación](artifacts/android-fase5/verification.json).

### Piloto de crédito BBVA — Fase 6

**Preparado en observación · 21 de octubre de 2026; validación real y corte completo pendientes.** El alcance confirmado por el usuario comprende exclusivamente las tarjetas de crédito existentes. El aviso BBVA de cargo a cuenta fue identificado por el propietario como transferencia de débito: el servidor reconoce ese prefijo, conserva la evidencia en Descartado y no crea una propuesta ni un gasto de crédito. No se ofrece como formato automatizable. BBVA crédito, Wallet y las demás fuentes siguen sin registro automático hasta validar cada tarjeta/formato con muestras propias; no se infiere el producto a partir del nombre Platinum del plan o de la referencia histórica a Oro.

Configuración → Captura automática → **Conciliar → Seguimiento de captura** agrega indicadores del período a `GET /api/captures/reconciliation`, sin escrituras ni tablas nuevas. Cuenta cargos con/sin evidencia, cotejados, avisos adicionales, revisiones/coincidencias, propuestas corregidas y faltantes añadidos; cada gasto/cuota cuenta una vez. La fila indica cuántos avisos tiene vinculados. Avisos sin tarjeta o sin fecha bancaria se muestran aparte y se delimitan por recepción local. Los vínculos a gastos eliminados siguen visibles. La falta de evidencia no demuestra que no hubo aviso; corregir o completar datos no acredita por sí solo un error del analizador y varias evidencias no demuestran gastos duplicados. El resumen usa el mismo bloqueo y propietario del cotejo; mantiene la multiplicidad y no cambia importes, conciliaciones ni recibos.

**298 pruebas web, 18 JVM y 29 instrumentadas correctas, sin omisiones**, además de dos comprobaciones físicas de actualización **0.4.0 / 6 → 0.5.0 / 7** con un pendiente ficticio no vacío. Se conservaron cifrado, UUID, propietario, secreto, identidad, preferencias, permiso aplicable y cero intentos. Build web, APK debug/release y lint correctos. La reconstrucción de las 21 migraciones desde vacío y desde el historial conserva datos, checksums, diff vacío y RLS en 27 tablas. Las muestras y transacciones de aceptación son ficticias y locales; la transferencia de débito real no acredita una compra de crédito.

La única migración pendiente de Fase 5 **se aplicó a Supabase con la autorización de esta tarea**, después de respaldar filas exactas, metadatos y claves de firma. Quedaron **21 migraciones, ninguna pendiente, diff vacío, 27 tablas con RLS y cero políticas públicas**. Todas las filas anteriores, privilegios y automatización se conservaron. Fase 6 no añade migraciones; el respaldo privado de AFP en `public` excluye Supabase Auth. **Publicación y actualización verificadas:** Vercel `dpl_4vn4oDLnajjHffjUVAi7mKyKrCaC`, estado `READY`, producción en `https://finanzas.garatachia.com`. Se publicaron 230 archivos web/Prisma públicos desde el árbol de trabajo, sobre la base `3ef6ae2`, sin commit ni push. El manifiesto SHA-256 `0c4ed9b037f209574632fbcac0601d1ea9f44b302b6756560639e187490d4bcb` identifica esas fuentes; claves, APK, `.env`, alias y datos privados quedaron excluidos. El bundle contiene el nuevo seguimiento; páginas, manifest y certificado responden 200 y las API consultadas sin sesión responden 401. La consulta inmediata de errores de runtime desde la publicación no devolvió grupos; no acredita todos los flujos autenticados.

**APK personal 0.5.0 / versionCode 7 instalada** mediante `adb install -r` con la firma existente. Se conservaron fecha inicial de instalación, acceso a notificaciones, autorización, batería exenta, ocho fuentes seleccionadas y seis recibos, con cero pendientes y cero errores de cola. Las muestras de diagnóstico pasaron de seis a nueve al reconectar; no aumentaron los eventos ni recibos del servidor. Android conserva el dominio como `verified`. El reporte real recibido confirma lector/acceso/captura activos, envíos habilitados, ocho fuentes y ninguna pausa remota. Las identidades y hashes de credencial, los seis eventos previos y las filas de 17 tablas financieras/de aplicación permanecen intactos. El aviso de débito existente quedó descartado por la confirmación del usuario, conservando su evento y recibo. Solo quedó la APK personal en el perfil Android actual.

El [plan](PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-6-piloto-completo-con-bbva-platinum) mantiene abiertas las compras presenciales/en línea/Wallet, Amazon/Mercado Libre, la activación de formatos de crédito comprobados y la observación/conciliación de un corte completo. Procedimientos y definiciones: [guía Fase 6](docs/android-captura.md#piloto-de-crédito-bbva--fase-6). [Evidencia](artifacts/android-fase6/verification.json).

### Activación gradual de tarjetas — Fase 7

**Implementación técnica local · 21 de octubre de 2026; activación real pendiente.** Configuración → Captura automática → Tarjetas y reglas muestra **Cobertura y activación** por tarjeta: fuente configurada mediante sus alias, terminaciones verificadas, formato/versiones, propuestas de observación conciliadas y requisitos pendientes. Las fuentes sin analizador se muestran en diagnóstico. El banco procede de la configuración explícita, sin inferirlo del nombre de la tarjeta; verificar Wallet o una tarjeta de HSBC/Banamex no habilita las otras.

`captureRollout.js` calcula los requisitos con la evidencia existente, sin tablas ni migraciones nuevas. La API vuelve a comprobarlos al habilitar, en la transacción con bloqueo financiero: analizador con muestras reales verificadas, alias sin colisiones y propuesta de observación de esa tarjeta/fuente/versión registrada o vinculada y cotejada explícitamente, con importe, moneda, día, tarjeta y comercio interpretados conservados. Categorías y datos personales pueden cambiar. Completar un aviso desconocido no valida el analizador. Una nueva versión exige una observación propia; el modo persiste exclusivamente por tarjeta y formato.

**Volver a observación** conserva gastos, evidencias, recibos y cotejos; actúa sobre avisos nuevos y también admite configuraciones de formatos retirados. La pausa de fuente sigue disponible por dispositivo y se aplica al comunicarse con Android, respetando su selección local y conservando pendientes. Las comprobaciones de habilitación se hacen al solicitarla; editar o eliminar después una evidencia conserva las decisiones financieras anteriores y exige evidencia vigente para una futura reactivación.

Las nueve tarjetas tienen **24 alias**: nueve físicos, nueve digitales y seis Wallet; HSBC 1/2 y MERCADOPAGO mantienen Wallet vacío por incompatibilidad declarada. Los seis Wallet inicialmente declarados en Fase 4 correspondían al título de la tarjeta y se sustituyeron por sus **números de cuenta virtual**, contrastados en el teléfono y guardados tanto en AFP como en el archivo privado. Los otros 18 alias se conservaron. **Ninguna tarjeta tiene un formato completo de crédito activable ni se ha habilitado automáticamente.** Presencial, en línea, Wallet, cargos parciales y suscripciones siguen pendientes de validar como capturas automáticas para cada tarjeta. La [matriz por tarjeta](PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-7-activación-gradual-de-las-demás-tarjetas) conserva esa distinción y la [guía Fase 7](docs/android-captura.md#activación-gradual-por-tarjeta--fase-7) explica la validación y recuperación.

Verificación web inicial: **329 pruebas correctas sin omisiones**, PostgreSQL 16 local con las 21 migraciones, Auth y avisos ficticios; incluye 25 escenarios de integración nuevos y cinco unitarios. Los contratos ficticios de los siete emisores, nueve tarjetas y seis Wallet existen solo dentro de los tests; no se añadieron analizadores reales sin muestras. También pasaron 18 pruebas JVM y 29 instrumentadas en el S24 Ultra sin omisiones, contra HTTPS/API/PostgreSQL locales; se retiraron las APK temporales de desarrollo. ADB confirmó las ocho aplicaciones, permisos y batería; actualiza versiones en la [matriz de fuentes](android/diagnostics/format-matrix.md). La APK personal sigue en **0.5.0 / 7**. Esa aceptación inicial no modificó Supabase ni publicó la web; no requiere actualizar la APK. [Evidencia de aceptación y límites](artifacts/android-fase7/verification.json).

**Seguimiento con movimientos reales · 21 de octubre de 2026.** El aviso de pago CFE de Nu se capturó y llegó al servidor en unos cinco segundos. El propietario confirmó que usó crédito Nu, pero el aviso solo aporta importe y destinatario: no incluye moneda explícita, identidad de tarjeta ni fecha bancaria. Se añadió en local `nu.cfe-service-payment.es.v1`, con una muestra real anonimizada y `verified: false`, para aprovechar esos dos campos en revisión manual. El recibo existente conserva `REVIEW / UNKNOWN_FORMAT`; instalar un analizador no reinterpreta avisos antiguos.

El pago BBVA/Wallet tiene comprobante aprobado NFC cuya terminación coincide con el número virtual de esa BBVA. La lectura inicial de un dígito del comprobante se corrigió con la aclaración del propietario y el contraste en Wallet. No se encontró una notificación asociada en AFP ni ese movimiento en el historial Wallet consultado; el propietario solo observó la terminal y la palomita. Se corrigieron los seis alias Wallet mediante el servicio de configuración en una transacción: se verificaron su persistencia, ausencia de ambigüedades y conservación de los otros 18 alias y las huellas de 20 modelos. El comprobante y las pantallas originales permanecen fuera de Git. **337 pruebas web correctas, cero omisiones**, lint sin errores (un aviso previo de TanStack) y build correctos. Sin gastos creados, activaciones, despliegue ni nueva APK. [Evidencia del seguimiento](artifacts/android-muestras-2026-10-21/verification.json).

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=          # conexión PostgreSQL para Prisma
DIRECT_URL=            # conexión de Prisma CLI para migraciones y diff; prisma.config.ts
```

> No subir estos valores al repo.

---

## Mapa rápido del repositorio

```
afp/
├── android/                       → APK Kotlin/Compose; diagnóstico, cola Room/WorkManager y TWA
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

Disponibles: `button`, `field`, `input`, `number-input`, `create-record-surface`, `input-group`, `label`, `select`, `radio-group`, `command`, `responsive-select`, `searchable-select`, `payment-method-selector`, `textarea`, `calendar`, `popover`, `date-picker`, `card`, `tabs`, `badge`, `table`, `data-table`, `record-card`, `dropdown-menu`, `separator`, `dialog`, `header-dialog`, `alert-dialog`, `request-error-dialog`, `sonner`, `spinner`, `tooltip`, `skeleton`, `sheet`, `sidebar`, `alert`, `chart`, `collapsible`, `progress`, `empty`, `item`.

Los componentes base corresponden al registro oficial de shadcn con el estilo `radix-mira` de `components.json`. Mantener JavaScript, los alias locales y la librería de iconos configurada al incorporar actualizaciones. La revisión y sus comprobaciones están en [`docs/shadcn-audit.md`](docs/shadcn-audit.md).

**Reglas:**
- En celular (ancho menor de 768 px), «Cambiar sección» abre `MobileNavigationSheet`, una composición del Sheet canónico de shadcn con `side="top"`. Está disponible en `AppHeader`, una cabecera sticky compartida por todas las páginas: mide 48 px en celular y 56 px en escritorio. El acceso móvil usa icono y texto sin fondo ni borde, con un área táctil de 44 px y foco visible. Con un diálogo de alta abierto, la cabecera se mantiene como una superficie independiente por encima de la tarjeta de captura; no ocupa espacio en el encabezado del formulario. Permite navegar en dos toques sin cerrar primero la captura. Muestra los destinos definidos en `src/lib/navigation.js`, con Gastos, Tarjetas, Dashboard y Análisis como primeras opciones en móvil, iconos, enlaces de 48 px, `aria-current` y cierre de sesión. El menú empieza directamente con las secciones; título y descripción quedan solo para lectores de pantalla. «Cerrar menú» aparece en el pie junto a «Cerrar sesión», ambos sin fondo ni borde y con áreas táctiles de 48 px. Enfoca el título accesible sin abrir el teclado; cancelar devuelve el foco y conserva el formulario. La lista se desplaza y `visualViewport` ajusta el panel. Cambiar de página cierra las capas; durante el guardado se bloquea el acceso desde la captura. Escritorio conserva SidebarTrigger y la navegación habitual.
- Los borradores de las seis capturas con diálogo se conservan en la pestaña mediante `useCreationDraft`, separados por usuario y sección. Usa sessionStorage y respaldo en memoria si el almacenamiento está bloqueado. Incluye campos y selecciones de alta, sin afectar edición, filtros, API ni cola offline. Tras guardar se persiste el reinicio habitual del formulario, para no recuperar como borrador un registro ya enviado. La restauración solo se activa en celular; al pasar de escritorio a celular conserva los datos que ya se estaban editando.
- Los importes usan `Input type="number" formatNumber`: `NumberInput` compone `react-number-format` con el mismo control y estilos de shadcn. Muestra miles con coma y decimales con punto mientras se escribe (`9000.50` → `9,000.50`), sin símbolo ni decimales obligatorios. `onChange` entrega el valor sin separadores a los formularios; las API, cálculos y cola offline conservan su contrato numérico. Mantiene el teclado decimal, las etiquetas, refs, estados y restricciones `min`, `max`, `step` y `required`. Los campos de años, días y número de meses/pagos conservan el input numérico nativo.
- Los selectores usan `ResponsiveSelect`. El campo cerrado sigue la escala de `Input`: altura predeterminada de 28 px, texto de 14 px en pantallas pequeñas y 12 px desde 768 px. En la variante con panel inferior, una extensión transparente añade área táctil hasta 44 px sin agrandar el borde visible. En pantallas menores de 768 px o con puntero principal táctil abre un `Sheet` inferior: altura ajustada al contenido, máximo del 70 % de la pantalla, filas, buscador y cierre de al menos 48 px y desplazamiento interno de la lista. Los paneles con buscador enfocan su campo de búsqueda inmediatamente al abrir; los que no tienen buscador enfocan el título. `visualViewport` adapta el panel al teclado. En escritorio usa el `Select` oficial cuando no hay búsqueda y `Popover` + `Command` cuando la hay. Las opciones reciben `{ value, label, pinned?, disabled? }`; conserva los IDs, etiquetas, estado deshabilitado y manejadores `onValueChange`. La detección mantiene una instantánea de servidor estable para respetar la hidratación.
- `ResponsiveSelect` conserva el orden recibido; `sortOptions` permite ordenar alfabéticamente con opciones `pinned` al principio. `searchable` admite `false` (predeterminado), `true` y `"auto"`: activa la búsqueda con más de ocho opciones no fijadas. La presentación se conserva mientras el panel está abierto. La búsqueda ignora acentos y mayúsculas. `SearchableSelect` es la composición que aplica búsqueda automática y orden alfabético a categorías, personas, suscripciones y cuentas. Tarjetas y tipos de ingreso también usan búsqueda automática; meses, estados, frecuencias y tamaños de página conservan su orden y no muestran buscador.
- Efectivo/Tarjeta usa `PaymentMethodSelector`, una composición de `RadioGroup` con ambas opciones visibles en una fila sin fondo envolvente, texto de 12 px como las etiquetas del formulario y círculos de 14 px, en captura y edición de Gastos y Suscripciones. En escritorio la fila mide 28 px como los inputs; en pantallas menores de 768 px o con puntero principal táctil, las áreas de selección tienen al menos 48 px. La etiqueta del grupo lleva `id="${id}-label"`. Los valores siguen siendo `CASH` y `CARD`; seleccionar Efectivo limpia la tarjeta asociada.
- Los formularios de alta usan `CreateRecordSurface`: en pantallas menores de 768 px o con puntero principal táctil, un Dialog canónico se abre al entrar y enfoca su contenedor, sin enfocar inputs. El encabezado muestra solo el título; las descripciones de los formularios de alta y edición usan `sr-only` y no ocupan espacio visual. Al guardar permanece abierto, limpia los datos del registro y vuelve al inicio del cuerpo; cerrar conserva el borrador. El botón fijo de apertura usa signo + y la variante `action` de `Button`, con fondo turquesa sólido `#00fdcf` de alto contraste y tokens semánticos `action`, `action-foreground` y `action-hover`, compartida por las seis capturas; guardar usa estilo primario y disquete; «Cerrar» devuelve el foco al botón de apertura. Cuerpo desplazable, acciones visibles y adaptación a `visualViewport`. Los errores de alta se anuncian dentro del formulario; guardar bloquea nuevos envíos, edición de campos y cierre. Si falla el refresco tras un POST exitoso, se informa que el registro ya se guardó, sin ofrecer el envío como fallido. Los avisos de éxito se muestran arriba en móvil. En escritorio se mantiene la captura integrada. Se aplica a Gastos, Compras a meses, Suscripciones, Ingresos y Cuentas por cobrar/pagar. Tarjetas y Configuración conservan sus formularios integrados también en móvil, dentro de sus pestañas; no abren diálogos de alta ni muestran acciones fijas de captura.
- Tras guardar, Compras a meses conserva tarjeta/fecha/categoría; Suscripciones conserva método/tarjeta/categoría/frecuencia/mes y año de inicio; Ingresos conserva fecha/tipo; Cuentas por cobrar/pagar conserva persona/fecha de origen. Se limpian conceptos, importes, notas y relaciones específicas del registro; los meses y pagos previos de una compra y el día de cobro de una suscripción se vuelven a capturar. Tarjetas limpia todos sus campos. Configuración limpia solo los campos del catálogo guardado.
- En Gastos, `ExpenseCreateSurface` presenta la captura en un `Dialog` canónico de shadcn cuando la pantalla es menor de 768 px o el puntero principal es táctil. Al entrar en la página, el diálogo se abre automáticamente con foco en su contenedor, sin enfocar ningún campo; los primeros campos son Concepto, Monto y Categoría. En la captura móvil, Enter/Siguiente avanza de Concepto a Monto y después abre Categoría; al confirmar una categoría, se cierra su panel y se abre Fecha mediante showPicker en el mismo gesto del usuario (o el calendario web si corresponde). Si el navegador restringe la apertura nativa, Fecha queda enfocada. Cancelar el selector devuelve el foco a Categoría. Después de cerrarlo, permanece cerrado hasta pulsar la acción fija «Nuevo gasto» o volver a entrar en la página. El cuerpo se desplaza dentro del diálogo y `visualViewport` adapta el espacio disponible; las acciones permanecen visibles. Cerrar conserva el borrador. Guardar correctamente mantiene el diálogo abierto, actualiza la lista, limpia Concepto/Monto/Notas y las relaciones opcionales, conserva fecha/método/tarjeta/categoría y vuelve al inicio del cuerpo para agilizar la siguiente captura, sin enfocar automáticamente ningún input. «Guardar gasto» usa un icono de disquete y el estilo primario; «Nuevo gasto» usa el signo + y un fondo turquesa sólido `#00fdcf` con texto oscuro para distinguirlo del fondo de la página. «Cerrar» termina la captura y devuelve el foco al botón de apertura. Si falla el guardado local, el error aparece dentro del formulario y conserva sus datos; después del commit en IndexedDB, los errores del servidor se muestran en el pendiente y se reintentan con el mismo UUID. El guardado en curso bloquea acciones duplicadas y cierre. En escritorio con puntero fino se mantiene el formulario integrado. En la captura móvil de Gastos, Compras a meses, Suscripciones, Ingresos, Cuentas por cobrar y Cuentas por pagar, las confirmaciones de guardado se muestran con Alert dentro del formulario, en una zona reservada sobre las acciones: no cubren la cabecera ni los botones de cierre y no desplazan las acciones al aparecer. La confirmación conserva el icono de verificación y el tratamiento verde de éxito. La región de estado anuncia el resultado sin mover el foco y desaparece automáticamente tras 3 segundos, sin desplazar los botones; también se limpia al intentar otro guardado o cerrar el diálogo. El modo sin conexión indica que el gasto está pendiente de sincronizar. Escritorio conserva el toast de guardado; los demás avisos se sitúan por encima de la acción fija.
- Al guardar un gasto válido en la captura móvil, `ExpenseCreateSurface` habilita `showSavingOverlay` de `CreateRecordSurface`: una capa de pantalla completa compuesta con `Dialog` y el `Spinner` canónicos de shadcn. Anuncia «Guardando gasto», cubre también la cabecera y bloquea la interacción mientras el POST y la actualización de la lista están pendientes. Se retira al terminar o fallar la operación y devuelve el foco al contenedor de captura, sin abrir el teclado. Si falla la persistencia local conserva el formulario; si falla el envío, conserva la captura en la cola con el mismo UUID. El formulario expone su estado con `aria-busy`.
- `toast` siempre desde `@/components/ui/sonner` (o re-export de `sonner`). No importar `sonner` directamente si ya hay wrapper local.
- Los campos de fecha usan `DatePicker` de `src/components/ui/date-picker.jsx`. En dispositivos con interacción táctil principal (`pointer: coarse`, incluidos celulares y la PWA instalada) usa `Input type="date"` para abrir el selector nativo del navegador o sistema; en escritorio usa `Popover` y `Calendar` de shadcn, con encabezado sin selectores y navegación por flechas. La detección no depende del ancho de pantalla y respeta la hidratación de React. Recibe y devuelve fechas `YYYY-MM-DD`; usar `clearable` en fechas opcionales que el usuario pueda borrar.
- Botones destructivos siempre con `AlertDialog` de confirmación antes de ejecutar borrado.
- Los paneles desplegables usan `Collapsible`; las barras de progreso, `Progress`; los avisos, `Alert`; las listas de registros, `Item`; los estados sin datos, `Empty`.
- En Gastos móvil, categoría, concepto, tarjeta/efectivo y monto exacto se reúnen en `ExpenseFilterCombobox`, compuesto con el Combobox múltiple oficial de shadcn. Día y mes conservan sus controles. Las selecciones aparecen como etiquetas removibles; «Limpiar filtros» borra las etiquetas y la búsqueda, conservando el período. La acción móvil «Quitar filtros», junto al título «Gastos filtrados», borra además el día y el mes; los tres campos conservan el mismo ancho completo. La búsqueda ofrece los catálogos, conceptos e importes del período; permite añadir conceptos parciales y montos MXN escritos (con punto decimal y coma de millares). Varias opciones del mismo campo son alternativas y los campos distintos se intersectan. `expenseFilters.js` aplica las mismas reglas a gastos guardados y pendientes, a centavos e ignorando acentos/mayúsculas en conceptos. Móvil consulta el período completo desde la API existente y filtra localmente; seleccionar etiquetas no genera nuevas peticiones. Escritorio conserva sus cuatro filtros y consultas originales, con estado independiente; cambiar de tamaño vuelve a consultar según la presentación. El componente Base UI se instala como dependencia del Combobox sin migrar los demás componentes Radix.
- En Gastos, «Gastos filtrados» usa `DailyExpenseCards` en pantallas menores de 768 px: una tarjeta por día, del más reciente al más antiguo, con cantidad de gastos y total de los movimientos filtrados sumado a centavos. Incluye los pendientes de sincronizar y los identifica en el resumen y las filas. Cada gasto conserva concepto, importe, categoría, método, notas, relaciones y acciones de edición/eliminación; las acciones requieren conexión y los pendientes no se editan. Al consultar varios días se muestra el total filtrado y se cargan siete días completos por tanda con «Ver más días», sin dividir un día entre páginas. Los filtros reinician la tanda; los estados de carga y sin resultados también se adaptan a móvil. Escritorio conserva la tabla y su paginación.
- En móvil, Compras registradas, Suscripciones, Ingresos y Cuentas por cobrar usan cards de `record-card.jsx`, compuestas con `Item`, en lugar de filas de tabla. Compras destaca mensualidad, saldo, próximo pago y avance de cuotas con `Progress`; Suscripciones, importe por cobro, frecuencia, método y estado; Ingresos, monto, fecha, tipo y cuenta vinculada; Cuentas por cobrar, persona, concepto, saldo y acceso a pagos. Conservan notas, relaciones, edición y eliminación. `DataTable` comparte los registros filtrados, el orden y la paginación con escritorio; `RecordListToolbar` ofrece ordenamiento móvil por las columnas existentes y totales de todas las filas filtradas, sumados a centavos. Cuentas por pagar adopta la misma jerarquía móvil, con saldo pendiente destacado y su historial `Collapsible` y edición integrada. Los listados evitan una card contenedora adicional en celular y tienen acciones de 44 px y carga con `Skeleton`; escritorio conserva su presentación.
- Las gráficas usan `ChartContainer`, `ChartTooltipContent` y `ChartLegendContent` con la configuración y tokens del wrapper local. `DataTable` compone los controles shadcn con TanStack Table; el ordenamiento usa `Button` dentro del encabezado.
- En Tarjetas, «Ciclos mensuales» usa `Item` con fondo y borde propios y separación de 12 px en pantallas menores de 768 px; el contenedor general deja de verse como una tarjeta en móvil. Cada ciclo muestra tarjeta, estado, la comparativa «Pago calculado» (estimado) y «Estado de cuenta» (o «Sin capturar»), corte, límite de pago y acceso al desglose. La comparación conserva los estados de cuenta de cero y está visible sin abrir Detalles. «Detalles» abre el Dialog canónico con el nombre de la tarjeta, importes, fechas y pagos registrados. Los formularios se componen con `FieldGroup`, `Field` y `FieldLabel`. Fechas, cuenta y pago cambian la vista dentro del mismo diálogo, con «Volver a detalles»; guardar actualiza la lista y cierra el diálogo, restaurando el foco al botón de origen sin expandir los registros. Las respuestas tardías de un desglose cerrado se descartan. Los ciclos aparecen después de Crédito y deuda, sin pestañas de navegación, botón de generación ni búsqueda por tarjeta o estado. Mes y orden comparten una fila de `ResponsiveSelect`; el mes usa una etiqueta abreviada en el selector móvil y nombres completos en las opciones, con nombres accesibles y sin la etiqueta visible «Ordenar», en móvil y escritorio. El orden predeterminado es por límite más próximo; se conserva al cambiar de mes dentro del año actual. La administración de tarjetas permanece en un `Collapsible` cerrado al final de la página. Escritorio conserva la tabla y su ordenamiento por encabezados. `DataTable` admite `initialSorting`, `toolbarStart` como contenido o función de la tabla, `renderMobileRow`, `mobileToolbar` y `mobileRowSeparator`, compartiendo orden y paginación. Las fechas se muestran respetando el día UTC almacenado.
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
# Instalar exactamente las versiones del lockfile (incluye herramientas de build)
pnpm install --frozen-lockfile

# Dev (puerto 3000)
pnpm dev

# Build (incluye prisma generate)
pnpm build

# Lint y regresiones
pnpm lint
pnpm test

# Auditorías separadas: producción y árbol completo
pnpm audit:prod
pnpm audit:all

# Regenerar iconos de instalación desde el SVG
pnpm icons:generate
```

### Dependencias y seguridad (A10)

**Actualización implementada · 17 de octubre de 2026.** Usar **pnpm 10.33.0** (declarado en `packageManager`) y conservar `pnpm-lock.yaml`. Verificado con Node.js 22.23.2. Instalar con `pnpm install --frozen-lockfile`; no generar un segundo lockfile con npm.

- Next.js y `eslint-config-next` quedan fijados en **16.3.8**; Sharp en **0.35.5**, compartido con la dependencia opcional de Next. Prisma, Client y adapter-pg se actualizan juntos a **7.10.1**. Las demás actualizaciones respetan sus versiones mayores; React y React DOM permanecen en 19.2.4. No se añadieron overrides forzados.
- `shadcn` **4.22.0** pasa a desarrollo. Su import `shadcn/tailwind.css` sigue siendo necesario al compilar: instalar también `devDependencies` en el entorno de build. La CLI no forma parte de la instalación de producción. Prisma permanece disponible para el flujo existente de generación y migraciones.
- `pnpm audit:prod`: **cero avisos**. `pnpm audit:all`: queda **un aviso alto** de `braces@3.0.3`, sin parche publicado, a través de herramientas de desarrollo (ESLint y shadcn). Se conserva visible: no hay exclusiones ni reducción del umbral. No hay una ruta de producción que lo use; ejecutar estas herramientas solo con patrones y configuraciones de confianza. Revisar el [aviso pendiente](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) en la siguiente actualización y sustituirlo cuando exista una corrección compatible.
- Los resultados corresponden al registro consultado en esta fecha; repetir ambas auditorías antes de publicar. El detalle, la comparación antes/después y los límites de verificación están en el [cierre A10](artifacts/auditoria-2026-10-15/informe.md#A10-seguimiento).

### Prisma (desde raíz del proyecto)

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec prisma studio          # explorador visual de BD
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

**Última publicación autorizada · 21 de octubre de 2026:** `dpl_4vn4oDLnajjHffjUVAi7mKyKrCaC`, estado `READY`, con el seguimiento de captura y la exclusión de avisos de débito. Fuentes públicas del árbol de trabajo sobre `3ef6ae2`, identificadas por su manifiesto en la [evidencia de Fase 6](artifacts/android-fase6/production-deployment.json); no se hizo commit ni push. La migración aditiva pendiente de Fase 5 se aplicó y verificó antes de publicar. Las API siguen exigiendo sesión; los formatos de crédito continúan bloqueados hasta validar muestras reales.

**Despliegue histórico de Digital Asset Links · 20 de octubre de 2026:** `dpl_3ydQbyNmuVbf8g2nWPAJgEJz4Bnk`, estado `READY`, desde la base `505b47e` con Digital Asset Links añadido. La base coincide con la versión anterior; el cambio web de esta publicación es el archivo público de relación con Android. Se publicaron 196 archivos de la web y configuración de compilación mediante Vercel MCP, con las variables existentes del proyecto; las claves y datos de `android/` permanecieron locales. Se comprobaron páginas públicas, manifest y rechazo 401 en API sin sesión. No se ejecutaron migraciones ni escrituras financieras. [Evidencia y despliegue anterior](artifacts/android-fase1/deployment.json).

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
