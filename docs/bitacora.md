# Bitácora del proyecto

Historial resumido de decisiones, cambios, migraciones e incidencias que ayudan a mantener AFP. El funcionamiento vigente y los procedimientos están en el [README](../README.md); los resultados detallados permanecen en [artifacts/](../artifacts/).

Consolidado el **27 de octubre de 2026** a partir del README del commit `4562aa0cec0a46d8b482fdfef96116d1d3040282` y sus evidencias. «Publicado», «aplicado» y «pendiente» describen lo documentado en cada fecha; esta consolidación no incluye una comprobación remota nueva. Se conservan las fechas de los registros originales, que pueden usar hora local o UTC. El nombre de una migración identifica su versión, no demuestra cuándo se aplicó.

## 2026-10-28

### Plan de migración de pruebas y helpers a TypeScript

Se preparó el [plan independiente](plan-migracion-tests-typescript.md) sobre `6aad1ab`: 106 archivos de pruebas y 11 helpers CJS. Define referencia, ejecución mixta con `node:test`, contratos del cargador y mocks, piloto de transferencias, conversión por módulos, fixtures de navegador y cierre con PostgreSQL y `db:verify`. La implementación está pendiente; no modifica el cierre de la migración web ni incorpora cambios de código, dependencias o despliegue.

### Cierre de la migración web a TypeScript

**Fase 7 completada localmente.** Los 275 módulos TS/TSX de `src/` están incluidos en el programa estricto con `allowJs: false`. Se retiraron los adaptadores de UI de Mi dinero, el wrapper del piloto de transferencias y el cliente financiero temporal sin consumidores. Los 14 archivos vacíos se eliminaron sin contarlos como módulos migrados. El cargador de pruebas exige el archivo exacto cuando la ruta declara una extensión; se actualizaron las referencias históricas que aún lo necesitaban.

Se revisaron las interfaces y entradas externas, las 58 conversiones locales y los límites cliente/servidor, sin `any`, supresiones TypeScript, dobles conversiones ni declaraciones que oculten módulos pendientes. ESLint impide encadenar conversiones. Mi dinero usa los contratos reales de los componentes compartidos, incluido el tooltip de proyección; el formulario común conserva el UUID en reintentos y lo renueva cuando cambia el contenido.

La instalación limpia, tipos, contratos negativos, lint, 854 pruebas con PostgreSQL sin omisiones, build y `db:verify` pasaron. Se verificaron las 42 migraciones, 45 tablas con RLS y las 12 respuestas del piloto contra fase 0. En navegador se guardaron transferencias de $125.50 en escritorio y $38.75 en móvil, con un recibo por operación, centavos y total conservados; selector por teclado, foco del diálogo, retorno al botón y tooltip correctos, sin errores de página ni desbordamiento.

README, producto y plan reflejan el cierre y las excepciones previstas: pruebas/scripts JS/CJS, configuraciones `.mjs`, `public/sw.js` y Android Kotlin fuera del programa web. Sin cambios de esquema, SQL, dependencias, APK ni publicación. Resultados, revisión de conversiones y reproducción: [fase 7](../artifacts/typescript-migration/phase-7/README.md).

### Interfaz, hooks y páginas en TypeScript

**Fase 6 completada localmente.** Se convirtieron 135 módulos con contenido: páginas/layout restantes, seis hooks, pantallas y componentes compartidos. Props, refs, eventos, tablas y gráficas usan los tipos de sus bibliotecas. Los clientes validan las respuestas dentro de la recuperación HTTP y conservan el JSON original, incluidos metadatos, claves omitidas y orden usado por Captura. El cálculo de importes de pago se separó del estado de calendario para consumir detalles sin fechas.

Pasaron tipos, contratos negativos, lint, build y 854 pruebas con PostgreSQL local, sin fallos ni omisiones. Se verificaron reconstrucción y actualización de BD, límites cliente/servidor y 26 recorridos de navegador entre móvil y escritorio. Las comprobaciones incluyen centavos, teclado/foco, borrador restaurado, gasto offline sincronizado una vez con el mismo UUID, correcciones sucesivas y recuperación de una respuesta incompleta.

