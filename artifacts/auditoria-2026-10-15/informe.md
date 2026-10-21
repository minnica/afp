AFP · Auditoría original: 15 de octubre de 2026 · Revisión de estado: 21 de octubre de 2026

# Estado de la auditoría y trabajo pendiente

**La auditoría aún no está cerrada: hay 6 correcciones cubiertas, 1 parcial y 7 pendientes de corrección.** Siete hallazgos ya recibieron implementación (A01, A02, A03, A05, A06, A10 y A11), pero A10 conserva seguimiento abierto de dependencias. Algunas aceptaciones integradas también siguen pendientes y se indican por separado. Las publicaciones posteriores al 17 de octubre ya incluyen las correcciones financieras; no corresponde seguir presentándolas como trabajo exclusivamente local.

Se mantienen los **14 hallazgos originales: 1 P0, 6 P1 y 7 P2**. Estas prioridades describen el riesgo original, no catorce problemas que sigan presentes. La captura Android tiene su propio plan de siete fases y se resume aparte para no confundirlo con los hallazgos A01–A14 ni con las cinco etapas recomendadas al final.

**Cómo leer los estados:** **CUBIERTA** significa que la corrección del hallazgo está implementada, tiene pruebas específicas y consta su publicación/aplicación; no certifica todos los recorridos de la app. **PARCIAL** significa que hay trabajo realizado y algún requisito del propio alcance sigue abierto. **PENDIENTE** significa que la corrección general aún falta, aunque otros módulos tengan soluciones similares. «Publicado» se basa en las evidencias guardadas, no en una nueva inspección remota realizada en esta revisión.

**Contenido**

