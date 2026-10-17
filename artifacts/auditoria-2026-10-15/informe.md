AFP · Auditoría técnica y propuestas de producto · 15 de octubre de 2026

# Proteger los datos y asegurar los registros antes de ampliar funciones

La aplicación tiene una base funcional sólida para gastos, cortes, MSI, suscripciones y conciliación. La auditoría original detectó como hallazgo prioritario la ausencia de autorización en 12 de sus 14 rutas API; A01 ya tiene una corrección implementada y verificada localmente. A02 también tiene una corrección local de sincronización; permanecen los hallazgos sobre estados financieros y consulta del historial.

**14 hallazgos priorizados: 1 P0, 6 P1 y 7 P2.** P0 exige atención inmediata si la app es accesible por terceros; P1 protege datos o decisiones financieras; P2 corrige exactitud, experiencia o crecimiento. Las alertas del gestor de paquetes se agrupan como un hallazgo y no representan 91 fallos explotados en AFP.

**Seguimiento · 17 de octubre de 2026:** 2 hallazgos implementados localmente (A01 y A02) y 12 pendientes. La actividad de implementación de A02 queda **concluida**. El despliegue autorizado y las verificaciones integradas con PostgreSQL siguen pendientes; no se declaran resueltos en producción. [A01](#A01-seguimiento) · [A02](#A02-seguimiento).

**Contenido**

- [Alcance y pruebas](#alcance)
- [Hallazgos](#hallazgos)
- [Mejoras técnicas](#mejoras)
- [Funciones propuestas](#features)
- [Orden de implementación](#orden)

<a id="alcance"></a>

## Alcance y evidencia originales · 15 de octubre

Se leyó el README y se contrastó con las rutas API, el esquema y migraciones Prisma, cálculos, cola offline, service worker y componentes principales. Se ejecutó la compilación de producción, lint y pruebas. Se inspeccionaron metadatos de Supabase en una transacción de solo lectura. Durante la auditoría original no se modificaron la aplicación ni los datos financieros. La implementación posterior de A01 se documenta en su seguimiento; los resultados y archivos de esta sección se conservan como evidencia histórica.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Pruebas existentes | 104 casos: 103 pasan y 1 omitido. Integración PostgreSQL requiere `AFP_TEST_DATABASE_URL` local. | [Log](pruebas.log) |
| Lint y build | Build correcto. Lint: cero errores y una advertencia de compatibilidad entre React Compiler y useReactTable en data-table.jsx:61. La primera compilación falló por acceso a Google Fonts dentro del sandbox; fuera del sandbox terminó correctamente. | [Lint](lint.log) · [Build](build.log) |
| Reproducciones aisladas | 14 casos que documentan 9 familias de problemas. Ejecutan código fuente real con BD y red simuladas; no escriben en Supabase. | [Script](repro.cjs) · [Resultados](reproducciones.json) |
| HTTP sin sesión | `/api/expenses?userId=audit-nonexistent-user` devuelve 200; `/api/subscription-charges?month=2026-10` devuelve 401. Se usó un usuario inexistente. | [Verificación](verificacion.json) |
| Base conectada | RLS activo en 16 tablas, sin políticas públicas. El rol de Prisma tiene `BYPASSRLS` y es propietario de gastos. 13 migraciones aplicadas frente a 12 locales. | [Metadatos resumidos](verificacion.json) |
| Navegador | Login a 390×844 y 1440×900, sin errores de consola observados. Dashboard redirige al login sin sesión. | [Móvil](login-mobile.png) · [Escritorio](login-desktop.png) |
| Dependencias | `pnpm audit --prod`: 94 incidencias y 91 avisos únicos; 4 avisos únicos críticos, 36 altos, 46 moderados y 5 bajos. | [Detalle y cadenas de dependencias](dependencias.json) |

**Límites:** no hubo sesión autenticada para recorrer visualmente los módulos privados; no se ejecutaron altas ni borrados reales ni una prueba de penetración en producción. Las reproducciones con mocks comprueban las decisiones del código, no sustituyen pruebas integradas con PostgreSQL. La prueba de integración existente quedó omitida. No se certifica accesibilidad WCAG ni se afirman métricas de rendimiento en producción.

Para repetir las reproducciones desde la raíz: `node artifacts/auditoria-2026-10-15/repro.cjs`. El script verifica el comportamiento defectuoso observado originalmente y no es una prueba de aceptación de las correcciones. Para A01, las regresiones actuales están en `tests/api-authorization.test.cjs` y `tests/api-fetch.test.cjs`; ejecutar `node --test tests/*.test.cjs` desde la raíz.

<a id="hallazgos"></a>

## Hallazgos, impacto y corrección

<a id="A01"></a>

### A01 · P0 · API sin autenticación y autorización

**Estado: implementado y verificado localmente · 17 de octubre de 2026.** Pendiente de despliegue y validación integrada. La evidencia y las referencias de líneas siguientes describen el estado original del 15 de octubre.

**Evidencia:** `src/app/api/expenses/route.js:126,218,346,443`, `cards/route.js:101` y `setup-user/route.js:26`. Doce rutas aceptan el usuario del cliente o modifican por ID. Solo `subscription-charges` y `notice-dismissals` validan el Bearer contra Supabase. No se encontró una protección central de servidor.

**Impacto:** conocer un ID puede permitir leer, alterar o eliminar información sin iniciar sesión. `setup-user` también permite enviar otro usuario y correo. RLS está activo, pero la conexión de Prisma lo omite; el redirect del navegador no protege la API.

**Reproducción:** A01/A01b muestran lectura y borrado aceptados sin token con persistencia ficticia; la petición HTTP real confirmó acceso a la ruta de gastos sin sesión, usando un ID inexistente.

**Corrección:** helper de autenticación obligatorio en todas las rutas; obtener `user.id` del token validado; filtrar cada escritura por ID y propietario; comprobar que tarjeta, categoría, persona y cuentas vinculadas pertenecen al mismo usuario. Reutilizar el patrón de las dos rutas protegidas. Mantener la denegación pública de RLS. Si está publicada, restringir temporalmente su acceso hasta corregir.

**Aceptación:** solicitudes anónimas → 401; usuario A nunca lee, modifica, elimina o vincula registros de B; el `userId` enviado no cambia la identidad autorizada. Esta protección por endpoint coincide con la [guía oficial de Next.js](https://nextjs.org/docs/app/guides/authentication); véase también [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

<a id="A01-seguimiento"></a>

<a id="A01-seguimiento-titulo"></a>

#### Implementación completada

- **Sesión obligatoria en las 14 rutas:** [`apiAuth.js`](../../src/lib/apiAuth.js) valida el Bearer mediante `supabase.auth.getUser(token)` antes de leer el cuerpo o consultar Prisma. El usuario procede del token validado; se ignora el `userId` del cliente. `setup-user` también obtiene el correo de la identidad validada.
- **Autorización por propietario:** consultas filtradas por usuario; ediciones y borrados por ID más propietario, incluidas actualizaciones indirectas de cuentas. Se comprueba la pertenencia de tarjetas, categorías, personas, tipos de ingreso, suscripciones y cuentas vinculadas antes de escribir. Se rechazan objetos usados como filtros de Prisma en lugar de IDs.
- **Cliente y sincronización:** [`apiFetch.js`](../../src/lib/apiFetch.js) adjunta el token vigente a todas las llamadas y verifica la cuenta esperada. La cola offline conserva los pendientes cuando falta la sesión o cambia su propietario.
- **Respuestas privadas:** `Cache-Control: private, no-store` y `Vary: Authorization`. El service worker v4 excluye todas las rutas `/api/`, incluso como navegación, y elimina la caché anterior al activarse. El respaldo local de Gastos sigue separado por usuario.
- **Documentación:** [README actualizado](../../README.md) con el contrato de autenticación, las reglas de autorización y las pruebas. No se modificaron tablas, migraciones ni políticas RLS.

#### Verificación de la corrección

| Comprobación | Resultado posterior a la corrección |
| --- | --- |
| HTTP sobre servidor compilado local | Los 42 métodos exportados de las 14 rutas devolvieron **401 sin sesión**, con respuestas privadas y sin almacenamiento en caché. |
| Autorización y aislamiento | [32 pruebas nuevas](../../tests/api-authorization.test.cjs) correctas con Auth y persistencia simulados: ausencia de token, tokens inválidos, suplantación de `userId`, aislamiento entre dos usuarios, operaciones propias permitidas, rechazo de vínculos ajenos y protección de `setup-user`. |
| Cliente, cola y service worker | [4 pruebas nuevas](../../tests/api-fetch.test.cjs) correctas: uso del token renovado, bloqueo por ausencia o cambio de sesión, conservación de pendientes y exclusión de API de la caché. |
| Regresiones existentes | `node --test tests/*.test.cjs` terminó correctamente. La integración con PostgreSQL quedó omitida por falta de `AFP_TEST_DATABASE_URL`. |
| Build y lint | Compilación exitosa con acceso a Google Fonts. Lint sin errores; conserva la advertencia previa de compatibilidad de `useReactTable` en `data-table.jsx:61`. `git diff --check` sin incidencias. |

**Pendiente para cierre en producción:** desplegar con autorización explícita y comprobar el flujo autenticado con dos cuentas reales y PostgreSQL en un ambiente aislado. Las pruebas de aislamiento actuales usan adaptadores simulados; la comprobación HTTP real cubrió solicitudes anónimas. No se desplegó ni se modificó la base de datos.

Este seguimiento corresponde a A01. Los ajustes de autenticación de la cola y de caché no resolvían A02 ni A12. A02 se implementó posteriormente como se documenta abajo; A12 sigue pendiente.

---

<a id="A02"></a>

### A02 · P1 · La cola offline puede duplicar o perder gastos

**Ubicación:** `src/lib/offlineExpenses.js:46–79`; captura online/offline en `GastosContent.jsx:558`; POST de gastos.

**Reproducción:** una sola entrada genera dos POST cuando dos sincronizadores leen la misma cola. El `clientId` local no se envía al servidor. Otra reproducción añade una captura durante el envío: al terminar, `writeOfflineExpenses(userId, failedExpenses)` sobrescribe la cola y elimina esa captura todavía no enviada. Una respuesta perdida tras guardar también puede causar otro registro al reintentar.

**Corrección:** UUID estable de operación, enviado desde la primera captura; restricción única por usuario/operación en BD; respuesta idempotente. Cola transaccional en IndexedDB, eliminación por ID confirmado y coordinación entre pestañas. No reemplazar toda la cola con una instantánea vieja.

**Aceptación:** probar respuesta perdida, dos pestañas, nueva captura durante sync y cierre de pestaña: cada gasto persiste una vez y ningún pendiente desaparece.

<a id="A02-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **Captura durable:** online y offline pasan primero por IndexedDB, con un UUID por operación. El formulario se limpia después del commit local; los fallos de almacenamiento conservan sus datos y no generan POST.
- **Cola y pestañas:** eliminación por ID confirmado, actualización individual de errores, Web Locks por usuario y avisos BroadcastChannel. Sin Web Locks, la protección definitiva sigue en el servidor. Una nueva captura durante un envío nunca se reemplaza por una instantánea antigua.
- **Servidor idempotente:** [`expenseOperations.js`](../../src/lib/expenseOperations.js) utiliza una clave única usuario/UUID y una huella del contenido. Repetir la operación devuelve el recibo original; cambiar los datos devuelve 409. Gasto, cuenta vinculada, decisión de suscripción, estado de cuenta por pagar y recibo se confirman juntos o se revierten juntos. El recibo sobrevive a la edición/eliminación del gasto.
- **Compatibilidad:** importación transaccional de pendientes de localStorage con marcadores por entrada y copia original conservada. Los clientes antiguos sin UUID no adquieren idempotencia; hay que cerrar/recargar sus pestañas al actualizar. Una respuesta perdida antes de esta versión no puede deduplicarse retroactivamente sin evidencia.
- **Migración aditiva preparada:** [`20261017000000_add_expense_operations`](../../prisma/migrations/20261017000000_add_expense_operations/migration.sql), con RLS activo y sin políticas públicas. No se aplicó a Supabase ni se desplegó producción. [README actualizado](../../README.md#pwa--modo-offline).

| Verificación | Resultado |
| --- | --- |
| Regresiones de cola y POST | 13 casos nuevos correctos: UUID estable, concurrencia, captura durante sync, reapertura, migración única, respuesta perdida/truncada, almacenamiento fallido, conflicto de contenido, aislamiento y rollback. Persistencia del servidor simulada. |
| Chromium, IndexedDB y Web Locks reales | Respuesta perdida: 2 peticiones, 1 operación. Dos pestañas: la segunda espera; cerrar la primera durante el POST libera el bloqueo y recupera el gasto. La captura concurrente permanece. Cerrar antes del POST permite recuperar el pendiente al reabrir. API simulada; [evidencia](a02-verificacion.json) y [fixture reproducible](../../tests/helpers/offline-browser-server.cjs). |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **154 casos, 152 correctos, 2 omitidos**, cero fallos. |
| PostgreSQL real | Suite de idempotencia/concurrencia/rollback preparada; omitida junto con la de suscripciones por falta de `AFP_TEST_DATABASE_URL`. Requiere base local `afp_test…` y migraciones aplicadas. |
| Build / lint | Build correcto con Google Fonts accesible. Lint: cero errores, una advertencia previa de `useReactTable`. |

**Pendiente de operación:** aplicar la migración aditiva y desplegar con autorización explícita, y ejecutar las suites integradas en PostgreSQL aislado. La implementación está concluida; la verificación actual no equivale a una validación del formulario autenticado contra una BD real ni a un despliegue. A05, el resto de A06 y A12 conservan su alcance pendiente.


---

<a id="A03"></a>

### A03 · P1 · Los cortes se dan por pagados sin comprobar el importe

**Ubicación:** `src/app/api/card-cycles/route.js:104,420,452` y `src/app/api/dashboard/route.js:177`.

Un abono de $1 para un estado de cuenta de $1,000 es aceptado y marca `PAID`. La presentación considera pagado cualquier corte con `paidAt` o `paidAmount`, lo que puede retirar avisos de pago sin liquidar el importe. El formulario de marcar pagado permite capturar libremente ese importe.

También hay un problema con cero: `statementAmount: 0` numérico se rechaza, aunque `"0"` se acepta; y el cierre con pago cero se rechaza. Un corte sin importe exigible puede terminar como vencido. El README ya reconoce cero como un estado de cuenta válido.

**Corrección:** diferenciar pendiente, pago parcial, liquidado y sin importe por pagar. Exigir coherencia con el estado de cuenta o advertir y documentar una excepción explícita. Como evolución, registrar abonos individuales por ciclo. Conservar que el resumen mensual actual representa el total del período, conforme al README.

**Aceptación:** $1 de $1,000 conserva $999 pendientes y sus avisos; cero se puede cerrar sin inventar un gasto o pago; editar el estado de cuenta recalcula la situación.

---

<a id="A04"></a>

### A04 · P2 · Los vencimientos cambian a las 06:00 del día límite

**Ubicación:** `src/app/api/card-cycles/route.js:104,123` y `dashboard/route.js:177`. Se guarda el día a mediodía UTC y se compara como un instante.

**Reproducción:** a `2026-10-15T12:01Z` (06:01 en Ciudad de México), un vencimiento del 15 de octubre aparece como `OVERDUE`. Puede convivir con el texto «Es hoy» de la presentación, que compara días correctamente.

**Corrección:** una sola función de calendario para estados, avisos y presentación, con zona horaria explícita. Marcar vencido al pasar el día local, salvo que exista una hora bancaria documentada. Probar medianoche, día de corte, día límite y cambio de año.

---

<a id="A05"></a>

### A05 · P1 · Estado de deuda desactualizado al editar

**Ubicación:** `src/app/api/expenses/route.js:443–475`; `payables/route.js:187`; `receivables/route.js:240`.

Al crear o borrar un abono se recalcula la cuenta por pagar, pero al editarlo no. Cambiar de $100 a $50 el abono que había liquidado una deuda puede dejarla marcada como liquidada. Cambiar el principal de $100 a $200 conserva `PAID_OFF` con $100 pendientes. Los listados filtran activas/liquidadas por ese estado, así que la deuda puede quedar en el grupo equivocado.

**Corrección:** centralizar el cálculo de saldo y estado; ejecutarlo en la misma transacción al crear, editar o borrar abonos y al modificar el principal, tanto en cobrar como en pagar. Respetar cancelaciones y definir el tratamiento de saldos a favor. Probar también centavos y abonos concurrentes.

---

<a id="A06"></a>

### A06 · P1 · Operaciones relacionadas sin transacción

**Ubicación:** `src/app/api/expenses/route.js:296`, `installment-purchases/route.js:222`, y creación/actualización de ingresos vinculados.

La cuenta por cobrar se crea antes del gasto o de la compra MSI. Si falla la segunda escritura, queda una cuenta huérfana; reintentar puede crear otra. La reproducción fuerza el fallo del gasto y conserva una cuenta creada. Otros flujos guardan el movimiento y después actualizan el estado, pudiendo devolver 500 cuando ya se persistió una parte.

**Corrección:** transacciones que abarquen el movimiento, sus relaciones y el saldo; validar relaciones antes de escribir y combinar con idempotencia. El servicio reciente de cobros de suscripciones ya ofrece un patrón aprovechable. Aceptación: fallo de cualquier paso revierte todos los cambios.

---

<a id="A07"></a>

### A07 · P2 · Ingresos desaparecen del historial al superar 100

**Ubicación:** `src/app/api/incomes/route.js:93–104`. `take: 100` limita la consulta y el total se calcula sobre esas filas, sin cursor ni total global.

**Reproducción:** 101 ingresos de $10 devuelven 100 registros y $1,000; el total real es $1,010. La paginación del cliente no puede recuperar la fila faltante. Los registros siguen en la BD.

**Corrección:** filtros y paginación de servidor, `totalCount` y suma del conjunto filtrado independientes de la página. Aceptación: acceder al registro 101 y conservar totales correctos al cambiar de página.

---

<a id="A08"></a>

### A08 · P2 · Validación dispersa acepta fechas imposibles

**Ubicación:** `src/app/api/expenses/route.js:106,270`, funciones equivalentes de ingresos y cuentas; `src/lib/validations.js` está vacío.

**Reproducción:** `2026-02-30` se guarda como `2026-03-02`. El constructor de Date normaliza el valor y supera la comprobación de NaN. La API general también acepta más de dos decimales, mientras el servicio de suscripciones los rechaza.

**Corrección:** esquemas Zod compartidos, validar y comparar el día normalizado, límites de importes, dos decimales y cadenas vacías tras trim. Aplicar validación en servidor. Reutilizar la validación estricta de calendario de cobros. No convertir el proyecto a TypeScript.

---

<a id="A09"></a>

### A09 · P2 · Un filtro puede mostrar resultados de otro

**Ubicación:** `src/components/gastos/GastosContent.jsx:331`. El debounce de 250 ms retrasa nuevas consultas, pero no cancela ni descarta respuestas anteriores.

**Reproducción:** se consulta A, luego B; responde B primero y A después. El filtro visible sigue en B pero se muestran filas A. Afecta principalmente al cambio de período y a filtros de escritorio; las etiquetas móviles que filtran localmente no necesitan petición.

**Corrección:** AbortController más identificador de generación; solo la petición vigente actualiza datos, errores y estado de carga. Aplicar el patrón ya usado en DashboardProvider y cobros.

---

<a id="A10"></a>

### A10 · P1 · Dependencias con avisos de seguridad pendientes

**Evidencia:** `package.json`, lockfile y [auditoría de dependencias](dependencias.json). Next.js instalado: 16.2.6; el registro devuelve 17 avisos únicos para Next. El árbol total contiene 91 avisos únicos, incluidos cuatro críticos.

**Aplicabilidad:** no se encontraron imports de `next/og`, `ImageResponse` ni `next/image`. El aviso de [ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) requiere contenido SVG controlable por un atacante; el de [AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) requiere optimizar imágenes afectadas. Otro crítico aplica a Windows, distinto de este entorno Linux. El cuarto crítico, `proxy-addr`, llega mediante `shadcn → MCP SDK → express`, herramienta declarada como dependencia de producción. No se ha demostrado ejecución remota en AFP.

**Corrección:** actualización controlada de Next y eslint-config-next a una versión estable que cubra todos los rangos reportados (el registro consultado señala parches hasta 16.3.8), revisión de sharp y transitivas, y mover la CLI shadcn a desarrollo. Verificar en una rama con build, regresiones y navegador. No aplicar actualizaciones forzadas sin revisar compatibilidad.

---

<a id="A11"></a>

### A11 · P1 · La BD no se reproduce completamente desde Git

**Evidencia:** la base conectada registra `20260518234708_add_payable_loan_support` como aplicada, pero falta en `prisma/migrations`. Hay 13 migraciones aplicadas y 12 archivos SQL locales. Todas las migraciones locales aparecen aplicadas; no hay una migración local pendiente.

Además, RLS está activo en las 16 tablas reales, mientras solo las migraciones de las dos tablas más recientes activan RLS en el repositorio. La configuración anterior parece haberse aplicado fuera de las migraciones versionadas. No se afirma divergencia de columnas sin un diff de esquema completo.

**Impacto:** un entorno nuevo o una recuperación puede diferir de la base actual, incluida la seguridad. **Corrección:** recuperar la migración original del historial/respaldos y verificar su checksum; revisar el esquema en una base desechable; versionar la configuración de seguridad mediante una migración nueva revisada. Evitar reset, db push o reescribir el historial aplicado.

---

<a id="A12"></a>

### A12 · P2 · Falta una política explícita de datos locales al cerrar sesión

**Ubicación:** `public/sw.js`, `src/lib/offlineExpenses.js`, caché bootstrap de Gastos y `AppSidebar.jsx:27`.

Las respuestas de gastos y bootstrap se guardan en CacheStorage y localStorage; salir no limpia esas copias. Las claves incluyen el usuario, por lo que no se ha demostrado una fuga automática entre cuentas. Sí quedan datos financieros en un equipo compartido, y una futura autenticación que elimine userId de las URLs necesitará revisar las claves del service worker.

**Corrección:** política de dispositivo confiable, caché aislada por usuario y limpieza de datos sincronizados al salir. Advertir y permitir exportar/sincronizar pendientes antes de borrarlos; conservar recuperabilidad. El cifrado con una clave almacenada junto a los datos no resolvería por sí solo este problema.

---

<a id="A13"></a>

### A13 · P2 · Consultas y cálculos crecen con todo el historial

**Ubicación:** `src/app/api/dashboard/route.js:790`, `expenses/route.js:185`, `card-cycles/route.js:173` y `DashboardProvider.jsx`.

Dashboard carga todos los gastos/ciclos/MSI/suscripciones y reconstruye comparativos. Gastos vuelve a leer todas las fechas del usuario para calcular los meses disponibles en cada consulta. En móvil, DashboardProvider también consulta el dashboard desde otras secciones para la cabecera. Esto es crecimiento comprobable en código; no se midió lentitud actual en producción.

**Corrección:** separar resumen de cabecera de análisis completo, acotar ventanas temporales sin perder referencias históricas, paginar y agregar en SQL. Medir cantidad de consultas, bytes, p95 y memoria con volúmenes sintéticos. Conservar el bootstrap agrupado y el desglose bajo demanda que ya existen.

---

<a id="A14"></a>

### A14 · P2 · El login móvil tiene controles táctiles pequeños

**Evidencia de navegador:** a 390 px, ambos inputs y Entrar miden 28 px de alto; Crear cuenta mide 22 px. [Captura](login-mobile.png). Ubicación: `src/app/login/page.js` y componentes base Input/Button.

**Impacto:** tocar y completar el acceso resulta menos cómodo que los controles móviles de 44–48 px ya usados en otras partes. **Corrección:** áreas táctiles de al menos 44 px y campos más legibles en el login; verificar teclado, autocompletado y zoom. Los 44 px son aquí un objetivo ergonómico; no se declara una infracción WCAG AA solo por medir menos de 44 px.

---

<a id="mejoras"></a>

## Arquitectura, calidad e interfaz

**Conservar:** cálculos compartidos entre Tarjetas y Dashboard; referencias bancarias por período; montos a centavos en desgloses; manejo explícito de estimaciones; servicio transaccional de cobros; componentes shadcn, adaptación móvil, borradores y estados de carga. Las 103 regresiones que pasan son una base útil.

- **Extraer servicios por operación:** Gastos tiene 1,829 líneas y la ruta Dashboard 1,193. Separar contratos, consultas y reglas de negocio para reutilizar las mismas reglas en todas las entradas.
- **Una política monetaria:** Decimal en persistencia; centavos enteros o aritmética decimal en operaciones; formato al presentar. Evitar que sumas de Number determinen si una cuenta está liquidada. `money.js` está vacío.
- **Pruebas de límites del sistema:** usuario A/B, FK cruzadas, rollback, idempotencia, concurrencia y calendarios. Los tests existentes se concentran en cálculos y presentación; muchos cargan código mediante VM quitando imports y no verifican el cableado real.
- **CI reproducible:** script test y pipeline con instalación por lockfile, lint, pruebas, build y una BD local de integración. No se encontró configuración CI versionada. El repositorio usa pnpm-lock.yaml, pero el README enseña npm install: elegir y documentar un flujo único.
- **Observabilidad:** requestId, errores estructurados sin datos financieros, métricas de fallos/latencia, errores de sincronización visibles. Error boundaries y reintento en cada módulo.
- **Documentación fiel:** el README menciona React Hook Form + Zod, pero no hay usos encontrados en src y validations.js está vacío; src/actions contiene archivos vacíos. Documentar el estado real o completar gradualmente esas capas.
- **Acceso y recuperación:** añadir recuperar contraseña y cambiar contraseña mediante Supabase. Revisar el registro abierto si el producto seguirá siendo exclusivamente personal.

### Evaluación de interfaz provisional — skill impeccable

La interfaz observada usa controles familiares y una jerarquía sobria. No hay evidencia para justificar un rediseño completo ni para atribuirle una estética artificial. La puntuación siguiente cubre código e inspección del login; no es una calificación de seguridad ni una certificación de toda la app.

| Dimensión | /4 | Observación |
| --- | --- | --- |
| Accesibilidad | 3 | Etiquetas asociadas, mensajes ARIA y primitivas accesibles; recorrido autenticado con teclado pendiente. |
| Rendimiento | 2 | Bootstrap y gráficas diferidas; consultas de historial completo y carreras de filtros. |
| Responsive | 2 | Adaptaciones móviles extensas; login con objetivos táctiles pequeños comprobados. |
| Tokens y tema | 3 | Sistema compartido y modo oscuro intencional; contraste completo pendiente. |
| Consistencia visual | 3 | Componentes convencionales; falta inspección visual de módulos privados. |
| **Total provisional** | **13/20** | Mejora focalizada; conservar el sistema existente. |

Para una pasada de interfaz: `$impeccable harden` para errores y peticiones, `$impeccable adapt` para login táctil, `$impeccable optimize` para consultas, y `$impeccable polish` al integrar. Se pueden abordar por separado y repetir la auditoría después. Opcionalmente, `$impeccable init` puede capturar contexto de producto/diseño que hoy no existe en PRODUCT.md.

<a id="features"></a>

## Nuevas funciones propuestas

Ordenadas por utilidad para esta app personal. Esfuerzo relativo: S = acotado; M = varios flujos; L = modelo y flujos nuevos. No son estimaciones de calendario.

| Función | Primera implementación útil | Esfuerzo | Criterio de éxito |
| --- | --- | --- | --- |
| **Conciliación dentro de la app** | Importar CSV/JSON revisado, previsualizar, detectar duplicados, resolver diferencias y conservar evidencia/origen. Reutilizar statementReconciliations, usageReconciliation y CardCycleCredit. PDF automático en una etapa posterior. | L | Reimportar el mismo archivo crea cero duplicados y cada diferencia puede explicarse. |
| **Calendario financiero y reserva por quincena** | Reunir fechas de pago, suscripciones, cobros y deudas; mostrar confirmado/estimado y cuánto reservar para Q15/Q30. Después, proyección a 30/60/90 días. | M; L con saldos | Los totales se pueden abrir hasta cada movimiento y no duplican compra a crédito y liquidación como consumo. |
| **Abonos y cierre de tarjetas** | Modelo CardCyclePayment con fecha, importe y referencia; saldo pendiente, parciales y cierre sin importe exigible. Forma parte de resolver A03. | M | Varios abonos cuadran con el corte, con historial y deshacer trazable. |
| **Presupuestos por categoría** | Límite mensual/quincenal, gasto real, compromisos previstos y disponible del presupuesto. Alertas al 80/100 % configurables. | M | El consumo coincide con Análisis y explica cómo trata MSI y suscripciones. |
| **Historial de cambios, papelera y exportación** | AuditEvent con operación y cambios, eliminación recuperable y exportación CSV/JSON. Prueba de restauración en entorno local. | M | Recuperar una eliminación mantiene relaciones; ninguna exportación omite registros por paginación. |
| **Alertas de calendario** | Exportación ICS de vencimientos como primera entrega; después notificaciones push opcionales y por dispositivo. | S → M | Un aviso por evento, zona horaria correcta y acciones para marcar/resolver. |
| **Tarifas y pausas de suscripciones** | Historial de tarifa con fecha efectiva y períodos de pausa, conservando evidencia bancaria. Detección de aumentos y cobros inesperados. | M | Editar la tarifa futura no cambia la lectura de meses históricos. |

Para llamar a una cifra «dinero disponible» se necesitan saldos iniciales, cuentas de efectivo/banco y transferencias, hoy no modelados. Primero puede mostrarse una reserva de compromisos, claramente identificada; añadir cuentas y transferencias sería una fase posterior. Evitar presentar ingreso menos gasto como saldo real sin esos datos.

<a id="orden"></a>

## Orden recomendado

1. **Seguridad:** completar el despliegue autorizado y la validación integrada de A01, cuya implementación local ya está terminada; continuar con la actualización controlada A10 y pruebas de aislamiento. Alinear migraciones y RLS versionado (A11) para poder crear un entorno confiable de pruebas.
2. **Integridad de registros:** A02 implementado localmente; completar su migración/despliegue autorizado y validación PostgreSQL. Continuar con A05 y el resto de A06: transacciones y regresiones de concurrencia.
3. **Exactitud visible:** A03/A04, historial completo A07, validaciones A08 y filtros A09.
4. **Operación diaria:** política offline A12, consultas A13, login A14, recuperación de acceso y CI.
5. **Producto:** conciliación revisable, calendario/reservas y presupuestos; después proyección con saldos reales.

La implementación local de la API protegida y las pruebas entre dos usuarios simulados están completadas en A01; falta validar el flujo integrado y desplegar con autorización. Después, garantizar que ningún reintento o edición pierda, duplique o cierre incorrectamente una obligación.