`components.json` habilita TSX. Se actualizaron README, producto, plan y referencias de UI. La fase 7 conserva la retirada de adaptadores/fallbacks, `allowJs` y los 14 archivos vacíos inventariados. Sin cambios de esquema, SQL, dependencias, APK ni publicación. Resultados, advertencias y reproducción: [fase 6](../artifacts/typescript-migration/phase-6/README.md).

### Captura Android, Calendar y offline en TypeScript

**Fase 5 completada localmente.** Se migraron protocolo, parsers, reglas, revisión, conciliación, avisos Android, comprobantes y todos los endpoints de Captura; OAuth, agenda, sincronización y tareas de Calendar; y la cola offline con su observador de cambios. Los comandos distinguen resoluciones y las lecturas de JSON preservan las propuestas parciales, notas históricas y el orden usado por los controles de concurrencia.

Las verificaciones se ejecutaron por lote con PostgreSQL desechable. Las interpretaciones de 19 fixtures coinciden con el JavaScript anterior; el cifrado Calendar v1 sigue siendo legible en ambas direcciones. En navegador, una cola creada antes de convertirla conserva UUID, se recupera tras una respuesta perdida y confirma entre pestañas con un solo envío bajo Web Locks. IndexedDB mantiene nombre, almacenes y versión 1, y el service worker conserva su exclusión de API privadas.

El interior de las pantallas/hooks JSX queda para fase 6. No se cambió esquema, SQL, lockfile ni APK, ni se publicó o activaron reglas. Los resultados, tiempos, incidencias de preparación y límites están en la [fase 5](../artifacts/typescript-migration/phase-5/README.md).

## 2026-10-27

### Núcleo financiero y API compartida en TypeScript

**Fase 4 completada localmente.** Se tiparon cálculos de tarjetas/MSI, suscripciones, deudas, gastos, ingresos, bootstrap, Dashboard y análisis, junto con autorización, operaciones transaccionales, Prisma, Supabase y recuperación HTTP. Las consultas conservan inferencia de relaciones Prisma; los JSON externos se validan o acotan. Gastos distingue efectivo, tarjeta y débito, y se conservan saldos parciales y el cero bancario confirmado.

Los consumidores JSX pasan por una frontera de validación de respuestas dentro de la recuperación compartida. Mi dinero usa directamente el núcleo tipado y se retiró su adaptador temporal de cálculos. La instalación limpia, las pruebas con PostgreSQL, la reconstrucción de BD y las comprobaciones de navegador se documentan en la [fase 4](../artifacts/typescript-migration/phase-4/README.md). Captura, Calendar, offline y el interior de las pantallas restantes siguen en sus fases previstas. Sin cambios de esquema, migraciones, lockfile ni despliegue.

### Mi dinero completo en TypeScript

**Fase 3 completada localmente.** Se migraron cuentas/conciliaciones, rutas/planes, presupuestos, rendimientos, fuentes y proyección, junto con `/api/money`, los formularios y la presentación mensual. La instantánea de Prisma tiene propiedades explícitas y conserva sus 15 consultas secuenciales; las transferencias reutilizan sus cuentas y movimientos sin lecturas duplicadas. Se validan JSON históricos y respuestas sin cambiar formatos persistidos, fórmulas ni huellas de operación.

La comprobación estricta incluye entrada/salida de Zod, comandos por acción y 13 casos negativos nuevos. Se conservó el descubrimiento de pruebas de autorización al convertir `route.js` a `route.ts`. La instalación limpia pasó tipos, lint, pruebas con PostgreSQL y build; las 12 respuestas de referencia permanecen idénticas. El navegador verificó cuentas con rendimientos, conciliación, nómina, asignación, escenarios sin escrituras, foco, borradores y reenvío del mismo UUID tras perder una respuesta.

Persisten fronteras locales con componentes JSX compartidos y cálculos financieros de fases posteriores. Sin cambios de esquema, SQL, lockfile ni despliegue. Resultados, tiempos, advertencias y límites: [fase 3](../artifacts/typescript-migration/phase-3/README.md).

### Piloto de transferencias en TypeScript

**Fase 2 completada localmente.** Se tiparon los contratos de `TRANSFER`/`REVERSE_TRANSFER`, su persistencia con `Prisma.TransactionClient`, el cliente con validación de respuesta y el adaptador del formulario compartido. La huella sigue usando el cuerpo original; bloqueo, escritura y recibo permanecen en una sola transacción. Las otras acciones, el handler y el interior del editor continúan en JavaScript.