- [Estado de los 14 hallazgos](#estado-actual)
- [Qué se comprobó en esta revisión](#revision-2026-10-21)
- [Estado de las fases Android](#fases-android)
- [Hallazgos y evidencia histórica](#hallazgos)
- [Mejoras técnicas](#mejoras) · [Funciones propuestas](#features)
- [Estado de las cinco etapas y próximos pasos](#orden)

<a id="estado-actual"></a>

## Estado de los 14 hallazgos · 21 de octubre de 2026

| ID | Prioridad original | Estado de la corrección | Ya cubierto | Qué falta |
| --- | --- | --- | --- | --- |
| [A01](#A01) | P0 | **CUBIERTA** | Bearer validado, propietario y referencias comprobados, cliente autenticado y API fuera de caché. Publicada. | Aceptación adicional con dos cuentas Supabase reales en un ambiente aislado; los tests de aislamiento simulan Auth. |
| [A02](#A02) | P1 | **CUBIERTA** | IndexedDB, UUID, recibo idempotente y transacción; pruebas de pestañas/respuesta perdida y PostgreSQL. Migración aplicada y código publicado. | Recorrido autenticado completo de captura/reconexión como aceptación operativa; la limpieza al salir pertenece a A12. |
| [A03](#A03) | P1 | **CUBIERTA** | Saldo pendiente real, pagos parciales y cero; cálculo común, bloqueo transaccional y publicación. Las devoluciones posteriores añaden pruebas PostgreSQL del mismo flujo. | Aceptación autenticada del formulario; un historial de abonos individuales sigue siendo una función futura. El calendario pendiente pertenece a A04. |
| [A04](#A04) | P2 | **PENDIENTE** | Hay presentación relativa por día. | El estado todavía compara instantes; unificar calendario y zona horaria para no vencer durante el día límite. |
| [A05](#A05) | P1 | **CUBIERTA** | Principal/abonos recalculan deuda y estado dentro de una transacción, con Decimal y pruebas concurrentes en PostgreSQL. Publicada. | Aceptación autenticada de altas/ediciones/traslados; no hay una corrección de código identificada pendiente en este hallazgo. |
| [A06](#A06) | P1 | **CUBIERTA** | Gasto, MSI, ingreso y relaciones se guardan atómicamente; rollback real comprobado. Publicada. | Aceptación autenticada entre módulos. Idempotencia de MSI/Ingresos tras perder una respuesta confirmada sigue fuera de esta corrección de atomicidad. |
| [A07](#A07) | P2 | **PENDIENTE** | El cliente pagina los registros recibidos. | La API sigue usando `take: 100`; faltan página/cursor, conteo y total del conjunto completo. |
| [A08](#A08) | P2 | **PENDIENTE** | Captura Android, conciliación, suscripciones y algunos importes ya tienen validación estricta. | Extenderla a gastos manuales, ingresos y cuentas; fechas imposibles y precisión monetaria no están resueltas en general. |
| [A09](#A09) | P2 | **PENDIENTE** | Existe debounce y otros flujos ya descartan respuestas antiguas. | `loadExpenses` aún puede aplicar una respuesta de filtros anteriores; faltan cancelación y control de generación en esa lectura. |
| [A10](#A10) | P1 | **PARCIAL** | Dependencias actualizadas y publicadas; auditoría repetida el 21/10 con cero avisos de producción. | Resolver o revisar el aviso alto de desarrollo `braces` y documentar la comprobación explícita del build predeterminado. |
| [A11](#A11) | P1 | **CUBIERTA** | Historial SQL recuperado con checksum idéntico, RLS versionado y reconstrucción probada. Última evidencia: 21 migraciones y 27 tablas con RLS. | Mantener la verificación al añadir migraciones; Auth, secretos y datos financieros requieren respaldos separados. |
| [A12](#A12) | P2 | **PENDIENTE** | Datos aislados por usuario y API excluida del service worker. | Política de dispositivo confiable, limpieza al salir y recuperación/exportación de pendientes antes de borrarlos. |
| [A13](#A13) | P2 | **PENDIENTE** | Bootstrap, consultas compartidas y desgloses bajo demanda. | Acotar historial, paginar/agregar y medir; la cabecera móvil sigue dependiendo del dashboard completo. |
| [A14](#A14) | P2 | **PENDIENTE** | El login ya tiene recuperación de errores de conexión. | Campos/botón siguen con `h-7` y el cambio de modo con `h-auto p-0`; falta el ajuste táctil y su aceptación. |

**Aceptación transversal aún abierta:** sesión Supabase real → interfaz → API → PostgreSQL con dos usuarios aislados, incluyendo operaciones financieras. Los casos PostgreSQL y las pruebas de navegador con Auth simulada aportan evidencia distinta. La vinculación real del teléfono demuestra ese flujo concreto, no todos los módulos financieros.

<a id="revision-2026-10-21"></a>

## Qué se comprobó en esta revisión

Se leyeron el README completo, este informe, el plan Android y sus evidencias públicas; se contrastaron rutas, servicios, cálculos, componentes, tests, esquema y migraciones con el repositorio en **`83be8f0`**. No se cambió código funcional ni se hicieron escrituras o despliegues en producción; tampoco se consultaron registros financieros privados ni la base de producción. [Resultados de esta revisión](revision-2026-10-21.json).

| Comprobación | Resultado y límite |
| --- | --- |
| Regresiones ejecutadas ahora | `pnpm test`: **246 casos, 233 correctos, cero fallos y 13 omitidos** por no configurar `AFP_TEST_DATABASE_URL`. Las integraciones omitidas contienen subcasos; este conteo no es comparable directamente con los 337 casos de la ejecución completa anterior. |
| Lint ejecutado ahora | `pnpm lint`: **cero errores y una advertencia previa** de `react-hooks/incompatible-library` en `data-table.jsx:61`. |
| Dependencias consultadas ahora | `pnpm audit --prod --json`: **cero avisos**, salida 0. `pnpm audit --json`: **un aviso alto de desarrollo**, `braces@3.0.3` / `GHSA-vfj7-8cjw-p6xm`, sin versión corregida informada por el registro; salida 1. Se repitieron fuera del sandbox tras fallo DNS. [Producción](revision-2026-10-21-audit-prod.json) · [Árbol completo](revision-2026-10-21-audit-all.json). |
| Pruebas completas previas | La [aceptación de muestras](../android-muestras-2026-10-21/verification.json) registra **337 pruebas web correctas sin omisiones** con PostgreSQL local y Auth simulada; la [Fase 7](../android-fase7/verification.json) registra **18 JVM y 29 instrumentadas** correctas en el S24 Ultra. No se repitieron esas integraciones ni pruebas físicas en esta revisión. |
| Publicación comprobada por evidencia | [Despliegue de Fase 6](../android-fase6/production-deployment.json), `dpl_4vn4oDLnajjHffjUVAi7mKyKrCaC`, `READY`, 21/10: 230 archivos públicos, migraciones aplicadas, APK 0.5.0 / 7 y [comprobaciones HTTP](../android-fase6/production-http.json). Los endpoints consultados rechazan peticiones anónimas; no es un recorrido financiero autenticado completo. |
| Código local frente a esa publicación | Comparación del SHA-1 de cada archivo con el [manifiesto publicado](../android-fase6/source-manifest.json): **227 de 230 idénticos, tres modificados y ninguno ausente**. Coinciden autenticación, gastos/cola, pagos, deudas, transacciones, dependencias y migraciones. Difieren `CaptureConfigurationPanel.jsx`, `captureConfiguration.js` y `captureParsers.js`; `CaptureRolloutStatus.jsx` y `captureRollout.js` son archivos adicionales de Fase 7. Por ello las correcciones antiguas sí constan publicadas, pero la ampliación local de Fase 7/Nu no debe darse por publicada. |
| BD y build, evidencia anterior | [Fase 6](../android-fase6/verification.json): reconstrucción de 21 migraciones, conservación de datos y RLS; [última aceptación web](../android-muestras-2026-10-21/verification.json): build Webpack correcto. No se ejecutaron build, migraciones ni reconstrucción de BD en esta revisión documental. El resultado antiguo de Turbopack no se convierte en una prueba actual aprobada. |

Los conteos de 104, 154, 163, 175, 179 y 182 casos que aparecen después son **hitos históricos del 15–17 de octubre**. Las referencias a «sin despliegue» dentro de esas operaciones describen lo ocurrido entonces; el estado vigente se indica al principio de cada hallazgo y en la tabla anterior.

<a id="fases-android"></a>

## Estado de las fases de captura Android

**Tres fases cubiertas: 2, 3 y 5. Cuatro parciales y abiertas: 1, 4, 6 y 7.** El motor técnico y las pruebas sintéticas no cierran los criterios que requieren avisos bancarios reales. Referencia de actividades y criterios: [plan Android](../../PLAN_CAPTURA_AUTOMATICA_ANDROID.md#3-fases-de-implementación).

| Fase | Estado global | Ya cubierto | Qué impide cerrarla |
| --- | --- | --- | --- |
| **1 · APK y notificaciones** | **PARCIAL** | APK/TWA, dominio verificado, permisos, ocho fuentes, nueve tarjetas y batería Samsung. | Completar muestras reales revisadas y comprobar captura del piloto con pantalla bloqueada. Nu/CFE llegó con el teléfono desbloqueado y solo aporta datos parciales. [Evidencia](../android-fase1/multi-source-verification.json). |
| **2 · Vinculación y recepción** | **CUBIERTA** | Credencial propia, código de un uso, propietario inmutable, recepción idempotente, revocación y vinculación real en producción. | Sin actividad pendiente dentro de ese alcance. [Aceptación real](../android-fase2/phone-activation.json). |
| **3 · Cola y sincronización** | **CUBIERTA** | Room cifrado, UUID, WorkManager, reintentos, persistencia y reinicio físico comprobados; APK instalada. | La cola conserva avisos ya capturados; la captura bancaria con pantalla bloqueada sigue en Fase 1. [Evidencia](../android-fase3/verification.json). |
| **4 · Interpretación y registro** | **PARCIAL** | Motor transaccional, alias, reglas, deduplicación, revisión y conversión MSI; web y migraciones publicadas. | Validar analizadores de crédito con avisos reales anonimizados antes de activarlos. Nu/CFE es parcial y `verified: false`. [Evidencia técnica](../android-fase4/verification.json). |
| **5 · Revisión y conciliación** | **CUBIERTA** | Bandeja, corrección, reglas, pausa por fuente, cotejo por tarjeta/período y faltantes idempotentes; aceptación nativa completa. Migración y publicación completadas durante Fase 6. | Sin actividad técnica pendiente en ese alcance; importación general de CSV/JSON/PDF sigue siendo una ampliación de producto. [Aceptación](../android-fase5/verification.json) · [publicación posterior](../android-fase6/production-deployment.json). |
| **6 · Piloto BBVA crédito** | **PARCIAL** | Seguimiento, exclusión del aviso de débito, despliegue y APK 0.5.0 / 7; actualización conserva pendientes/configuración. | Avisos completos de crédito presencial/en línea/Wallet y comercios previstos, activación de formatos verificados y observación/conciliación de un corte completo. [Evidencia](../android-fase6/verification.json). |
| **7 · Otras tarjetas** | **PARCIAL** | Cobertura y requisitos de activación implementados localmente, regreso a observación y 24 alias; seis Wallet corregidos en la configuración real. | Publicar la ampliación local, obtener muestras propias, cotejar observación y habilitar por tarjeta/formato; comprobar canales reales. [Aceptación técnica](../android-fase7/verification.json) · [seguimiento real](../android-muestras-2026-10-21/verification.json). |

**Captura automática de crédito: ningún formato completo está activado.** Tener la APK instalada, alias verificados o un commit titulado «fase completa» no demuestra el cumplimiento de los criterios bancarios. El aviso Nu/CFE conserva `REVIEW / UNKNOWN_FORMAT`; el nuevo analizador local no reinterpreta recibos anteriores. El comprobante BBVA/Wallet confirma la compra y su alias, pero no se encontró una notificación asociada que valide un analizador. Ambos casos siguen necesitando resolución/cotejo explícitos si se desean registrar o vincular.

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

Cada apartado comienza con su estado al **21 de octubre**. El hallazgo original y las verificaciones fechadas se conservan para explicar el problema, la corrección y sus límites; las ubicaciones con números de línea antiguos son históricas.

<a id="A01"></a>

### A01 · P0 · API sin autenticación y autorización

**Estado al 21/10: CUBIERTA; corrección publicada.** Se conserva pendiente la aceptación con dos cuentas Supabase reales en un ambiente aislado. Autenticación y aislamiento están cubiertos por regresiones; la evidencia de publicación y sus límites se detallan en la revisión actual. El hallazgo siguiente es histórico.

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

**Pendiente vigente:** comprobar el flujo autenticado con dos cuentas Supabase reales y PostgreSQL en un ambiente aislado. La publicación se completó posteriormente y ya no es una tarea pendiente de A01. Las pruebas de aislamiento simulan Auth; la comprobación HTTP de producción guardada cubre solicitudes anónimas. La operación original del 17/10 no desplegó ni modificó la BD.

Este seguimiento corresponde a A01. Los ajustes de autenticación de la cola y de caché no resolvían A02 ni A12. A02 se implementó posteriormente como se documenta abajo; A12 sigue pendiente.

---

<a id="A02"></a>

### A02 · P1 · La cola offline puede duplicar o perder gastos

**Estado al 21/10: CUBIERTA; corrección publicada y migración aplicada.** PostgreSQL y navegador ya tienen evidencia específica de idempotencia, concurrencia y conservación de pendientes. Resta la aceptación operativa con sesión real; la política de salida pertenece a A12.

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
- **Migración aditiva aplicada a Supabase:** [`20261017000000_add_expense_operations`](../../prisma/migrations/20261017000000_add_expense_operations/migration.sql), con RLS activo y sin políticas públicas. Se aplicó con autorización el 17 de octubre de 2026 en el seguimiento de producción de A11; esta operación no desplegó la aplicación. [README actualizado](../../README.md#pwa--modo-offline).

| Verificación | Resultado |
| --- | --- |
| Regresiones de cola y POST | 13 casos nuevos correctos: UUID estable, concurrencia, captura durante sync, reapertura, migración única, respuesta perdida/truncada, almacenamiento fallido, conflicto de contenido, aislamiento y rollback. Persistencia del servidor simulada. |
| Chromium, IndexedDB y Web Locks reales | Respuesta perdida: 2 peticiones, 1 operación. Dos pestañas: la segunda espera; cerrar la primera durante el POST libera el bloqueo y recupera el gasto. La captura concurrente permanece. Cerrar antes del POST permite recuperar el pendiente al reabrir. API simulada; [evidencia](a02-verificacion.json) y [fixture reproducible](../../tests/helpers/offline-browser-server.cjs). |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **154 casos, 152 correctos, 2 omitidos**, cero fallos. |
| PostgreSQL real | Suite de idempotencia/concurrencia/rollback preparada; omitida junto con la de suscripciones por falta de `AFP_TEST_DATABASE_URL`. Requiere base local `afp_test…` y migraciones aplicadas. |
| Build / lint | Build correcto con Google Fonts accesible. Lint: cero errores, una advertencia previa de `useReactTable`. |

**Pendiente vigente:** aceptación del formulario autenticado, desconexión y reconexión. La integración A02 con PostgreSQL pasó posteriormente en A06 y la corrección ya consta en la publicación del 21/10; la migración se aplicó en A11. A12 conserva su alcance pendiente.


---

<a id="A03"></a>

### A03 · P1 · Los cortes se dan por pagados sin comprobar el importe

**Estado al 21/10: CUBIERTA; corrección publicada.** El flujo compartido de pagos/devoluciones añadió después pruebas reales de PostgreSQL, concurrencia y rollback, documentadas en el [README](../../README.md#tarjetas--devoluciones-posteriores-al-corte) y su [verificación](../devoluciones-2026-10-17/verificacion.json). Sigue pendiente la aceptación autenticada del formulario. La descripción siguiente conserva el hallazgo original.

**Ubicación:** `src/app/api/card-cycles/route.js:104,420,452` y `src/app/api/dashboard/route.js:177`.

Un abono de $1 para un estado de cuenta de $1,000 es aceptado y marca `PAID`. La presentación considera pagado cualquier corte con `paidAt` o `paidAmount`, lo que puede retirar avisos de pago sin liquidar el importe. El formulario de marcar pagado permite capturar libremente ese importe.

También hay un problema con cero: `statementAmount: 0` numérico se rechaza, aunque `"0"` se acepta; y el cierre con pago cero se rechaza. Un corte sin importe exigible puede terminar como vencido. El README ya reconoce cero como un estado de cuenta válido.

**Corrección:** diferenciar pendiente, pago parcial, liquidado y sin importe por pagar. Exigir coherencia con el estado de cuenta o advertir y documentar una excepción explícita. Como evolución, registrar abonos individuales por ciclo. Conservar que el resumen mensual actual representa el total del período, conforme al README.

**Aceptación:** $1 de $1,000 conserva $999 pendientes y sus avisos; cero se puede cerrar sin inventar un gasto o pago; editar el estado de cuenta recalcula la situación.


<a id="A03-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **Saldo y estado compartidos:** [`cardCyclePayments.js`](../../src/lib/calculations/cardCyclePayments.js) compara estado de cuenta y total pagado a centavos. Diferencia pendiente, parcial, liquidado, sin importe por pagar y sin estado confirmado. Las lecturas corrigen la presentación de `PAID` históricos incoherentes sin alterar los registros.
- **Avisos y Dashboard:** $1 de $1,000 conserva $999 pendientes y el aviso. Se ignora el `PAID` persistido como criterio de exclusión; cero confirmado no genera vencimiento. Los resúmenes mensuales/Q15/Q30 mantienen el total del período y las filas muestran el saldo parcial aparte.
- **Ediciones coherentes:** guardar estado, pago, fechas o deshacer recalcula la situación dentro de una transacción con bloqueo de la fila por propietario. Un importe mayor reabre un corte antes liquidado. Cero numérico/texto se acepta sin inventar un pago; no hay excepciones que permitan liquidar por debajo del estado.
- **Formulario:** captura el total acumulado y la fecha del último pago, conserva datos al reabrir, muestra saldo/excedente y exige estado de cuenta previo. Los errores mantienen abierta la captura; el guardado bloquea envíos duplicados. El total sustituye el anterior; no crea un historial de abonos.
- **Sin migración:** conserva el enum y los campos existentes. El historial individual `CardCyclePayment` queda como evolución separada; A04 conserva su alcance de calendario. [Contrato y operación en README](../../README.md#tarjetas--saldo-y-liquidación-de-cortes-a03).

| Verificación | Resultado |
| --- | --- |
| Nuevas regresiones | 9 casos en [`card-cycle-payments.test.cjs`](../../tests/card-cycle-payments.test.cjs): parcial, centavos, exceso, cero, edición, deshacer, reintento, validación, rollback simulado y lecturas de ambas API con avisos. |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **163 casos, 161 correctos, 2 omitidos**, cero fallos. |
| Navegador | Chromium a 390×844 y 1440×900, formulario real con [fixture de datos/guardado simulados](a03-ui-fixture.jsx): parcial de $1, reapertura con total conservado, error visible sin cerrar, cero sin fecha de pago y bloqueo sin estado. Sin errores de navegador. [Móvil](a03-pago-parcial-mobile.png) · [Escritorio](a03-cero-desktop.png). |
| Build / lint | Build de producción correcto con Google Fonts accesible. Lint sin errores; conserva la advertencia previa de `useReactTable`. |
| Persistencia | Autenticación y Prisma simulados; transacción y bloqueo por propietario comprobados en el contrato. Las suites PostgreSQL existentes se omiten sin `AFP_TEST_DATABASE_URL`. No se comprobó concurrencia contra una BD real. |

**Pendiente vigente:** aceptación del formulario con sesión real. El despliegue y la integración PostgreSQL del flujo de pagos/devoluciones se completaron posteriormente; no deben repetirse como tareas de implementación pendientes. El cierre original de A03 no modificó Supabase ni publicó la app. A04 y el futuro historial de abonos siguen siendo alcances separados.

---

<a id="A04"></a>

### A04 · P2 · Los vencimientos cambian a las 06:00 del día límite

**Estado al 21/10: PENDIENTE.** La lógica se centralizó, pero el defecto persiste: [`getCyclePaymentState`](../../src/lib/calculations/cardCyclePayments.js) compara `today > new Date(cycle.dueDate)`. Los formatos relativos por día y el `clientDate` del Dashboard no sustituyen una política de calendario compartida entre rutas.

**Ubicación actual:** `src/lib/calculations/cardCyclePayments.js`, consumido por las rutas de ciclos y Dashboard. Se guarda el día a mediodía UTC y se compara como un instante.

**Reproducción:** a `2026-10-15T12:01Z` (06:01 en Ciudad de México), un vencimiento del 15 de octubre aparece como `OVERDUE`. Puede convivir con el texto «Es hoy» de la presentación, que compara días correctamente.

**Corrección:** una sola función de calendario para estados, avisos y presentación, con zona horaria explícita. Marcar vencido al pasar el día local, salvo que exista una hora bancaria documentada. Probar medianoche, día de corte, día límite y cambio de año.

---

<a id="A05"></a>

### A05 · P1 · Estado de deuda desactualizado al editar

**Estado al 21/10: CUBIERTA; corrección publicada.** Hay pruebas con PostgreSQL real desechable de concurrencia y rollback. Resta aceptación autenticada de los flujos de cuentas. La descripción siguiente conserva el hallazgo original.

**Ubicación:** `src/app/api/expenses/route.js:443–475`; `payables/route.js:187`; `receivables/route.js:240`.

Al crear o borrar un abono se recalcula la cuenta por pagar, pero al editarlo no. Cambiar de $100 a $50 el abono que había liquidado una deuda puede dejarla marcada como liquidada. Cambiar el principal de $100 a $200 conserva `PAID_OFF` con $100 pendientes. Los listados filtran activas/liquidadas por ese estado, así que la deuda puede quedar en el grupo equivocado.

**Corrección:** centralizar el cálculo de saldo y estado; ejecutarlo en la misma transacción al crear, editar o borrar abonos y al modificar el principal, tanto en cobrar como en pagar. Respetar cancelaciones y definir el tratamiento de saldos a favor. Probar también centavos y abonos concurrentes.

<a id="A05-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **Cálculo único:** [`debtAccounts.js`](../../src/lib/calculations/debtAccounts.js) usa Decimal y redondea individualmente el principal y cada abono a centavos. Gastos, Ingresos, cuentas, bootstrap de Gastos y Dashboard comparten saldo/estado. Los listados derivan la clasificación histórica sin escribir al consultar; modificar un abono o principal corrige el estado persistido.
- **Mutaciones atómicas:** [`debtAccountService.js`](../../src/lib/debtAccountService.js) coordina las altas, ediciones y eliminaciones de abonos y la edición del principal en `ReadCommitted`, con bloqueo asesor por usuario antes de leer. Cubre operaciones simultáneas y traslados de ingresos entre cuentas. Conserva el recibo idempotente del POST de gastos y la relación existente al editar gastos. Un fallo del estado revierte el movimiento/principal.
- **Cancelaciones y excedentes:** `CANCELLED` permanece cancelada. Saldo cero o negativo liquida las demás cuentas; el excedente se conserva como `pendingBalance` negativo y `excessAmount` positivo, sin compensaciones ni devoluciones automáticas. Reducir el abono o aumentar el principal reabre la cuenta cuando vuelve a existir saldo.
- **Alcance:** sin migración ni cambios visuales. No modifica datos de Supabase ni despliega. A06 se completó posteriormente para los demás flujos relacionados, especialmente compras a meses; A11 resuelve posteriormente el historial de migraciones, como se documenta en su cierre.

| Comprobación | Resultado |
| --- | --- |
| Regresiones A05 | [10 pruebas](../../tests/debt-accounts.test.cjs): $100 → $50 en abono, $100 → $200 en principal, pago excedente, cancelaciones, centavos, datos históricos con más decimales, traslado/desvinculación de ingresos, concurrencia simulada y rollback de las cuatro mutaciones. |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **175 casos, 171 correctos, 4 omitidos**, cero fallos. Las omisiones corresponden a integración sin variable de BD. [Log](a05-pruebas.log). |
| PostgreSQL real | [2 pruebas de integración A05](../../tests/debt-accounts-integration.test.cjs) correctas, sin omisiones: diez altas y diez ediciones concurrentes por tipo de cuenta, edición de principal concurrente, cancelación, rollback real de alta/edición/borrado/principal y lecturas de cuentas, Gastos y Dashboard. [Log](a05-postgres.log). |
| Entorno de integración | PostgreSQL 16 en contenedor desechable, base local `afp_test_a05`, datos ficticios eliminados al finalizar. Esquema generado desde `schema.prisma` con `prisma migrate diff --from-empty`; no prueba las migraciones de A11. Auth simulada; Prisma y SQL reales. El driver emitió una advertencia de deprecación de consultas concurrentes de `pg`; no hubo fallos. |
| Build / lint | Build de producción correcto con Google Fonts accesible. Lint: cero errores y la advertencia previa de `useReactTable`. [Build](a05-build.log) · [Lint](a05-lint.log). |

**Cierre actualizado:** corrección implementada, verificada y publicada; resta la aceptación autenticada. Para repetir la integración, configurar `AFP_TEST_DATABASE_URL` con una base local desechable cuyo nombre empiece por `afp_test`, con las migraciones actuales aplicadas, y ejecutar `node --test --experimental-test-isolation=none tests/debt-accounts-integration.test.cjs`. La ejecución original del 17/10 no publicó la app.

---

<a id="A06"></a>

### A06 · P1 · Operaciones relacionadas sin transacción

**Estado al 21/10: CUBIERTA; corrección publicada.** Hay pruebas con PostgreSQL real desechable de atomicidad y rollback. Resta aceptación autenticada entre módulos. El texto siguiente conserva el hallazgo original.

**Ubicación:** `src/app/api/expenses/route.js:296`, `installment-purchases/route.js:222`, y creación/actualización de ingresos vinculados.

La cuenta por cobrar se crea antes del gasto o de la compra MSI. Si falla la segunda escritura, queda una cuenta huérfana; reintentar puede crear otra. La reproducción fuerza el fallo del gasto y conserva una cuenta creada. Otros flujos guardan el movimiento y después actualizan el estado, pudiendo devolver 500 cuando ya se persistió una parte.

**Corrección:** transacciones que abarquen el movimiento, sus relaciones y el saldo; validar relaciones antes de escribir y combinar con idempotencia. El servicio reciente de cobros de suscripciones ya ofrece un patrón aprovechable. Aceptación: fallo de cualquier paso revierte todos los cambios.


<a id="A06-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **MSI atómico:** [`installment-purchases/route.js`](../../src/app/api/installment-purchases/route.js) usa `runDebtAccountOperation` para guardar cuenta por cobrar, compra y referencia de origen en una sola transacción `ReadCommitted`. Una excepción después de cualquiera de las escrituras revierte el conjunto. La compra sin persona conserva el alta normal sin cuenta adicional.
- **Validación de relaciones:** alta/edición de MSI y edición de gastos comprueban la pertenencia de las referencias dentro de la transacción, antes de escribir y después del bloqueo por usuario. Se conserva la validación del cuerpo y la autorización por Bearer de A01.
- **Gastos e ingresos:** se verificó la cobertura ya implementada en A02/A05. Gastos incluye recibo idempotente, cuenta opcional, gasto, decisión de suscripción y saldo por pagar; ingresos incluye movimiento y ambas cuentas al trasladar un abono. El fallo de la segunda actualización de saldo revierte también la primera.
- **Idempotencia y límites:** Gastos conserva el UUID y la respuesta durable; los reintentos concurrentes no duplican registros y el contenido distinto devuelve 409. MSI e Ingresos conservan su contrato sin recibo idempotente: el reintento después de rollback es seguro, pero no se afirma deduplicación si se pierde la respuesta después del commit. No cambia el tratamiento de cuentas independientes al editar/borrar una compra ni se reparan huérfanos históricos.
- **Alcance:** sin migración, cambios visuales ni escrituras en Supabase. Se reutiliza el servicio transaccional de A05. El historial de migraciones se verificó posteriormente en el cierre A11.

| Comprobación | Resultado |
| --- | --- |
| Regresiones MSI | [3 pruebas nuevas](../../tests/installment-transactions.test.cjs): fallos tras las tres escrituras, reintento, relaciones ajenas, usuario falsificado, compra sin cuenta y edición con rollback. |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **179 casos, 174 correctos, 5 omitidos sin variable de BD**, cero fallos. [Log](a06-pruebas.log). |
| PostgreSQL real | **5 integraciones correctas, cero omisiones**: A02, A05, A06 y suscripciones. La [nueva prueba A06](../../tests/related-operations-integration.test.cjs) inyecta **24 fallos después de escrituras reales**, verifica rollback exacto de siete tablas y reintenta cada operación. Incluye MSI, gasto con cuenta/saldo/recibo, cobro de suscripción, alta/traslado/borrado de ingreso y cinco reintentos concurrentes del gasto. [Log](a06-postgres.log). |
| Pruebas anteriores reparadas | La integración de A02 omitía `originType` al preparar una cuenta. La de suscripciones cargaba Gastos sin sus dependencias transaccionales actuales; ahora utiliza el cargador compartido con las dependencias reales. Se corrigieron las pruebas y se repitieron exitosamente. |
| Entorno | PostgreSQL 16 en contenedor desechable y base local `afp_test_a06`, esquema desde `schema.prisma` mediante `migrate diff --from-empty`, datos ficticios eliminados al finalizar. No valida las migraciones de A11. Auth simulada; Prisma y SQL reales. Advertencia previa del driver `pg` sobre consultas concurrentes, sin fallos. |
| Build / lint | Compilación de producción correcta con acceso a Google Fonts; lint sin errores, conserva la advertencia previa de `useReactTable`. [Build](a06-build.log) · [Lint](a06-lint.log). |

**Cierre actualizado:** corrección implementada, verificada y publicada; resta la aceptación autenticada entre módulos. Para repetir las integraciones, configurar `AFP_TEST_DATABASE_URL` con una base local desechable `afp_test…`, con las migraciones actuales aplicadas, y ejecutar `node --test --experimental-test-isolation=none tests/*integration.test.cjs`. La idempotencia adicional de MSI/Ingresos sigue siendo una mejora distinta de la atomicidad ya cubierta.

---

<a id="A07"></a>

### A07 · P2 · Ingresos desaparecen del historial al superar 100

**Estado al 21/10: PENDIENTE.** [`GET /api/incomes`](../../src/app/api/incomes/route.js) conserva `take: 100` y suma únicamente las filas devueltas. La paginación visual no recupera las restantes.

**Ubicación:** `src/app/api/incomes/route.js`. `take: 100` limita la consulta y el total se calcula sobre esas filas, sin cursor ni total global.

**Reproducción:** 101 ingresos de $10 devuelven 100 registros y $1,000; el total real es $1,010. La paginación del cliente no puede recuperar la fila faltante. Los registros siguen en la BD.

**Corrección:** filtros y paginación de servidor, `totalCount` y suma del conjunto filtrado independientes de la página. Aceptación: acceder al registro 101 y conservar totales correctos al cambiar de página.

---

<a id="A08"></a>

### A08 · P2 · Validación dispersa acepta fechas imposibles

**Estado al 21/10: PENDIENTE en las API financieras generales.** Ya hay esquemas Zod y validación estricta en captura/conciliación, suscripciones y determinados campos; no cubren todas las entradas manuales.

**Ubicación actual:** [`expenseService.js`](../../src/lib/expenseService.js), `src/app/api/expenses/route.js`, `src/app/api/incomes/route.js` y funciones equivalentes de cuentas. El alta manual continúa aceptando fechas normalizadas por `Date` e importes positivos sin límite general de dos decimales; `src/lib/validations.js` está vacío.

**Reproducción:** `2026-02-30` se guarda como `2026-03-02`. El constructor de Date normaliza el valor y supera la comprobación de NaN. La API general también acepta más de dos decimales, mientras el servicio de suscripciones los rechaza.

**Corrección:** esquemas Zod compartidos, validar y comparar el día normalizado, límites de importes, dos decimales y cadenas vacías tras trim. Aplicar validación en servidor. Reutilizar la validación estricta de calendario de cobros. No convertir el proyecto a TypeScript.

---

<a id="A09"></a>

### A09 · P2 · Un filtro puede mostrar resultados de otro

**Estado al 21/10: PENDIENTE.** [`loadExpenses`](../../src/components/gastos/GastosContent.jsx) aplica `setExpenses` y el estado de carga de cualquier respuesta; no pasa `signal` ni comprueba la generación del filtro. El control de generación de pendientes IndexedDB es otro flujo.

**Ubicación:** `src/components/gastos/GastosContent.jsx`. El debounce de 250 ms retrasa nuevas consultas, pero no cancela ni descarta respuestas anteriores.

**Reproducción:** se consulta A, luego B; responde B primero y A después. El filtro visible sigue en B pero se muestran filas A. Afecta principalmente al cambio de período y a filtros de escritorio; las etiquetas móviles que filtran localmente no necesitan petición.

**Corrección:** AbortController más identificador de generación; solo la petición vigente actualiza datos, errores y estado de carga. Aplicar el patrón ya usado en DashboardProvider y cobros.

---

<a id="A10"></a>

### A10 · P1 · Dependencias con avisos de seguridad pendientes

**Estado al 21/10: PARCIAL; actualización publicada y seguimiento abierto.** `package.json` y lockfile coinciden con el manifiesto de producción. La auditoría **repetida en esta revisión** confirma cero avisos de producción y uno alto de desarrollo (`braces@3.0.3` / `GHSA-vfj7-8cjw-p6xm`), sin versión corregida informada por el registro. [Producción](revision-2026-10-21-audit-prod.json) · [Árbol completo](revision-2026-10-21-audit-all.json). La comprobación explícita de `pnpm build` predeterminado permanece sin aceptación documentada. El texto siguiente conserva el hallazgo original y los datos consultados entonces.

**Evidencia:** `package.json`, lockfile y [auditoría de dependencias](dependencias.json). Next.js instalado: 16.2.6; el registro devuelve 17 avisos únicos para Next. El árbol total contiene 91 avisos únicos, incluidos cuatro críticos.

**Aplicabilidad:** no se encontraron imports de `next/og`, `ImageResponse` ni `next/image`. El aviso de [ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) requiere contenido SVG controlable por un atacante; el de [AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) requiere optimizar imágenes afectadas. Otro crítico aplica a Windows, distinto de este entorno Linux. El cuarto crítico, `proxy-addr`, llega mediante `shadcn → MCP SDK → express`, herramienta declarada como dependencia de producción. No se ha demostrado ejecución remota en AFP.

**Corrección:** actualización controlada de Next y eslint-config-next a una versión estable que cubra todos los rangos reportados (el registro consultado señala parches hasta 16.3.8), revisión de sharp y transitivas, y mover la CLI shadcn a desarrollo. Verificar en una rama con build, regresiones y navegador. No aplicar actualizaciones forzadas sin revisar compatibilidad.


<a id="A10-seguimiento"></a>

#### Actividad concluida · actualización local · 17 de octubre de 2026

- **Versiones corregidas:** Next.js y `eslint-config-next` **16.3.8** cubren todos los rangos de Next reportados, incluidos los [parches de ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) y [AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4). Sharp **0.35.5** se resuelve tanto para iconos como para Next. Se mantuvo React/React DOM 19.2.4 y se usaron versiones estables, sin `audit --fix`, overrides ni saltos de versión mayor de las dependencias directas (Sharp pasa de 0.34 a 0.35).
- **Transitivas:** actualización del lockfile dentro de los rangos compatibles. Prisma, Client y adapter-pg **7.10.1** eliminan la cadena antigua de `deepmerge-ts` (ahora 8.0.2) y actualizan sus herramientas transitivas. La CLI shadcn **4.22.0** utiliza MCP SDK corregido; desaparece el aviso crítico de `proxy-addr`. La auditoría final verifica el árbol completo, no solo Next.
- **Separación de herramientas:** shadcn se mueve a `devDependencies`. Se conserva `@import "shadcn/tailwind.css"`; instalar dependencias de desarrollo antes de compilar. Prisma permanece en producción para conservar el contrato actual de generación/migraciones. Sharp continúa declarado en desarrollo y Next también lo resuelve como dependencia opcional de producción.
- **Reproducibilidad:** `packageManager` fija pnpm **10.33.0**, con instalación `--frozen-lockfile`. Se agregan `pnpm test`, `pnpm audit:prod` y `pnpm audit:all`; el [README](../../README.md#dependencias-y-seguridad-a10) documenta el flujo único con pnpm. Trabajo realizado en la rama `fix/a10-dependency-security`.

| Auditoría del 17 de octubre | Antes | Después | Evidencia |
| --- | --- | --- | --- |
| Producción (`pnpm audit --prod --json`) | 94 incidencias, 91 GHSA únicos; 4 críticos | **0 avisos**, código de salida 0 | [Antes](a10-audit-prod-antes.json) · [Después](a10-audit-prod-despues.json) |
| Árbol completo (`pnpm audit --json`) | 100 incidencias, 91 GHSA únicos; 4 críticos | **1 alto**, 0 críticos, 0 moderados, 0 bajos; código de salida 1 | [Antes](a10-audit-antes.json) · [Después](a10-audit-despues.json) |

**Aviso residual de desarrollo:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), agotamiento de pila con patrones de llaves profundamente anidados en `braces@3.0.3`. El registro devuelve esa versión como última y no publica una versión corregida. `pnpm why braces` lo sitúa bajo `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch`, y también bajo shadcn/ts-morph; todas son herramientas de desarrollo. La auditoría JSON enumera una cadena representativa. No se encontró uso desde la aplicación y `pnpm why braces --prod` no devuelve dependientes. Se limita su uso a patrones/configuración de confianza en las herramientas locales. No se suprime el GHSA ni se fuerza una sustitución incompatible. **Seguimiento abierto:** revisar el aviso en la próxima actualización de dependencias y antes de publicar; instalar un parche compatible cuando exista. El cierre de la actualización no significa que el árbol de desarrollo esté libre de avisos.

| Comprobación | Resultado |
| --- | --- |
| Instalación fija | `pnpm install --frozen-lockfile --offline` correcto, con generación de Prisma. Node.js 22.23.2 y pnpm 10.33.0. [Log](a10-install.log). |
| Regresiones | `pnpm test`: **179 casos, 174 correctos, 5 omitidos sin variable de BD, cero fallos**. [Log](a10-pruebas.log). |
| PostgreSQL real | **5 integraciones correctas, cero omisiones** con Prisma 7.10.1 y PostgreSQL 16 desechable, base `afp_test_a10`. Comprueba idempotencia, concurrencia, abonos, rollback y suscripciones. Auth simulada; Prisma y SQL reales. Esquema generado desde `schema.prisma`, sin validar migraciones de A11. [Log](a10-postgres.log). |
| Lint | Cero errores; permanece la advertencia previa de compatibilidad de `useReactTable`. [Log](a10-lint.log). |
| Build de producción | **`pnpm build --webpack` correcto**, generación de Prisma y 29 páginas. [Log](a10-build-webpack.log). `pnpm build` con Turbopack no pudo completarse en este entorno: bloqueo al abrir el puerto interno de procesamiento CSS (`Operation not permitted`), incluso al reintentar fuera del sandbox. El primer intento también falló al acceder a Google Fonts. [Log Turbopack](a10-build.log). No se cambió el bundler predeterminado; repetir ese build en el entorno de despliegue. |
| HTTP del build Webpack | **42 métodos de 14 rutas API** responden 401 sin sesión, `private, no-store` y `Vary: Authorization`. `/` redirige a `/dashboard`; manifest responde 200. [Resultados](a10-http.json). |
| Navegador | Chromium: login a 390×844 y 1440×900; cambio entre Entrar/Crear cuenta comprueba hidratación; `/dashboard` vuelve a `/login` sin sesión. Sin errores de consola o página observados. [Móvil](a10-login-mobile.png) · [Escritorio](a10-login-desktop.png). No se enviaron credenciales ni se crearon usuarios. |
| Herramientas | `shadcn --version` devuelve 4.22.0. Sharp 0.35.5 convierte el SVG existente a PNG 192×192 en memoria. |

**Cierre actualizado:** la actualización de dependencias está implementada y publicada, y ambas auditorías se repitieron el 21/10. A10 sigue **parcial** por el aviso alto de desarrollo pendiente y la aceptación explícita del build predeterminado; hay builds Webpack correctos. La operación original del 17/10 no modificó Supabase ni publicó la app. El recorrido autenticado conserva su pendiente transversal.

---

<a id="A11"></a>

### A11 · P1 · La BD no se reproduce completamente desde Git

**Estado al 21/10: CUBIERTA.** El SQL histórico se recuperó con checksum idéntico, RLS quedó versionado y las migraciones se aplicaron a Supabase. La evidencia posterior de Fase 6 amplía la reconstrucción a **21 migraciones y 27 tablas con RLS**, sin pendientes ni drift en aquella comprobación. Los números 13/15/17 del seguimiento siguiente corresponden al historial del 15–17/10.

**Evidencia:** la base conectada registra `20260518234708_add_payable_loan_support` como aplicada, pero falta en `prisma/migrations`. Hay 13 migraciones aplicadas y 12 archivos SQL locales. Todas las migraciones locales aparecen aplicadas; no hay una migración local pendiente.

Además, RLS está activo en las 16 tablas reales, mientras solo las migraciones de las dos tablas más recientes activan RLS en el repositorio. La configuración anterior parece haberse aplicado fuera de las migraciones versionadas. No se afirma divergencia de columnas sin un diff de esquema completo.

**Impacto:** un entorno nuevo o una recuperación puede diferir de la base actual, incluida la seguridad. **Corrección:** recuperar la migración original del historial/respaldos y verificar su checksum; revisar el esquema en una base desechable; versionar la configuración de seguridad mediante una migración nueva revisada. Evitar reset, db push o reescribir el historial aplicado.

<a id="A11-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **Recuperación exacta:** no apareció una copia del SQL en Git ni en los respaldos locales consultados. Se reconstruyó con los metadatos de Supabase y `prisma migrate diff` entre modelos; el archivo resultante de [`20260518234708_add_payable_loan_support`](../../prisma/migrations/20260518234708_add_payable_loan_support/migration.sql) tiene exactamente el SHA-256 registrado: `8ef7dcd79b9e4439e96092a131bbb569cb04b405721054e6916e71479a8c40b1`. Se verificaron también los otros doce checksums aplicados, todos idénticos. No se sustituyeron checksums, marcaron migraciones con `resolve` ni modificaron filas del historial compartido.
- **Drift estructural corregido:** además del archivo ausente, faltaban en `schema.prisma` el enum de tipo de cuenta, nueve campos de préstamo, tres campos de abonos, la relación de reembolso y dos índices. Se incorporaron con sus tipos, defaults y relaciones reales. Los metadatos completos se conservan en el [snapshot de solo lectura](a11-metadata-before.json); no incluye registros financieros ni credenciales. El catálogo reproducido coincide con este snapshot, más la tabla pendiente A02.
- **Seguridad versionada:** [`20261017020000_enable_application_rls`](../../prisma/migrations/20261017020000_enable_application_rls/migration.sql) activa RLS de forma aditiva y transaccional en las 16 tablas de aplicación y `_prisma_migrations`. Sin políticas públicas, cambios de grants ni `FORCE ROW LEVEL SECURITY`; conserva el acceso del propietario y la autorización de API de A01. Incluye la función `rls_auto_enable()` y el event trigger `ensure_rls` ya existentes, conservados en el [snapshot de automatización](a11-automation-before.json). Requiere permiso para event triggers (superusuario local o `postgres` con Supautils en Supabase). Una segunda ejecución no cambia datos.
- **Herramientas reproducibles:** [`db:verify`](../../scripts/verify-database-reproduction.cjs) reconstruye dos bases locales efímeras mediante el historial real y comprueba estructura, seguridad y actualización. [`db:audit-history`](../../scripts/audit-migration-history.cjs) compara checksums en una transacción de solo lectura y distingue errores de migraciones pendientes. [Operación y comandos en README](../../README.md#reconstrucción-de-la-bd-desde-git-a11).

[Resumen verificable de resultados](a11-verificacion.json).

| Comprobación | Resultado |
| --- | --- |
| Base vacía y actualización | **Dos escenarios correctos**, PostgreSQL 16: 15 migraciones, segundo deploy sin cambios, `migrate status` correcto y `migrate diff --exit-code` sin diferencias con Prisma. La actualización comienza con las 13 migraciones del snapshot y conserva las filas originales de `_prisma_migrations`, préstamo, abono y reembolso. [Log](a11-reconstruccion.log). |
| Catálogo independiente | Columnas, tipos, defaults, nulabilidad, índices, claves y enums coinciden con los metadatos de Supabase PostgreSQL 17.6, salvo la adición esperada de A02. Se prueba el historial SQL; no se inicializan tablas desde `schema.prisma`. |
| RLS | **17 tablas con RLS, cero políticas**. Dos roles sin `SUPERUSER`/`BYPASSRLS`, con permisos SQL de lectura/escritura, no pueden leer filas, insertar usuarios ni actualizar/borrar el usuario existente. El propietario sin `BYPASSRLS` sí puede leer y escribir. El automatismo protege nuevas tablas mediante `CREATE TABLE`, `CREATE TABLE AS` y `SELECT INTO`, sin activarse en otro esquema. |
| Regresiones | **182 pruebas correctas, cero fallos y cero omisiones**, incluidas las cinco integraciones anteriores y tres pruebas nuevas de checksum, archivo ausente, migración incompleta y reconstrucción del historial. PostgreSQL local se inicializó mediante `migrate deploy`; Auth sigue simulado en las integraciones de API. [Log](a11-pruebas.log). |
| Validación estática | Schema Prisma válido y `git diff --check` correcto. Lint: cero errores y la advertencia previa de `useReactTable`. [Lint](a11-lint.log) · [Schema](a11-schema.log). |

#### Aplicación autorizada en producción · 17 de octubre de 2026, 08:23 UTC

Se aplicaron **`20261017000000_add_expense_operations` y `20261017020000_enable_application_rls`** mediante `prisma migrate deploy`, después de confirmar por MCP los 13 checksums originales y un diff limitado a la tabla A02. Se utilizó Prisma para conservar el historial nativo; el MCP verificó antes y después la estructura, RLS y las huellas de los registros existentes.

- **15 migraciones aplicadas, checksums coincidentes y cero pendientes.** [Ejecución](a11-produccion-deploy.log) · [Estado](a11-produccion-status.log).
- **Diff de esquema vacío**, 17 tablas con RLS y cero políticas; función/event trigger conservados. [Diff](a11-produccion-diff.log).
- **Registros preexistentes intactos:** coincidieron las huellas de las 15 tablas anteriores y las 13 filas originales de `_prisma_migrations`. No se volvieron a ejecutar migraciones antiguas ni se reescribieron sus checksums. [Resultado de verificación](a11-produccion.json).

**Cierre:** implementación A11 y aplicación de sus migraciones concluidas, con nuevas migraciones verificadas posteriormente. La reproducción cubre el esquema público de AFP y RLS, no el contenido financiero, usuarios de Auth ni configuración/roles administrados de Supabase. Esta operación del 17/10 no hizo push ni publicó la aplicación; las publicaciones posteriores constan en la revisión actual.

---

<a id="A12"></a>

### A12 · P2 · Falta una política explícita de datos locales al cerrar sesión

**Estado al 21/10: PENDIENTE.** A01 retiró las API del service worker y A02 aisló la cola por propietario; ninguna implementa la limpieza al salir.

**Ubicación:** `public/sw.js`, `src/lib/offlineExpenses.js`, caché bootstrap de Gastos y `AppSidebar.jsx:27`.

El bootstrap de Gastos sigue en localStorage por usuario; IndexedDB conserva pendientes y localStorage puede conservar su respaldo legado. `handleLogout` solo ejecuta `supabase.auth.signOut()` y navega al login, sin aplicar una política de limpieza/recuperación. El service worker actual **ya no almacena respuestas API**; la descripción original de esas respuestas en CacheStorage quedó superada por A01. No se ha demostrado una fuga automática entre cuentas, pero permanecen datos financieros locales en un equipo compartido. La autorización nativa Android es independiente y no se revoca al cerrar la sesión web; la política debe explicarlo.

**Corrección:** política de dispositivo confiable, caché aislada por usuario y limpieza de datos sincronizados al salir. Advertir y permitir exportar/sincronizar pendientes antes de borrarlos; conservar recuperabilidad. El cifrado con una clave almacenada junto a los datos no resolvería por sí solo este problema.

---

<a id="A13"></a>

### A13 · P2 · Consultas y cálculos crecen con todo el historial

**Estado al 21/10: PENDIENTE.** Se conservan las consultas completas por propietario y la dependencia de las cabeceras móviles respecto del dashboard; compartir peticiones evita duplicarlas, pero no acota su volumen.

**Ubicación:** `src/app/api/dashboard/route.js`, `src/app/api/expenses/route.js`, `src/app/api/card-cycles/route.js` y `DashboardProvider.jsx`.

Dashboard carga todos los gastos/ciclos/MSI/suscripciones y reconstruye comparativos. Gastos vuelve a leer todas las fechas del usuario para calcular los meses disponibles en cada consulta. En móvil, DashboardProvider también consulta el dashboard desde otras secciones para la cabecera. Esto es crecimiento comprobable en código; no se midió lentitud actual en producción.

**Corrección:** separar resumen de cabecera de análisis completo, acotar ventanas temporales sin perder referencias históricas, paginar y agregar en SQL. Medir cantidad de consultas, bytes, p95 y memoria con volúmenes sintéticos. Conservar el bootstrap agrupado y el desglose bajo demanda que ya existen.

---

<a id="A14"></a>

### A14 · P2 · El login móvil tiene controles táctiles pequeños

**Estado al 21/10: PENDIENTE.** El código mantiene los tamaños base `h-7` para inputs y botón; cambiar de modo conserva `h-auto p-0`. La recuperación de errores incorporada al login no cambia esas áreas táctiles.

**Evidencia de navegador del 15/10:** a 390 px, ambos inputs y Entrar miden 28 px de alto; Crear cuenta mide 22 px. [Captura histórica](login-mobile.png). Ubicación: `src/app/login/page.js` y componentes base Input/Button. No se repitió la medición en navegador en esta revisión.

**Impacto:** tocar y completar el acceso resulta menos cómodo que los controles móviles de 44–48 px ya usados en otras partes. **Corrección:** áreas táctiles de al menos 44 px y campos más legibles en el login; verificar teclado, autocompletado y zoom. Los 44 px son aquí un objetivo ergonómico; no se declara una infracción WCAG AA solo por medir menos de 44 px.

---

<a id="mejoras"></a>

## Arquitectura, calidad e interfaz

**Conservar:** cálculos compartidos entre Tarjetas y Dashboard, referencias bancarias por período, montos a centavos, estimaciones explícitas, operaciones transaccionales, componentes locales, adaptación móvil, borradores y recuperación de errores. La suite ya incluye integraciones PostgreSQL y Android; no se limita a las 103 regresiones originales.

| Mejora | Estado al 21/10 | Ya realizado | Qué falta |
| --- | --- | --- | --- |
| Servicios por operación | **PARCIAL** | `expenseService`, `expenseOperations`, `debtAccountService`, `subscriptionChargeService` y servicios de captura separan reglas y transacciones. | Gastos aún tiene 1,921 líneas y Dashboard API 1,180; separar consultas/contratos sin duplicar reglas. |
| Política monetaria | **PARCIAL** | Decimal en BD/deudas e importes a centavos en pagos, desgloses y aportaciones. | `money.js` sigue vacío y algunas rutas suman con `Number`; compartir validación/aritmética y resolver A08. |
| Pruebas de límites | **PARCIAL** | Aislamiento, referencias ajenas, rollback, idempotencia, concurrencia, navegador y cliente nativo con PostgreSQL ya tienen pruebas específicas. | Auth Supabase real con dos usuarios, calendario A04 y carrera A09. Parte de los tests carga fuentes mediante VM; no equivale por sí sola a probar todo el ensamblado real. |
| Comandos reproducibles y CI | **PARCIAL** | `packageManager`, lockfile, `pnpm test`, auditorías y flujo pnpm documentados; reconstrucción de BD desde migraciones. | No hay pipeline CI versionado ni separación de ambientes dev/prod documentada. El viejo pendiente de elegir npm/pnpm ya está cubierto. |
| Recuperación y observabilidad | **PARCIAL** | `RequestErrorDialog`, timeout, reintentos, `Retry-After`, cambio guardado y errores de sincronización visibles; seguimiento de captura por período. | RequestId y logs estructurados comunes, métricas de latencia/fallos y error boundaries por módulo. No hay archivos `error.js`/`global-error.js` en `src/app`. |
| Documentación y capas compartidas | **PARCIAL** | React Hook Form + Zod ya se usan en Configuración/Captura y sus servicios; hay guía, plan y evidencias. | `validations.js`, `money.js`, `dates.js` y `src/actions/*` siguen vacíos; distinguir convenciones previstas de cobertura real. El README también conserva conteos históricos, por ejemplo las 15 migraciones de A11. |
| Recuperar/cambiar contraseña | **PENDIENTE** | Login/registro y recuperación de fallos de conexión. | Flujo de recuperación y cambio de contraseña con Supabase; decidir el alcance del registro abierto para una app personal. |

### Evaluación de interfaz histórica · 15 de octubre — skill impeccable

La puntuación siguiente se conserva como **evaluación provisional original**, basada en código e inspección del login. No se volvió a puntuar ni se realizó una nueva auditoría visual con esa skill en esta revisión documental. Existen pruebas visuales posteriores de módulos concretos en los artefactos de gastos compartidos, errores y captura Android; ninguna constituye una certificación de toda la app.

| Dimensión | /4 | Observación |
| --- | --- | --- |
| Accesibilidad | 3 | Etiquetas asociadas, mensajes ARIA y primitivas accesibles; recorrido autenticado con teclado pendiente. |
| Rendimiento | 2 | Bootstrap y gráficas diferidas; consultas de historial completo y carreras de filtros. |
| Responsive | 2 | Adaptaciones móviles extensas; login con objetivos táctiles pequeños comprobados. |
| Tokens y tema | 3 | Sistema compartido y modo oscuro intencional; contraste completo pendiente. |
| Consistencia visual | 3 | Observación del 15/10; después hubo inspecciones de módulos concretos con datos/Auth ficticios. El recorrido completo autenticado sigue pendiente. |
| **Total provisional** | **13/20** | Mejora focalizada; conservar el sistema existente. |

La siguiente revisión de interfaz puede centrarse en login táctil A14, carrera de filtros A09 y aceptación autenticada con teclado. La recuperación de errores ya está implementada; solo debe ampliarse donde una prueba identifique una carencia.

<a id="features"></a>

## Nuevas funciones propuestas

Estas propuestas no son correcciones obligatorias para cerrar A01–A14. Se actualiza su estado para no volver a proponer como ausente lo que ya existe. Esfuerzo relativo del alcance restante: S = acotado; M = varios flujos; L = modelo y flujos nuevos; no son estimaciones de calendario.

| Función | Estado al 21/10 | Qué existe y qué falta | Esfuerzo restante | Criterio de éxito |
| --- | --- | --- | --- | --- |
| **Conciliación dentro de la app** | **PARCIAL** | Fase 5 ya ofrece cotejo manual por tarjeta/período, diferencias explicadas, evidencias y faltantes idempotentes. Falta importación general de CSV/JSON revisado con previsualización; PDF posterior. | L | Reimportar el mismo archivo crea cero duplicados y cada diferencia puede explicarse. |
| **Calendario financiero y reserva por quincena** | **PARCIAL** | Hay avisos y cargas Q15/Q30 de tarjetas. Falta una vista integrada con suscripciones, cobros y deudas, reserva explicable y proyección. | M; L con saldos | Abrir los totales hasta cada movimiento sin duplicar compra a crédito y pago como consumo. |
| **Historial de abonos de tarjetas** | **PARCIAL** | A03 ya resuelve saldo, parcial y cierre con cero; devoluciones posteriores también están implementadas. Falta `CardCyclePayment`: pagos individuales, referencias e historial. | M | Varios abonos cuadran con el corte y pueden deshacerse con trazabilidad. |
| **Presupuestos por categoría** | **PENDIENTE** | No hay modelo/flujo de presupuesto; faltan límite, gasto/compromisos, disponible y umbrales. | M | El consumo coincide con Análisis y explica MSI y suscripciones. |
| **Historial general, papelera y exportación** | **PENDIENTE** | Los recibos, evidencias y `ExpenseTombstone` sirven a captura/deduplicación; no son un historial general ni permiten restaurar eliminaciones. Falta el flujo completo. | M | Restaurar conserva relaciones y exportar incluye todos los registros. |
| **Alertas de calendario ICS/push** | **PENDIENTE** | Hay avisos dentro de AFP. No hay exportación ICS ni recordatorios push propios; escuchar avisos bancarios en Android cumple otra función. | S → M | Un aviso por evento con zona horaria correcta y acciones de resolución. |
| **Tarifas y pausas de suscripciones** | **PARCIAL** | Hay activación/desactivación, cobros por mes y referencias históricas. Falta historial de tarifas efectivas y períodos de pausa. | M | Cambiar una tarifa futura conserva la lectura de los meses históricos. |

Para llamar a una cifra «dinero disponible» se necesitan saldos iniciales, cuentas de efectivo/banco y transferencias, hoy no modelados. Primero puede mostrarse una reserva de compromisos, claramente identificada; añadir cuentas y transferencias sería una fase posterior. Evitar presentar ingreso menos gasto como saldo real sin esos datos.

<a id="orden"></a>

## Estado de las cinco etapas recomendadas

Estas etapas agrupan el trabajo de la auditoría; **no son las fases numeradas del plan Android**. «Correcciones cubiertas» y «aceptación pendiente» se distinguen expresamente para evitar repetir implementaciones terminadas.

| Etapa | Estado global | Cubierto | Falta para cerrar ese alcance |
| --- | --- | --- | --- |
| **1 · Seguridad** | **PARCIAL** | A01 implementada/publicada; A11 reconstruye BD/RLS y sus migraciones están aplicadas; actualización A10 publicada y auditorías repetidas el 21/10. | Aviso de desarrollo y build predeterminado A10; aceptación de aislamiento con dos sesiones Supabase reales. |
| **2 · Integridad de registros** | **Correcciones CUBIERTAS; aceptación PARCIAL** | A02, A05 y A06 publicadas, migración A02 aplicada, pruebas de cola/navegador y PostgreSQL con concurrencia/rollback. | Un recorrido autenticado de captura, reintento y edición entre módulos. No falta volver a implementar ni publicar estas correcciones. |
| **3 · Exactitud visible** | **PARCIAL** | A03 publicada; parciales/cero/devoluciones y reglas compartidas. | **A04, A07, A08 y A09**: calendario, historial completo, validación y respuestas de filtros. |
| **4 · Operación diaria** | **PARCIAL** | Cola durable, recuperación de errores, flujo pnpm y adaptación móvil de varios módulos. | **A12, A13 y A14**, recuperación de contraseña, CI y observabilidad común. |
| **5 · Producto** | **PARCIAL** | Cotejo manual y captura/revisión, avisos, Q15/Q30 y acumulado de pagos. | Importación general de estados, calendario/reserva integrado, presupuestos e historial individual; las fases Android 1/4/6/7 siguen abiertas. |

### Próximo trabajo concreto

1. **Cerrar la aceptación transversal y el seguimiento A10:** dos cuentas reales en un ambiente aislado, seguimiento del aviso de desarrollo y build predeterminado; repetir auditorías cuando cambien dependencias o antes de publicar. Las correcciones A01/A02/A03/A05/A06 ya constan publicadas; no se necesita otro despliegue para documentar aquel cierre.
2. **Resolver A04 y A08:** calendario local y validación del servidor, con casos de día límite, medianoche, cambio de año, `2026-02-30` y más de dos decimales.
3. **Resolver A07 y A09:** obtener el ingreso 101 con total global correcto y descartar respuestas antiguas al alternar filtros.
4. **Completar operación diaria:** A12 con pendientes recuperables, A14 en el login y A13 con mediciones sintéticas; añadir recuperación de contraseña y pipeline CI.
5. **Continuar Android según la evidencia disponible:** publicar la ampliación local cuando se autorice; recoger/revisar avisos de crédito, comprobar pantalla bloqueada, activar solo formatos validados y conciliar un corte completo de BBVA antes de ampliar por tarjeta. La validación real puede avanzar mientras se corrigen los hallazgos generales.

Las casillas del plan Android, el estado de cada hallazgo y las evidencias de publicación deben actualizarse juntos en futuros cierres. Una actividad técnica terminada no debe cerrar una fase cuyo criterio de aceptación siga pendiente.