Pasaron typecheck, ocho nuevos casos negativos de tipos, lint, build y **840 pruebas con PostgreSQL local, sin fallos ni omisiones**. Las 12 respuestas del piloto coinciden con la fase 0. El navegador verificó teclado/foco, móvil/escritorio, centavos, reversión, respuesta perdida con el mismo UUID y recarga fallida después de guardar. Se conservan la advertencia de lint de TanStack Table y la de `pg`.

Sin cambios de esquema, migraciones, lockfile ni despliegue. Se acotaron tres lotes para completar Mi dinero y se documentaron los adaptadores temporales y consultas duplicadas. Evidencias y reproducción: [fase 2](../artifacts/typescript-migration/phase-2/README.md).

### Herramientas para la migración a TypeScript

**Fase 1 completada localmente.** Se añadieron TypeScript 6.0.3, los tipos de Node 22/React 19, esbuild y `dotenv` como dependencias directas. `tsconfig.json` sustituye a `jsconfig.json`; `typecheck` y `test:types` son verificaciones obligatorias. ESLint comprueba usos inseguros en TS/TSX y el build conserva la detección de errores.

Las pruebas usan transformación en memoria con imports reales y mocks explícitos, conservando `node:test`, caché y entorno ficticio. Se adaptaron los cargadores históricos y los tres fixtures. Pasaron 828 pruebas con PostgreSQL local, sin fallos ni omisiones; las 820 anteriores se conservan y se añaden ocho de infraestructura. No se modificaron reglas financieras, fuentes de aplicación, esquema ni migraciones, ni se publicó. Resultados, instalación limpia y límites: [fase 1](../artifacts/typescript-migration/phase-1/README.md). Sigue pendiente el piloto de transferencias de la fase 2.

### Referencia para la migración gradual a TypeScript

**Fase 0 completada localmente.** Se inventariaron 263 archivos JS/JSX (249 con contenido), contratos y cargadores de pruebas. PostgreSQL desechable verificó 42 migraciones y 45 tablas con RLS; pasaron 820 pruebas sin omisiones, lint y build. Un piloto con dos usuarios ficticios conserva 12 respuestas de transferencias y saldos, comparadas en una segunda ejecución con reloj fijo.

Se registraron la advertencia existente de `pg` y un fallo de preparación del build aislado, resuelto copiando sus dependencias. No hubo conversión de código, cambios de esquema ni despliegue. Evidencias y reproducción: [fase 0](../artifacts/typescript-migration/phase-0/README.md). Esta referencia precede la fase 1 del [plan](plan-migracion-typescript.md).

### Presupuestos diarios y previsiones de cobro

**Publicado.** El presupuesto variable pasó a estimar consumo por día para evitar concentrar el remanente mensual al final del mes. El gasto personal de una fecha cubre la previsión de ese día; superar el presupuesto antes no elimina las previsiones posteriores. Se añadió una mezcla de efectivo/débito y crédito basada en meses históricos, manteniendo el pago de crédito en su tarjeta.

La migración aditiva [variable_budget_payment_mix](../prisma/migrations/20261027000000_variable_budget_payment_mix/migration.sql) agregó `MoneyPlan.paymentMix` sin cambiar los planes anteriores. Las previsiones de cobro también pasaron a poder excluirse o asignarse por separado; el pago esperado corresponde a cada fecha, sin dividirlo entre las fechas del mes ni modificar los ingresos reales.

Evidencias: [presupuesto diario](../artifacts/mi-dinero/presupuesto-diario/production.json), [presupuesto mixto y migración](../artifacts/mi-dinero/presupuesto-mixto/production.json), [previsiones de cobro](../artifacts/mi-dinero/cobros-previsiones/production.json).

### Cargos genéricos BBVA como gastos con débito

**Migración aplicada; funcionalidad publicada y activada con autorización.** Se incorporó una regla opcional para tratar cargos genéricos como gastos con débito, cuenta explícita y categoría Por clasificar. Requiere aceptar ese significado, coincidencia exacta de terminación y un aviso compatible; solo afecta avisos nuevos.

La corrección a retiro, transferencia propia o pago de tarjeta sustituye el registro en una transacción, conserva la evidencia y evita una segunda salida de dinero. La migración [bbva_debit_automation](../prisma/migrations/20261027010000_bbva_debit_automation/migration.sql) amplió las reglas y el vínculo con pagos, sin activar automáticamente las configuraciones existentes. No requirió otra APK.

Evidencias: [verificación](../artifacts/bbva-debit-automation/verification.json), [aplicación y publicación](../artifacts/bbva-debit-automation/production.json).

### Carga y presentación de Mi dinero

**Verificado localmente; publicación pendiente en las evidencias citadas.** La lectura libera su transacción antes de calcular proyecciones, comparte consultas en curso y conserva el último resultado válido si falla una actualización. Los fallos temporales de Auth y los errores de disponibilidad de Prisma se presentan como recuperables. Persistió una advertencia de `pg` en el adaptador de Prisma; no se demostró que causara el fallo original ni que este proviniera del Wi-Fi.

El resumen mensual incorporó estados compartidos entre móvil y escritorio y períodos cercanos al mínimo. Por decisión del propietario, los avisos de liquidez evalúan el capital total de todas las cuentas; la revisión histórica queda oculta, conservando su diagnóstico. Estas revisiones no modificaron el esquema ni los movimientos. La comprobación estática no acreditó interacción o apariencia en navegador.

Evidencias: [carga y límites](../artifacts/mi-dinero/carga-resiliente/verificacion.json), [resumen mensual](../artifacts/mi-dinero/resumen-escritorio/verificacion.json), [capital total](../artifacts/mi-dinero/capital-total/verificacion.json).

## 2026-10-26

### Registro automático y devoluciones de compras

**Publicado.** La revisión diaria salió de la pestaña de Configuración y se concentró en `/registro-automatico`, con pendientes, historial, conciliación y ajustes. El traslado reutilizó las operaciones existentes y no necesitó migración ni APK nueva.

La ampliación de devoluciones sí incorporó la migración aditiva [expense_refunds](../prisma/migrations/20261026000000_expense_refunds/migration.sql). Permite revisar devoluciones totales, parciales y cancelaciones, conservando el cargo original y la opción de deshacer. Recibir o reinterpretar un aviso no aplica el reembolso: exige confirmación personal.

Evidencias: [nueva sección](../artifacts/automatic-recording-ux/production.json), [devoluciones](../artifacts/android-refunds/production.json).

### Débito, transferencias y retiros

**Migraciones aplicadas y funcionalidad publicada.** Se añadió `PaymentMethod.DEBIT` con cuenta de salida obligatoria. Las transferencias propias y los retiros pasaron a tener registros canónicos separados de gastos e ingresos. Las reglas de captura conservan consentimiento, identidad del aviso y revisión de coincidencias.

Migraciones: [debit_payment_method](../prisma/migrations/20261026010000_debit_payment_method/migration.sql) y [capture_account_movements](../prisma/migrations/20261026020000_capture_account_movements/migration.sql). Sustituyen la antigua instrucción de capturar débito como efectivo. La activación automática de retiros BBVA quedó condicionada a comprobar primero una muestra real.

Evidencias: [verificación de cuentas](../artifacts/account-capture/verification.json), [publicación](../artifacts/account-capture/production.json).

### Estados y colores de Google Calendar

**Publicado y sincronizado.** Se corrigieron los cobros recurrentes para evaluar cada fecha en su intervalo, evitando aplicar el total mensual a todas las ocurrencias. Se conservaron las identidades de eventos existentes.

La paleta de cuatro tonos fue sustituida por seis roles distinguibles porque azul y gris se confundían. Los cortes pasan a «Corte revisado» cuando tienen fechas confirmadas y monto de estado de cuenta, incluido cero. La migración [card_cycle_dates_confirmation](../prisma/migrations/20261026030000_card_cycle_dates_confirmation/migration.sql) añadió `datesConfirmedAt` sin confirmar automáticamente el historial. La aceptación histórica posterior fue una operación expresamente autorizada, no una regla para cortes futuros.

Evidencias: [cobros por fecha](../artifacts/google-calendar/receivable-labels-production.json), [paleta corregida](../artifacts/google-calendar/distinct-palette/production.json), [cortes revisados](../artifacts/google-calendar/reviewed-cuts/production.json).

### Avisos importantes en Android

**APK actualizada y backend publicado.** Se añadió la recepción de avisos del Dashboard mediante un permiso separado del lector bancario, preferencias persistentes y consultas con WorkManager. La entrega puede demorarse por las restricciones de Android; no es push inmediato. Los avisos respetan ocultaciones y no registran movimientos financieros.

La instalación y publicación no acreditaron la activación de la opción ni una recepción real; ambas quedaron pendientes. No hubo migraciones.

Evidencias: [instalación](../artifacts/android-important-notices/installation.json), [backend y pendientes](../artifacts/android-important-notices/production.json).

## 2026-10-24

### Mi dinero, rendimientos y calendario de nómina

**Publicado con migraciones aplicadas.** Mi dinero incorporó cuentas a la vista, referencias de saldo, asignación de movimientos, conciliaciones, planes y proyección. Se eligió trabajar con referencias capturadas y movimientos de AFP. Una compra de crédito y su pago no representan dos salidas de efectivo; los cobros pendientes siguen siendo previsiones.

Después se añadieron rendimientos históricos y futuros con reglas fechadas. Los abonos reales vinculados sustituyen el cálculo y las conciliaciones absorben lo ya incluido en el banco, sin crear ingresos ficticios. El calendario de nómina permite adelantar depósitos al día hábil bancario anterior, conservando las fechas nominal y efectiva y el tratamiento de la nómina neta.

Las migraciones aditivas de cuentas y rendimientos son [add_money_accounts](../prisma/migrations/20261025000000_add_money_accounts/migration.sql), [money_account_yields](../prisma/migrations/20261025010000_money_account_yields/migration.sql) y [automatic_money_yields](../prisma/migrations/20261025020000_automatic_money_yields/migration.sql); [payroll_business_days](../prisma/migrations/20261025030000_payroll_business_days/migration.sql) agrega la opción de calendario. Sus identificadores son posteriores a la fecha de actividad consignada en el README original.

También se corrigieron la edición de tasas y la modificación del saldo de referencia sin volver a aplicar movimientos. Los rendimientos son cálculos de AFP sujetos a las reglas configuradas; las diferencias con el banco requieren conciliación.

Evidencias: [publicación inicial](../artifacts/mi-dinero/production.json), [rendimientos](../artifacts/mi-dinero/automatic-yields/production.json), [nómina](../artifacts/mi-dinero/payroll-calendar/production.json), [edición de referencia](../artifacts/mi-dinero/reference-edit-verification.json).

### Wallet principal y respaldo bancario

**Publicado y activado con autorización.** Para las tarjetas configuradas se priorizó Wallet y se estableció una espera bancaria de al menos 15 minutos. Al vencer, el servidor vuelve a comprobar reglas, permisos y coincidencias. El retraso reduce el riesgo de duplicar avisos de una misma compra; una coincidencia por importe o comercio sigue requiriendo revisión.

La migración [capture_bank_fallback](../prisma/migrations/20261024020000_capture_bank_fallback/migration.sql) añadió la persistencia de esperas. Se configuró una tarea de un minuto con `pg_cron`, `pg_net` y Vault que solo solicita trabajo si hay vencimientos. Es independiente del mantenimiento diario de Calendar. La evidencia de activación dejó pendiente observar la siguiente compra real de respaldo.

Evidencias: [regresiones](../artifacts/android-bank-fallback/verification.json), [publicación y programación](../artifacts/android-bank-fallback/production.json).

### Fuentes de viajes y tema Android

**Publicado e instalado según cada evidencia.** Se añadieron Uber, DiDi viajes y Uber Eats como fuentes de evidencia para revisión, sin atribuir tarjeta ni crear gastos automáticamente. Se corrigió además la barra de estado blanca de la TWA mediante configuración nativa explícita del tema oscuro; la actualización conservó instalación y permisos. En ese cierre, las etiquetas web de tema seguían pendientes de publicación.

Evidencias: [fuentes de servicios](../artifacts/android-service-notices/production.json), [corrección de tema](../artifacts/android-status-bar/verification.json).

## 2026-10-22 y 23

### Calendar: sincronización por cambios

**Migración aplicada, conexión y publicación verificadas.** Se incorporó OAuth de servidor y un calendario propio de AFP con credenciales cifradas. Tras una primera versión con sondeo, se pasó a sincronizar después de los cambios financieros y continuar los lotes en el trabajador. Se retiró el cron de cinco minutos de Supabase; Vercel conserva una revisión diaria para mantenimiento y recuperación.

La decisión evita contactar Google cuando no hay cambios y conserva los identificadores de eventos. Desconectar retira eventos futuros y conserva historial. La migración [add_google_calendar_sync](../prisma/migrations/20261023000000_add_google_calendar_sync/migration.sql) añadió conexiones, estados OAuth, referencias de eventos y triggers.

Evidencias: [publicación inicial](../artifacts/google-calendar/production-deployment.json), [comparación contra Google](../artifacts/google-calendar/google-verification.json), [retiro del sondeo](../artifacts/google-calendar/events-verification.json).

### Pagos por notificaciones y comprobantes compartidos

**Publicado con migraciones aplicadas y actualización Android.** Se añadió OCR local de comprobantes compartidos y reglas para registrar abonos desde fuentes compatibles. La revisión distingue «Sumar este pago» de «Ya lo había registrado»: conservar evidencia no debe duplicar el acumulado del corte.

[capture_card_payments](../prisma/migrations/20261023030000_capture_card_payments/migration.sql) y [automatic_payment_receipts](../prisma/migrations/20261023040000_automatic_payment_receipts/migration.sql) incorporaron abonos y políticas. [receiver_payment_notices](../prisma/migrations/20261023060000_receiver_payment_notices/migration.sql) amplió las fuentes receptoras. Los cargos genéricos de salida no prueban por sí solos qué tarjeta se pagó; avisos contradictorios o coincidencias ambiguas permanecen en revisión.

Evidencias: [comprobantes y publicación](../artifacts/android-payment-sharing/production-verification.json), [pagos receptores](../artifacts/android-receiver-payments/production-financial-verification.json).

### Activación gradual de formatos reales

**Ampliaciones publicadas y habilitadas por fuente.** Se incorporaron formatos reales de compras Wallet y avisos bancarios de distintos emisores. Cada activación se apoyó en evidencia revisada y reglas expresas; un formato sintético o una fuente instalada no acredita cobertura de todas sus operaciones. Wallet puede aportar fecha de notificación sin demostrar la fecha bancaria de compra; la aceptación de esa política se conserva por tarjeta/formato.

Evidencias representativas: [Wallet/Banamex](../artifacts/android-wallet-banamex/production-state.json), [Santander](../artifacts/android-santander/production.json), [Nu y Mercado Pago](../artifacts/android-nu-mercadopago/production.json), [BBVA Wallet](../artifacts/android-bbva-wallet/production.json). El detalle por fuente permanece en la [guía Android](android-captura.md).

### Préstamos y conciliación de cuentas por cobrar

**Aplicado y publicado.** Se distinguió el capital pendiente conciliado del préstamo, sus intereses y los reembolsos de terceros. La migración [receivable_balance_adjustment](../prisma/migrations/20261023050000_receivable_balance_adjustment/migration.sql) añadió un ajuste firmado y su explicación: conciliar una cuenta no equivale a recibir dinero ni a amortizar nuevamente un préstamo.

Las reconstrucciones históricas conservaron la diferencia entre pagos comprobados y estimados. Importes, comprobantes y respaldos personales permanecen fuera de Git.

Evidencias: [reglas de préstamos](../artifacts/prestamos-nomina/verificacion.json), [conciliación y alcance de la verificación](../artifacts/conciliacion-cobros/produccion.json).

## 2026-10-21

### Vinculación, cola y revisión de captura Android

**Implementado, con aplicaciones y publicaciones documentadas por fase.** Se incorporaron identidad nativa revocable, cola cifrada, recibos por evento y registro transaccional. Las fases posteriores añadieron alias, revisión, conversión a MSI, conciliación y activación gradual. La credencial nativa quedó separada de la sesión Supabase y limitada a sus endpoints.

Las migraciones de captura de esta fecha están en el [historial SQL](../prisma/migrations/). El motor inicial usó formatos sintéticos no activables; la habilitación real se realizó después por fuente. Las pruebas sintéticas no sustituyeron esa aceptación.

Evidencias: [vinculación](../artifacts/android-fase2/produccion.json), [cola](../artifacts/android-fase3/verification.json), [motor y publicación](../artifacts/android-fase4/production-deployment.json), [revisión](../artifacts/android-fase5/verification.json), [piloto](../artifacts/android-fase6/production-deployment.json).

### Incidencia: migración de prueba dirigida a Supabase

**Recuperada.** Una invocación de prueba perdió la variable que sustituía la conexión por localhost y utilizó la conexión configurada de Supabase. La migración `20261021010000_add_capture_processing` se interrumpió y dejó un esquema parcial.

Se respaldó antes de reparar, se completaron restricciones y se verificaron esquema, RLS y checksum antes de cerrar el registro interrumpido. La comparación confirmó filas idénticas antes y después de la reparación; **no existía un snapshot anterior a la primera invocación equivocada**. La migración siguiente se aplicó posteriormente con autorización.

La lección operativa es conservar la conexión de prueba explícita en cada invocación y limitar los verificadores a bases locales desechables. La recuperación registrada fue específica de esa incidencia; no sustituye el flujo normal de migraciones.

Evidencias: [incidencia y límites](../artifacts/android-fase4/production-recovery.json), [cierre posterior](../artifacts/android-fase4/production-deployment.json).

### Capturas de saldo y seguimiento del crédito

**Migraciones aplicadas; el cierre de BD del seguimiento dejó la publicación web pendiente.** Se incorporaron límite, saldo bancario y fecha de referencia, y después seguimiento por cambios de exposición. Una MSI aporta su importe completo una sola vez; los pagos reales liberan crédito. Conciliar establece otra referencia sin crear movimientos ficticios.

Migraciones: [add_card_credit_balances](../prisma/migrations/20261021040000_add_card_credit_balances/migration.sql) y [add_card_balance_tracking](../prisma/migrations/20261022000000_add_card_balance_tracking/migration.sql). La segunda consta el 21 de octubre local y el 22 UTC. Posteriormente la interfaz se separó en Crédito y deuda; Tarjetas conservó ciclos y pagos.

Evidencias: [captura bancaria](../artifacts/saldos-tarjetas/produccion.json), [seguimiento y alcance del cierre](../artifacts/saldos-automaticos/produccion.json), [traslado de la interfaz](../artifacts/credito-y-deuda/verificacion.json).

## 2026-10-20

### Gastos compartidos y primera publicación de Digital Asset Links

**Migración aplicada y funcionalidad publicada.** Se separó el cargo pagado al comercio de la aportación ya recibida en efectivo: esta reduce el gasto personal, conservando el cargo completo para tarjetas y consumo mínimo. La migración [add_cash_expense_contributions](../prisma/migrations/20261020000000_add_cash_expense_contributions/migration.sql) añadió importe y restricción sin generar ingresos ni cuentas por cobrar.

La publicación de Digital Asset Links vinculó el dominio con la firma Android y permitió la TWA verificada. Esa publicación incluyó la funcionalidad de gastos compartidos. Firma, datos del teléfono y distribución de la APK mantuvieron su ciclo separado del despliegue web.

Evidencias: [migración](../artifacts/gastos-compartidos/produccion.json), [publicación web](../artifacts/android-fase1/deployment.json).

## 2026-10-15 a 17

### Auditoría, autorización e integridad financiera

La auditoría detectó acceso a API sin validación suficiente del propietario, riesgos de duplicación offline, inconsistencias de saldos y operaciones relacionadas no atómicas. Se incorporaron Bearer validado, aislamiento por usuario y referencias, exclusión de API del service worker, IndexedDB con UUID y recibos transaccionales. Los pagos parciales, abonos y ediciones de deudas pasaron a usar cálculos y transacciones compartidos.

La migración [add_expense_operations](../prisma/migrations/20261017000000_add_expense_operations/migration.sql) persistió los recibos idempotentes; [add_post_cut_credits](../prisma/migrations/20261017030000_add_post_cut_credits/migration.sql) incorporó devoluciones aplicadas al pago del corte. La revisión del 21 de octubre documentó la publicación de las correcciones cubiertas, con aceptaciones operativas todavía separadas de las pruebas con Auth simulada.

Evidencias: [auditoría y seguimiento](../artifacts/auditoria-2026-10-15/informe.md), [captura offline](../artifacts/auditoria-2026-10-15/a02-verificacion.json), [pagos y devoluciones](../artifacts/devoluciones-2026-10-17/verificacion.json).

### Reconstrucción del esquema y dependencias

**Migraciones de seguridad aplicadas.** Se recuperó una migración histórica ausente verificando su checksum contra el registro aplicado. [enable_application_rls](../prisma/migrations/20261017020000_enable_application_rls/migration.sql) versionó RLS y la activación de seguridad para tablas nuevas. Se añadieron herramientas para auditar historial y reconstruir desde cero y desde una versión anterior, sin reemplazar el historial por `db push`.

Se fijó pnpm como gestor y se actualizaron dependencias. Los resultados favorables de auditoría de esos días no describen el estado posterior: la consulta del 27 de octubre volvió a registrar hallazgos, incluidos críticos de producción.

Evidencias: [historial y aplicación](../artifacts/auditoria-2026-10-15/a11-produccion.json), [revisión del 21 de octubre](../artifacts/auditoria-2026-10-15/revision-2026-10-21.json), [auditoría del 27 de octubre](../artifacts/mi-dinero/presupuesto-diario/dependency-audit.json).

## Seguimientos al consolidar esta bitácora

Estos puntos conservan el estado de la evidencia citada; antes de retomarlos, comprobar si una intervención posterior ya los resolvió.

| Tema | Último estado documentado | Evidencia |
| --- | --- | --- |
| Dependencias | Hallazgos pendientes al 27 de octubre; repetir las auditorías y evaluar correcciones compatibles | [Auditoría](../artifacts/mi-dinero/presupuesto-diario/dependency-audit.json) |
| Nómina automática | Solicitada, sin regla implementada ni activa al 27 de octubre. Falta una notificación Android que permita verificar importe real, fecha y terminación; el buzón interno bancario no demuestra esos campos | README histórico, sección «Automatización de nómina solicitada», recuperable con el comando indicado abajo |
| Avisos importantes Android | Backend publicado y APK instalada; faltaba activar la opción, conceder permiso y confirmar recepción | [Cierre del 26 de octubre](../artifacts/android-important-notices/production.json) |
| Mi dinero | Publicación pendiente en los cierres locales de carga, capital total y resumen; advertencia de `pg` sin causa demostrada del fallo original | [Carga](../artifacts/mi-dinero/carga-resiliente/verificacion.json), [capital total](../artifacts/mi-dinero/capital-total/verificacion.json), [resumen](../artifacts/mi-dinero/resumen-escritorio/verificacion.json) |
| Retiros BBVA | Automatización condicionada a registrar y validar una muestra real; un cargo genérico no demuestra un retiro | [Verificación de cuentas](../artifacts/account-capture/verification.json) |
| Auditoría general | El informe del 21 de octubre conserva correcciones y aceptaciones abiertas. Sus estados requieren cotejo con las ampliaciones posteriores; no se revalidaron en esta consolidación | [Informe](../artifacts/auditoria-2026-10-15/informe.md#estado-actual) |

## Cómo mantenerla

- Agregar entradas por fecha para cambios de comportamiento, decisiones con su motivo, migraciones, incidentes o limitaciones relevantes. Agrupar ajustes de una misma función.
- Indicar qué quedó implementado, verificado, aplicado o publicado, según la evidencia disponible. Si un cambio sustituye una decisión anterior, enlazar su antecedente y explicar el motivo.
- Enlazar resultados detallados en `artifacts/`; evitar copiar conteos de pruebas, IDs de despliegue y relatos paso a paso. Actualizar el seguimiento cuando exista evidencia de cierre.
- Conservar importes personales, estados de cuenta, respaldos y credenciales fuera de Git. La bitácora registra el efecto técnico de una conciliación, no sus operaciones privadas.
- Actualizar el README cuando cambie el funcionamiento vigente. Las guías técnicas conservan los procedimientos reproducibles; esta bitácora conserva los antecedentes.

El texto anterior a la reorganización puede consultarse desde la raíz sin sobrescribir archivos:

```bash
git show 4562aa0cec0a46d8b482fdfef96116d1d3040282:README.md
```
