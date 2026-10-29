AFP · Auditoría original: 15 de octubre de 2026 · Revisión de estado: 29 de octubre de 2026

# Estado de la auditoría y trabajo pendiente

**El informe anterior estaba parcialmente desactualizado. Quedan 6 correcciones cubiertas, 2 parciales y 6 pendientes.** A01, A02, A03, A05, A06 y A11 conservan su corrección; A04 pasa de pendiente a parcial porque ya compara días, pero aún depende de la zona horaria del proceso. A10 sigue parcial: el build predeterminado ya pasa, aunque el último análisis completo de dependencias disponible vuelve a reportar avisos de producción. A07, A08, A09, A12, A13 y A14 siguen pendientes.

Se mantienen los **14 hallazgos originales: 1 P0, 6 P1 y 7 P2**. Las prioridades describen el riesgo original. Las nuevas funciones de Mi dinero, presupuestos, Google Calendar, abonos individuales y captura bancaria no deben seguir figurando como ausentes.

**Cómo leer los estados:** **CUBIERTA** significa corrección implementada, con regresiones y evidencia histórica de publicación/aplicación; no certifica todos los recorridos reales. **PARCIAL** indica trabajo realizado con un requisito del hallazgo todavía abierto. **PENDIENTE** indica que persiste el defecto general. La revisión actual comprueba el repositorio **`673daab7c84bb1b8a463bb8b105ddab15eec9193`**, no el estado remoto de producción. Las publicaciones citadas son registros históricos; no se afirma que la migración local a TypeScript esté publicada.

**Contenido**

- [Estado de los 14 hallazgos](#estado-actual)
- [Qué se comprobó en esta revisión](#revision-2026-10-29)
- [Estado de las fases Android](#fases-android)
- [Hallazgos y evidencia histórica](#hallazgos)
- [Mejoras técnicas](#mejoras) · [Funciones propuestas](#features)
- [Estado de las cinco etapas y próximos pasos](#orden)

<a id="estado-actual"></a>

## Estado de los 14 hallazgos · 29 de octubre de 2026

| ID | Prioridad original | Estado | Evidencia vigente | Qué falta |
| --- | --- | --- | --- | --- |
| [A01](#A01) | P0 | **CUBIERTA** | Bearer validado, propietario y referencias comprobados, respuestas privadas y API fuera de caché; regresiones actuales correctas. | Aceptación transversal con dos cuentas Supabase reales en un ambiente aislado. Auth sigue simulado en las pruebas locales. |
| [A02](#A02) | P1 | **CUBIERTA** | IndexedDB, UUID, recibo idempotente y transacción; integraciones PostgreSQL correctas. Hay aceptación de navegador posterior de dos pestañas y respuesta perdida. | Recorrido offline completo con sesión real; la política de limpieza pertenece a A12. |
| [A03](#A03) | P1 | **CUBIERTA** | Saldo exigible real, parciales, cero, devoluciones y bloqueo transaccional. Ya existen `CardCyclePayment` y `MoneyCardPayment` para abonos identificados. | Aceptación autenticada del formulario. El total acumulado manual y los abonos individuales conservan contratos distintos. |
| [A04](#A04) | P2 | **PARCIAL** | El vencimiento a las 06:00 ya no se reproduce; comparación por día y pruebas de límites implementadas. | Unificar zona explícita: a un mismo instante, `TZ=UTC` puede dar vencido mientras en México todavía es el día límite. `/api/card-cycles` usa el reloj del servidor. |
| [A05](#A05) | P1 | **CUBIERTA** | Recalcula deuda/estado en transacción con Decimal y bloqueo por usuario; concurrencia y rollback comprobados con PostgreSQL. | Aceptación autenticada de altas, ediciones y traslados. |
| [A06](#A06) | P1 | **CUBIERTA** | Gasto, MSI, ingreso y relaciones se guardan atómicamente; rollback real comprobado otra vez. | Aceptación autenticada entre módulos. La idempotencia adicional de MSI/Ingresos queda fuera del cierre de atomicidad. |
| [A07](#A07) | P2 | **PENDIENTE** | Reproducción actual: 101 ingresos de $10 → 100 filas y total $1,000. | Paginación de servidor, conteo y suma del conjunto completo. |
| [A08](#A08) | P2 | **PENDIENTE** | Ya existen contratos Zod tipados, pero Gastos/Ingresos aún aceptan `2026-02-30`, `10.123` y conceptos en blanco. | Validación semántica compartida de fechas, importes y texto en el servidor. |
| [A09](#A09) | P2 | **PENDIENTE** | Reproducción actual de `loadExpenses`: responde B y después A; el filtro sigue en B y se muestran filas A. | Cancelación y control de generación en esa lectura, incluidos errores y carga. |
| [A10](#A10) | P1 | **PARCIAL** | Actualización anterior conservada; **`pnpm build` con Turbopack correcto ahora**. Último audit completo, 27/10: 7 avisos de producción, incluidos 2 críticos; 8 en el árbol completo. | Atender esos avisos y repetir la consulta: los intentos actuales fallaron por DNS/timeout. No hay un resultado de seguridad válido del 29/10. |
| [A11](#A11) | P1 | **CUBIERTA** | Reconstrucción y actualización actuales: **42 migraciones y 45 tablas con RLS**, checksums, datos conservados y diff vacío. | Mantener verificación al añadir migraciones; no equivale a auditar hoy la BD de producción ni a respaldar Auth/secretos/datos. |
| [A12](#A12) | P2 | **PENDIENTE** | Datos aislados por usuario, API excluida del worker y cola durable. El logout sigue sin limpieza de datos financieros locales. | Política de dispositivo confiable y recuperación/sincronización de pendientes antes de borrarlos. |
| [A13](#A13) | P2 | **PENDIENTE** | Persisten lecturas completas de gastos/ciclos y de todas las fechas de Gastos; el dashboard alimenta la cabecera móvil. | Acotar/paginar/agregar y medir consultas, bytes, p95 y memoria con volumen sintético. |
| [A14](#A14) | P2 | **PENDIENTE** | Login conserva Input/Button con `h-7` y cambio de modo con `h-auto p-0`. | Objetivos táctiles de 44 px y aceptación con teclado, autocompletado y zoom. Sin medición nueva en navegador. |

**Aceptación transversal aún abierta:** sesión Supabase real → interfaz → API → PostgreSQL con dos usuarios aislados, incluyendo operaciones financieras. Las pruebas actuales de integración usan PostgreSQL real desechable y Auth simulado; las evidencias reales de teléfono y producción cubren flujos concretos.

<a id="revision-2026-10-29"></a>

## Qué se comprobó en esta revisión

Se leyó el README completo y se contrastaron los 14 hallazgos con código, pruebas, esquema, migraciones y evidencias posteriores. Solo se actualiza documentación y se guardan diagnósticos. No se modificó código funcional, no se consultaron datos financieros de producción y no hubo despliegues ni escrituras remotas. PostgreSQL 16 local desechable se inicializó con las migraciones reales; las conexiones de los comandos se fijaron explícitamente a esa base ficticia. El build puede leer `.env`/`.env.local`, pero sus variables de conexión y Auth se sustituyeron por valores locales/ficticios.

| Comprobación del 29/10 | Resultado y evidencia |
| --- | --- |
| Tipos de web, pruebas y contratos negativos | `pnpm typecheck`, `pnpm typecheck:tests` y `pnpm test:types`: **correctos**. [Web](revision-2026-10-29/typecheck.log) · [Pruebas](revision-2026-10-29/typecheck-tests.log) · [Contratos](revision-2026-10-29/test-types.log). |
| Regresiones completas | `pnpm test`: **871 casos correctos, cero fallos y cero omisiones**; 572 de primer nivel y 299 subcasos. [Log](revision-2026-10-29/test.log). |
| Lint | **Cero errores y 3 advertencias existentes:** `loadSubscriptions` sin uso, `activeReceivables` sin uso y compatibilidad TanStack/React Compiler en `data-table.tsx:65`. [Log](revision-2026-10-29/lint.log). |
| Build predeterminado | `pnpm build`: **correcto**, Next.js 16.3.8 con **Turbopack** y comprobación TypeScript. Cierra el antiguo pendiente del bundler en A10. [Log](revision-2026-10-29/build.log). |
| Reconstrucción y actualización de BD | `pnpm db:verify`: **42 migraciones, 45 tablas con RLS**, catálogo equivalente, diff vacío, checksums, deploy repetible y conservación de registros. Vuelve a ejecutar las **871 regresiones sin omisiones**. [Log](revision-2026-10-29/db-verify.log). |
| Reproducciones específicas | A04: defecto horario residual entre zonas. A07: fila 101 inaccesible. A08: fecha imposible, tres decimales y texto vacío. A09: respuesta antigua reemplaza filtro actual. Código real con persistencia/HTTP ficticios. [Script](revision-2026-10-29/reproduce.ts) · [Resultados](revision-2026-10-29/reproductions.json). |
| Dependencias | Ambos `pnpm audit` fallaron: `EAI_AGAIN` dentro del sandbox y `ETIMEDOUT` tras reintentar fuera. **No se interpretan como cero avisos.** [Intento producción](revision-2026-10-29/audit-prod.json) · [Intento completo](revision-2026-10-29/audit-all.json). Se conserva como último resultado completo el [registro del 27/10](../mi-dinero/presupuesto-diario/dependency-audit.json). |
| Navegador y Android | No se repitieron en esta revisión. La [aceptación del 28/10](../typescript-tests-migration/phase-6/README.md) registra formulario de transferencia → API → PostgreSQL, Captura y offline en dos pestañas, con Auth ficticio. La [publicación de avisos Android](../android-important-notices/production.json) documenta APK **0.8.0 / 11** instalada, con permiso/entrega real de esos avisos pendientes en aquel momento. |
| Publicación, evidencia histórica | Las correcciones originales constan en la [publicación de Fase 6](../android-fase6/production-deployment.json). Hay publicaciones posteriores de [Mi dinero](../mi-dinero/production.json), [presupuestos](../mi-dinero/presupuesto-diario/production.json) y [automatización de débito](../bbva-debit-automation/production.json); esta última registra 42 migraciones y 45 tablas con RLS el 27/10. **No se cotejó el despliegue remoto actual con este commit.** |

[Resumen y huellas de fuentes revisadas](revision-2026-10-29/summary.json). Entorno: Node.js 22.23.2 y pnpm 10.33.0. Los resultados actuales sustituyen los conteos de pruebas/migraciones del resumen del 21/10; los logs antiguos se conservan.

<a id="revision-2026-10-21"></a>

La revisión anterior queda como antecedente en [revision-2026-10-21.json](revision-2026-10-21.json), sus auditorías y las secciones históricas siguientes. Sus comparaciones de 230 archivos, cero avisos de producción y 21 migraciones **no describen el estado actual**. Los conteos del 15–17/10 y las menciones a «implementación local» también corresponden a aquellas fechas.

<a id="fases-android"></a>

## Estado de las fases de captura Android

**Tres fases cubiertas: 2, 3 y 5. Cuatro parciales: 1, 4, 6 y 7.** La clasificación global permanece; cambió sustancialmente lo ya implementado/publicado. Según el [plan actualizado al 23/10](../../PLAN_CAPTURA_AUTOMATICA_ANDROID.md) y las evidencias de publicación, hay formatos habilitados para **7 de 9 tarjetas**: BANAMEX 1/2, BBVA, DIDI, MERCADOPAGO, NU y SANTANDER. HSBC 1/2 seguían pendientes de recepción accesible. No se consultaron hoy las reglas ni el teléfono.

| Fase | Estado | Evidencia posterior y pendiente real |
| --- | --- | --- |
| **1 · APK y notificaciones** | **PARCIAL** | APK/TWA, permisos, fuentes y batería implementados; última instalación documentada **0.8.0 / 11**, coincidente con `android/app/build.gradle.kts`. Falta acreditar captura bancaria real con pantalla bloqueada y completar cobertura de fuentes. No confundirla con pruebas sintéticas de cola. |
| **2 · Vinculación y recepción** | **CUBIERTA** | Credencial propia revocable, código de un uso, propietario inmutable y recepción idempotente; [vinculación real documentada](../android-fase2/phone-activation.json). |
| **3 · Cola y sincronización** | **CUBIERTA** | Room cifrado, UUID, WorkManager, reintentos, persistencia y reinicio físico [verificados](../android-fase3/verification.json). La recepción bancaria bloqueada sigue en Fase 1. |
| **4 · Interpretación y registro** | **PARCIAL** | Hay analizadores reales publicados y habilitados; ya no corresponde decir que todos los formatos son desconocidos. Falta completar las muestras/canales de cada tarjeta y HSBC. Véanse [Santander](../android-santander/production.json), [Nu/Mercado Pago](../android-nu-mercadopago/production.json) y [BBVA Wallet](../android-bbva-wallet/production.json). |
| **5 · Revisión y conciliación** | **CUBIERTA** | Bandeja, reglas, corrección, cotejo y faltantes idempotentes; publicación posterior de la [sección Registro automático](../automatic-recording-ux/production.json). La importación general de archivos sigue siendo una propuesta distinta. |
| **6 · Piloto BBVA crédito** | **PARCIAL** | [BBVA Wallet publicado/habilitado](../android-bbva-wallet/production.json), con compra inicial registrada y cotejo puntual. Falta observar la siguiente compra automática, medir ausencia de avisos y conciliar un corte completo. El nuevo [flujo de débito](../bbva-debit-automation/production.json) tiene aceptación y reglas propias. |
| **7 · Otras tarjetas** | **PARCIAL** | Ampliación publicada y siete tarjetas con algún formato habilitado. Faltan cobertura completa de canales, recepción HSBC y observación/conciliación de períodos completos; ya no falta publicar la preparación inicial de Fase 7. |

El aviso **Nu/CFE original fue resuelto y vinculado al cobro de suscripción**, según su [estado de producción](../android-nu-cfe/production-state.json); las publicaciones posteriores conservaron esa automatización. El [aviso BBVA Wallet posterior](../android-bbva-wallet/production.json) también fue resuelto. Se retira la afirmación anterior «ningún formato completo está activado». Los cotejos iniciales no acreditan un estado de cuenta completo, y la instalación de la APK no demuestra entrega de todos los avisos.

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

El `repro.cjs` original se conserva como evidencia del código del 15/10: depende de rutas JavaScript retiradas y **no es ejecutable sobre el árbol actual**. Tampoco deben reutilizarse los comandos `tests/*.test.cjs` de los logs históricos. Hoy se usa `pnpm test` y la selección exacta `.test.ts` del README. Para reproducir los defectos vigentes: `node --import tsx artifacts/auditoria-2026-10-15/revision-2026-10-29/reproduce.ts`. Este diagnóstico usa mocks y sus aserciones describen el defecto, no una aceptación de su corrección.

<a id="hallazgos"></a>

## Hallazgos, impacto y corrección

Cada apartado comienza con su estado al **29 de octubre**. Los hallazgos originales y seguimientos del 15–17/10 se conservan para explicar la corrección y sus límites. Sus cifras, comandos y ubicaciones antiguas son históricos; los enlaces a implementación y pruebas apuntan a sus sucesores TypeScript cuando existen. La ejecución vigente se describe en la revisión superior.

<a id="A01"></a>

### A01 · P0 · API sin autenticación y autorización

**Estado al 29/10: CUBIERTA; publicación histórica documentada y regresiones actuales correctas.** Se conserva pendiente la aceptación con dos cuentas Supabase reales en un ambiente aislado. Autenticación y aislamiento están cubiertos por regresiones; la evidencia de publicación y sus límites se detallan en la revisión actual. El hallazgo siguiente es histórico.

**Evidencia:** `src/app/api/expenses/route.js:126,218,346,443`, `cards/route.js:101` y `setup-user/route.js:26`. Doce rutas aceptan el usuario del cliente o modifican por ID. Solo `subscription-charges` y `notice-dismissals` validan el Bearer contra Supabase. No se encontró una protección central de servidor.

**Impacto:** conocer un ID puede permitir leer, alterar o eliminar información sin iniciar sesión. `setup-user` también permite enviar otro usuario y correo. RLS está activo, pero la conexión de Prisma lo omite; el redirect del navegador no protege la API.

**Reproducción:** A01/A01b muestran lectura y borrado aceptados sin token con persistencia ficticia; la petición HTTP real confirmó acceso a la ruta de gastos sin sesión, usando un ID inexistente.

**Corrección:** helper de autenticación obligatorio en todas las rutas; obtener `user.id` del token validado; filtrar cada escritura por ID y propietario; comprobar que tarjeta, categoría, persona y cuentas vinculadas pertenecen al mismo usuario. Reutilizar el patrón de las dos rutas protegidas. Mantener la denegación pública de RLS. Si está publicada, restringir temporalmente su acceso hasta corregir.

**Aceptación:** solicitudes anónimas → 401; usuario A nunca lee, modifica, elimina o vincula registros de B; el `userId` enviado no cambia la identidad autorizada. Esta protección por endpoint coincide con la [guía oficial de Next.js](https://nextjs.org/docs/app/guides/authentication); véase también [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

<a id="A01-seguimiento"></a>

<a id="A01-seguimiento-titulo"></a>

#### Implementación completada

- **Sesión obligatoria en las 14 rutas:** [`apiAuth.ts`](../../src/lib/apiAuth.ts) valida el Bearer mediante `supabase.auth.getUser(token)` antes de leer el cuerpo o consultar Prisma. El usuario procede del token validado; se ignora el `userId` del cliente. `setup-user` también obtiene el correo de la identidad validada.
- **Autorización por propietario:** consultas filtradas por usuario; ediciones y borrados por ID más propietario, incluidas actualizaciones indirectas de cuentas. Se comprueba la pertenencia de tarjetas, categorías, personas, tipos de ingreso, suscripciones y cuentas vinculadas antes de escribir. Se rechazan objetos usados como filtros de Prisma en lugar de IDs.
- **Cliente y sincronización:** [`apiFetch.ts`](../../src/lib/apiFetch.ts) adjunta el token vigente a todas las llamadas y verifica la cuenta esperada. La cola offline conserva los pendientes cuando falta la sesión o cambia su propietario.
- **Respuestas privadas:** `Cache-Control: private, no-store` y `Vary: Authorization`. El service worker v4 excluye todas las rutas `/api/`, incluso como navegación, y elimina la caché anterior al activarse. El respaldo local de Gastos sigue separado por usuario.
- **Documentación:** [README actualizado](../../README.md) con el contrato de autenticación, las reglas de autorización y las pruebas. No se modificaron tablas, migraciones ni políticas RLS.

#### Verificación de la corrección

| Comprobación | Resultado posterior a la corrección |
| --- | --- |
| HTTP sobre servidor compilado local | Los 42 métodos exportados de las 14 rutas devolvieron **401 sin sesión**, con respuestas privadas y sin almacenamiento en caché. |
| Autorización y aislamiento | [32 pruebas nuevas](../../tests/api-authorization.test.ts) correctas con Auth y persistencia simulados: ausencia de token, tokens inválidos, suplantación de `userId`, aislamiento entre dos usuarios, operaciones propias permitidas, rechazo de vínculos ajenos y protección de `setup-user`. |
| Cliente, cola y service worker | [4 pruebas nuevas](../../tests/api-fetch.test.ts) correctas: uso del token renovado, bloqueo por ausencia o cambio de sesión, conservación de pendientes y exclusión de API de la caché. |
| Regresiones existentes | `node --test tests/*.test.cjs` terminó correctamente. La integración con PostgreSQL quedó omitida por falta de `AFP_TEST_DATABASE_URL`. |
| Build y lint | Compilación exitosa con acceso a Google Fonts. Lint sin errores; conserva la advertencia previa de compatibilidad de `useReactTable` en `data-table.jsx:61`. `git diff --check` sin incidencias. |

**Pendiente vigente:** comprobar el flujo autenticado con dos cuentas Supabase reales y PostgreSQL en un ambiente aislado. La publicación se completó posteriormente y ya no es una tarea pendiente de A01. Las pruebas de aislamiento simulan Auth; la comprobación HTTP de producción guardada cubre solicitudes anónimas. La operación original del 17/10 no desplegó ni modificó la BD.

Este seguimiento corresponde a A01. Los ajustes de autenticación de la cola y de caché no resolvían A02 ni A12. A02 se implementó posteriormente como se documenta abajo; A12 sigue pendiente.

---

<a id="A02"></a>

### A02 · P1 · La cola offline puede duplicar o perder gastos

**Estado al 29/10: CUBIERTA; publicación/aplicación históricas documentadas y regresiones actuales correctas.** PostgreSQL y navegador ya tienen evidencia específica de idempotencia, concurrencia y conservación de pendientes. Resta la aceptación operativa con sesión real; la política de salida pertenece a A12.

**Ubicación:** `src/lib/offlineExpenses.js:46–79`; captura online/offline en `GastosContent.jsx:558`; POST de gastos.

**Reproducción:** una sola entrada genera dos POST cuando dos sincronizadores leen la misma cola. El `clientId` local no se envía al servidor. Otra reproducción añade una captura durante el envío: al terminar, `writeOfflineExpenses(userId, failedExpenses)` sobrescribe la cola y elimina esa captura todavía no enviada. Una respuesta perdida tras guardar también puede causar otro registro al reintentar.

**Corrección:** UUID estable de operación, enviado desde la primera captura; restricción única por usuario/operación en BD; respuesta idempotente. Cola transaccional en IndexedDB, eliminación por ID confirmado y coordinación entre pestañas. No reemplazar toda la cola con una instantánea vieja.

**Aceptación:** probar respuesta perdida, dos pestañas, nueva captura durante sync y cierre de pestaña: cada gasto persiste una vez y ningún pendiente desaparece.

<a id="A02-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **Captura durable:** online y offline pasan primero por IndexedDB, con un UUID por operación. El formulario se limpia después del commit local; los fallos de almacenamiento conservan sus datos y no generan POST.
- **Cola y pestañas:** eliminación por ID confirmado, actualización individual de errores, Web Locks por usuario y avisos BroadcastChannel. Sin Web Locks, la protección definitiva sigue en el servidor. Una nueva captura durante un envío nunca se reemplaza por una instantánea antigua.
- **Servidor idempotente:** [`expenseOperations.ts`](../../src/lib/expenseOperations.ts) utiliza una clave única usuario/UUID y una huella del contenido. Repetir la operación devuelve el recibo original; cambiar los datos devuelve 409. Gasto, cuenta vinculada, decisión de suscripción, estado de cuenta por pagar y recibo se confirman juntos o se revierten juntos. El recibo sobrevive a la edición/eliminación del gasto.
- **Compatibilidad:** importación transaccional de pendientes de localStorage con marcadores por entrada y copia original conservada. Los clientes antiguos sin UUID no adquieren idempotencia; hay que cerrar/recargar sus pestañas al actualizar. Una respuesta perdida antes de esta versión no puede deduplicarse retroactivamente sin evidencia.
- **Migración aditiva aplicada a Supabase:** [`20261017000000_add_expense_operations`](../../prisma/migrations/20261017000000_add_expense_operations/migration.sql), con RLS activo y sin políticas públicas. Se aplicó con autorización el 17 de octubre de 2026 en el seguimiento de producción de A11; esta operación no desplegó la aplicación. [README actualizado](../../README.md#pwa--modo-offline).

| Verificación | Resultado |
| --- | --- |
| Regresiones de cola y POST | 13 casos nuevos correctos: UUID estable, concurrencia, captura durante sync, reapertura, migración única, respuesta perdida/truncada, almacenamiento fallido, conflicto de contenido, aislamiento y rollback. Persistencia del servidor simulada. |
| Chromium, IndexedDB y Web Locks reales | Respuesta perdida: 2 peticiones, 1 operación. Dos pestañas: la segunda espera; cerrar la primera durante el POST libera el bloqueo y recupera el gasto. La captura concurrente permanece. Cerrar antes del POST permite recuperar el pendiente al reabrir. API simulada; [evidencia](a02-verificacion.json) y [fixture reproducible](../../tests/helpers/offline-browser-server.ts). |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **154 casos, 152 correctos, 2 omitidos**, cero fallos. |
| PostgreSQL real | Suite de idempotencia/concurrencia/rollback preparada; omitida junto con la de suscripciones por falta de `AFP_TEST_DATABASE_URL`. Requiere base local `afp_test…` y migraciones aplicadas. |
| Build / lint | Build correcto con Google Fonts accesible. Lint: cero errores, una advertencia previa de `useReactTable`. |

**Pendiente vigente:** aceptación del formulario autenticado, desconexión y reconexión. La integración A02 con PostgreSQL pasó posteriormente en A06 y la corrección ya consta en la publicación del 21/10; la migración se aplicó en A11. A12 conserva su alcance pendiente.


---

<a id="A03"></a>

### A03 · P1 · Los cortes se dan por pagados sin comprobar el importe

**Estado al 29/10: CUBIERTA; publicación histórica documentada y regresiones actuales correctas.** El flujo compartido de pagos/devoluciones añadió después pruebas reales de PostgreSQL, concurrencia y rollback, documentadas en el [README](../../README.md#tarjetas--devoluciones-posteriores-al-corte) y su [verificación](../devoluciones-2026-10-17/verificacion.json). Sigue pendiente la aceptación autenticada del formulario. Ya existen abonos individuales en Captura y Mi dinero (`CardCyclePayment` y `MoneyCardPayment`); no deben figurar como un modelo futuro ausente. La descripción siguiente conserva el hallazgo original.

**Ubicación:** `src/app/api/card-cycles/route.js:104,420,452` y `src/app/api/dashboard/route.js:177`.

Un abono de $1 para un estado de cuenta de $1,000 es aceptado y marca `PAID`. La presentación considera pagado cualquier corte con `paidAt` o `paidAmount`, lo que puede retirar avisos de pago sin liquidar el importe. El formulario de marcar pagado permite capturar libremente ese importe.

También hay un problema con cero: `statementAmount: 0` numérico se rechaza, aunque `"0"` se acepta; y el cierre con pago cero se rechaza. Un corte sin importe exigible puede terminar como vencido. El README ya reconoce cero como un estado de cuenta válido.

**Corrección:** diferenciar pendiente, pago parcial, liquidado y sin importe por pagar. Exigir coherencia con el estado de cuenta o advertir y documentar una excepción explícita. Como evolución, registrar abonos individuales por ciclo. Conservar que el resumen mensual actual representa el total del período, conforme al README.

**Aceptación:** $1 de $1,000 conserva $999 pendientes y sus avisos; cero se puede cerrar sin inventar un gasto o pago; editar el estado de cuenta recalcula la situación.


<a id="A03-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **Saldo y estado compartidos:** [`cardCyclePayments.ts`](../../src/lib/calculations/cardCyclePayments.ts) compara estado de cuenta y total pagado a centavos. Diferencia pendiente, parcial, liquidado, sin importe por pagar y sin estado confirmado. Las lecturas corrigen la presentación de `PAID` históricos incoherentes sin alterar los registros.
- **Avisos y Dashboard:** $1 de $1,000 conserva $999 pendientes y el aviso. Se ignora el `PAID` persistido como criterio de exclusión; cero confirmado no genera vencimiento. Los resúmenes mensuales/Q15/Q30 mantienen el total del período y las filas muestran el saldo parcial aparte.
- **Ediciones coherentes:** guardar estado, pago, fechas o deshacer recalcula la situación dentro de una transacción con bloqueo de la fila por propietario. Un importe mayor reabre un corte antes liquidado. Cero numérico/texto se acepta sin inventar un pago; no hay excepciones que permitan liquidar por debajo del estado.
- **Formulario:** captura el total acumulado y la fecha del último pago, conserva datos al reabrir, muestra saldo/excedente y exige estado de cuenta previo. Los errores mantienen abierta la captura; el guardado bloquea envíos duplicados. El total sustituye el anterior; no crea un historial de abonos.
- **Sin migración:** conserva el enum y los campos existentes. El historial individual `CardCyclePayment` queda como evolución separada; A04 conserva su alcance de calendario. [Contrato y operación en README](../../README.md#tarjetas--saldo-y-liquidación-de-cortes-a03).

| Verificación | Resultado |
| --- | --- |
| Nuevas regresiones | 9 casos en [`card-cycle-payments.test.ts`](../../tests/card-cycle-payments.test.ts): parcial, centavos, exceso, cero, edición, deshacer, reintento, validación, rollback simulado y lecturas de ambas API con avisos. |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **163 casos, 161 correctos, 2 omitidos**, cero fallos. |
| Navegador | Chromium a 390×844 y 1440×900, formulario real con [fixture de datos/guardado simulados](a03-ui-fixture.jsx): parcial de $1, reapertura con total conservado, error visible sin cerrar, cero sin fecha de pago y bloqueo sin estado. Sin errores de navegador. [Móvil](a03-pago-parcial-mobile.png) · [Escritorio](a03-cero-desktop.png). |
| Build / lint | Build de producción correcto con Google Fonts accesible. Lint sin errores; conserva la advertencia previa de `useReactTable`. |
| Persistencia | Autenticación y Prisma simulados; transacción y bloqueo por propietario comprobados en el contrato. Las suites PostgreSQL existentes se omiten sin `AFP_TEST_DATABASE_URL`. No se comprobó concurrencia contra una BD real. |

**Pendiente vigente:** aceptación del formulario con sesión real. El despliegue y la integración PostgreSQL del flujo de pagos/devoluciones se completaron posteriormente; no deben repetirse como tareas de implementación pendientes. El cierre original de A03 no modificó Supabase ni publicó la app. A04 conserva un pendiente de zona horaria. Los abonos individuales se incorporaron posteriormente en Captura y Mi dinero; el formulario manual continúa sustituyendo el acumulado.

---

<a id="A04"></a>

### A04 · P2 · Vencimientos: comparación por día corregida, zona horaria aún implícita

**Estado al 29/10: PARCIAL.** Ya no se compara `today > new Date(cycle.dueDate)`. [`getCyclePaymentState`](../../src/lib/calculations/cardCyclePayments.ts) compara el día bancario UTC almacenado con `getFullYear/getMonth/getDate` del día actual. Las [pruebas vigentes](../../tests/card-cycle-payments.test.ts) cubren todo el día de vencimiento, medianoche, cambio de mes/año y `clientDate` del Dashboard.

**Lo corregido:** a `2026-10-15T12:01Z` el vencimiento del 15 ya no aparece como vencido. La reproducción antigua de las 06:01 quedó superada.

**Lo que persiste:** el día actual depende de la zona del proceso. Con el mismo vencimiento y el instante `2026-10-16T00:01Z` —18:01 del día 15 en México—, la función devuelve `OVERDUE` bajo `TZ=UTC` y `PAYMENT_PENDING` bajo `TZ=America/Mexico_City`. [`/api/card-cycles`](../../src/app/api/card-cycles/route.ts) llama a la función sin fecha de cliente; Dashboard puede fijarla mediante `clientDate`. La reproducción confirma dependencia del entorno, no la zona configurada hoy en producción. [Resultado](revision-2026-10-29/reproductions.json).

**Pendiente:** usar una política explícita y compartida de día en `America/Mexico_City` para API, estado persistido y presentación; ya existe `todayInMexico` en [Mi dinero](../../src/lib/money/dates.ts). Verificar un mismo instante en procesos UTC/México, incluidos cambio de día y año. No basta con construir fechas locales en las pruebas.

---

<a id="A05"></a>

### A05 · P1 · Estado de deuda desactualizado al editar

**Estado al 29/10: CUBIERTA; publicación histórica documentada y regresiones actuales correctas.** Hay pruebas con PostgreSQL real desechable de concurrencia y rollback. Resta aceptación autenticada de los flujos de cuentas. La descripción siguiente conserva el hallazgo original.

**Ubicación:** `src/app/api/expenses/route.js:443–475`; `payables/route.js:187`; `receivables/route.js:240`.

Al crear o borrar un abono se recalcula la cuenta por pagar, pero al editarlo no. Cambiar de $100 a $50 el abono que había liquidado una deuda puede dejarla marcada como liquidada. Cambiar el principal de $100 a $200 conserva `PAID_OFF` con $100 pendientes. Los listados filtran activas/liquidadas por ese estado, así que la deuda puede quedar en el grupo equivocado.

**Corrección:** centralizar el cálculo de saldo y estado; ejecutarlo en la misma transacción al crear, editar o borrar abonos y al modificar el principal, tanto en cobrar como en pagar. Respetar cancelaciones y definir el tratamiento de saldos a favor. Probar también centavos y abonos concurrentes.

<a id="A05-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **Cálculo único:** [`debtAccounts.ts`](../../src/lib/calculations/debtAccounts.ts) usa Decimal y redondea individualmente el principal y cada abono a centavos. Gastos, Ingresos, cuentas, bootstrap de Gastos y Dashboard comparten saldo/estado. Los listados derivan la clasificación histórica sin escribir al consultar; modificar un abono o principal corrige el estado persistido.
- **Mutaciones atómicas:** [`debtAccountService.ts`](../../src/lib/debtAccountService.ts) coordina las altas, ediciones y eliminaciones de abonos y la edición del principal en `ReadCommitted`, con bloqueo asesor por usuario antes de leer. Cubre operaciones simultáneas y traslados de ingresos entre cuentas. Conserva el recibo idempotente del POST de gastos y la relación existente al editar gastos. Un fallo del estado revierte el movimiento/principal.
- **Cancelaciones y excedentes:** `CANCELLED` permanece cancelada. Saldo cero o negativo liquida las demás cuentas; el excedente se conserva como `pendingBalance` negativo y `excessAmount` positivo, sin compensaciones ni devoluciones automáticas. Reducir el abono o aumentar el principal reabre la cuenta cuando vuelve a existir saldo.
- **Alcance:** sin migración ni cambios visuales. No modifica datos de Supabase ni despliega. A06 se completó posteriormente para los demás flujos relacionados, especialmente compras a meses; A11 resuelve posteriormente el historial de migraciones, como se documenta en su cierre.

| Comprobación | Resultado |
| --- | --- |
| Regresiones A05 | [10 pruebas](../../tests/debt-accounts.test.ts): $100 → $50 en abono, $100 → $200 en principal, pago excedente, cancelaciones, centavos, datos históricos con más decimales, traslado/desvinculación de ingresos, concurrencia simulada y rollback de las cuatro mutaciones. |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **175 casos, 171 correctos, 4 omitidos**, cero fallos. Las omisiones corresponden a integración sin variable de BD. [Log](a05-pruebas.log). |
| PostgreSQL real | [2 pruebas de integración A05](../../tests/debt-accounts-integration.test.ts) correctas, sin omisiones: diez altas y diez ediciones concurrentes por tipo de cuenta, edición de principal concurrente, cancelación, rollback real de alta/edición/borrado/principal y lecturas de cuentas, Gastos y Dashboard. [Log](a05-postgres.log). |
| Entorno de integración | PostgreSQL 16 en contenedor desechable, base local `afp_test_a05`, datos ficticios eliminados al finalizar. Esquema generado desde `schema.prisma` con `prisma migrate diff --from-empty`; no prueba las migraciones de A11. Auth simulada; Prisma y SQL reales. El driver emitió una advertencia de deprecación de consultas concurrentes de `pg`; no hubo fallos. |
| Build / lint | Build de producción correcto con Google Fonts accesible. Lint: cero errores y la advertencia previa de `useReactTable`. [Build](a05-build.log) · [Lint](a05-lint.log). |

**Cierre actualizado:** corrección implementada, verificada y publicada; resta la aceptación autenticada. Para repetir la integración, configurar `AFP_TEST_DATABASE_URL` con una base local desechable cuyo nombre empiece por `afp_test`, con las migraciones actuales aplicadas, y ejecutar `pnpm test debt-accounts-integration.test.ts`. La ejecución original del 17/10 no publicó la app.

---

<a id="A06"></a>

### A06 · P1 · Operaciones relacionadas sin transacción

**Estado al 29/10: CUBIERTA; publicación histórica documentada y regresiones actuales correctas.** Hay pruebas con PostgreSQL real desechable de atomicidad y rollback. Resta aceptación autenticada entre módulos. El texto siguiente conserva el hallazgo original.

**Ubicación:** `src/app/api/expenses/route.js:296`, `installment-purchases/route.js:222`, y creación/actualización de ingresos vinculados.

La cuenta por cobrar se crea antes del gasto o de la compra MSI. Si falla la segunda escritura, queda una cuenta huérfana; reintentar puede crear otra. La reproducción fuerza el fallo del gasto y conserva una cuenta creada. Otros flujos guardan el movimiento y después actualizan el estado, pudiendo devolver 500 cuando ya se persistió una parte.

**Corrección:** transacciones que abarquen el movimiento, sus relaciones y el saldo; validar relaciones antes de escribir y combinar con idempotencia. El servicio reciente de cobros de suscripciones ya ofrece un patrón aprovechable. Aceptación: fallo de cualquier paso revierte todos los cambios.


<a id="A06-seguimiento"></a>

#### Actividad concluida · implementación local · 17 de octubre de 2026

- **MSI atómico:** [`installment-purchases/route.ts`](../../src/app/api/installment-purchases/route.ts) usa `runDebtAccountOperation` para guardar cuenta por cobrar, compra y referencia de origen en una sola transacción `ReadCommitted`. Una excepción después de cualquiera de las escrituras revierte el conjunto. La compra sin persona conserva el alta normal sin cuenta adicional.
- **Validación de relaciones:** alta/edición de MSI y edición de gastos comprueban la pertenencia de las referencias dentro de la transacción, antes de escribir y después del bloqueo por usuario. Se conserva la validación del cuerpo y la autorización por Bearer de A01.
- **Gastos e ingresos:** se verificó la cobertura ya implementada en A02/A05. Gastos incluye recibo idempotente, cuenta opcional, gasto, decisión de suscripción y saldo por pagar; ingresos incluye movimiento y ambas cuentas al trasladar un abono. El fallo de la segunda actualización de saldo revierte también la primera.
- **Idempotencia y límites:** Gastos conserva el UUID y la respuesta durable; los reintentos concurrentes no duplican registros y el contenido distinto devuelve 409. MSI e Ingresos conservan su contrato sin recibo idempotente: el reintento después de rollback es seguro, pero no se afirma deduplicación si se pierde la respuesta después del commit. No cambia el tratamiento de cuentas independientes al editar/borrar una compra ni se reparan huérfanos históricos.
- **Alcance:** sin migración, cambios visuales ni escrituras en Supabase. Se reutiliza el servicio transaccional de A05. El historial de migraciones se verificó posteriormente en el cierre A11.

| Comprobación | Resultado |
| --- | --- |
| Regresiones MSI | [3 pruebas nuevas](../../tests/installment-transactions.test.ts): fallos tras las tres escrituras, reintento, relaciones ajenas, usuario falsificado, compra sin cuenta y edición con rollback. |
| Suite completa | `node --test --experimental-test-isolation=none tests/*.test.cjs`: **179 casos, 174 correctos, 5 omitidos sin variable de BD**, cero fallos. [Log](a06-pruebas.log). |
| PostgreSQL real | **5 integraciones correctas, cero omisiones**: A02, A05, A06 y suscripciones. La [nueva prueba A06](../../tests/related-operations-integration.test.ts) inyecta **24 fallos después de escrituras reales**, verifica rollback exacto de siete tablas y reintenta cada operación. Incluye MSI, gasto con cuenta/saldo/recibo, cobro de suscripción, alta/traslado/borrado de ingreso y cinco reintentos concurrentes del gasto. [Log](a06-postgres.log). |
| Pruebas anteriores reparadas | La integración de A02 omitía `originType` al preparar una cuenta. La de suscripciones cargaba Gastos sin sus dependencias transaccionales actuales; ahora utiliza el cargador compartido con las dependencias reales. Se corrigieron las pruebas y se repitieron exitosamente. |
| Entorno | PostgreSQL 16 en contenedor desechable y base local `afp_test_a06`, esquema desde `schema.prisma` mediante `migrate diff --from-empty`, datos ficticios eliminados al finalizar. No valida las migraciones de A11. Auth simulada; Prisma y SQL reales. Advertencia previa del driver `pg` sobre consultas concurrentes, sin fallos. |
| Build / lint | Compilación de producción correcta con acceso a Google Fonts; lint sin errores, conserva la advertencia previa de `useReactTable`. [Build](a06-build.log) · [Lint](a06-lint.log). |

**Cierre actualizado:** corrección implementada, verificada y publicada; resta la aceptación autenticada entre módulos. Para repetir las integraciones, configurar `AFP_TEST_DATABASE_URL` con una base local desechable `afp_test…`, con las migraciones actuales aplicadas, y ejecutar `pnpm test` (suite completa) o `pnpm test related-operations-integration.test.ts` (A06). La idempotencia adicional de MSI/Ingresos sigue siendo una mejora distinta de la atomicidad ya cubierta.

---

<a id="A07"></a>

### A07 · P2 · Ingresos desaparecen del historial al superar 100

**Estado al 29/10: PENDIENTE, reproducido nuevamente.** [`GET /api/incomes`](../../src/app/api/incomes/route.ts) conserva `take: 100`, orden descendente y una suma sobre las filas devueltas. No admite página/cursor ni devuelve conteo o total global.

**Reproducción actual:** 101 ingresos ficticios de $10 devuelven 100 registros y $1,000; el total real es $1,010. El handler es real y el doble de `findMany` respeta `take`. Los registros no se borran; el cliente no puede recuperar la fila restante. [Resultado](revision-2026-10-29/reproductions.json).

**Corrección pendiente:** filtros/paginación de servidor, `totalCount` y suma del conjunto filtrado independientes de la página. Aceptación: acceder al ingreso 101 y conservar el total al cambiar de página.

---

<a id="A08"></a>

### A08 · P2 · Validación semántica incompleta de fechas, importes y texto

**Estado al 29/10: PENDIENTE; la descripción técnica anterior estaba desactualizada.** La migración a TypeScript incorporó [`financialContracts.ts`](../../src/lib/financialContracts.ts) con Zod; se validan formas y tipos, pero las rutas conservan sus validaciones de negocio anteriores. Ya no existen los módulos vacíos `validations.js`, `money.js` ni `dates.js`. TypeScript no reemplaza la validación del JSON recibido.

**Evidencia actual:** [`expenseService.ts`](../../src/lib/expenseService.ts), [`incomes/route.ts`](../../src/app/api/incomes/route.ts), [`payables/route.ts`](../../src/app/api/payables/route.ts) y [`receivables/route.ts`](../../src/app/api/receivables/route.ts) construyen fechas con `Date` sin cotejar siempre el día original. Gastos sin aportación e Ingresos comprueban importe positivo/finito, sin exigir dos decimales; validan texto obligatorio antes del `trim`.

**Reproducción actual:** ambos POST de Gastos e Ingresos devuelven 200 con fecha `2026-02-30`, importe `10.123` y concepto `"   "`; entregan a persistencia `2026-03-02`, `10.123` y concepto vacío. La persistencia es ficticia: no se afirma que PostgreSQL almacene tres decimales en una columna `Decimal(12,2)`. El problema es aceptar/normalizar silenciosamente la entrada. [Resultado](revision-2026-10-29/reproductions.json).

**Corrección pendiente:** reutilizar validadores semánticos comunes para fechas reales, límites monetarios, dos decimales y texto no vacío tras `trim`. Captura, suscripciones y [Mi dinero](../../src/lib/money/schema.ts) ya aportan validaciones más estrictas. Aplicarlas en todas las entradas manuales con mensajes y pruebas equivalentes.

---

<a id="A09"></a>

### A09 · P2 · Un filtro puede mostrar resultados de otro

**Estado al 29/10: PENDIENTE, reproducido nuevamente.** [`loadExpenses`](../../src/components/gastos/GastosContent.tsx) sigue aplicando datos y estado de carga de cualquier respuesta. No envía `signal` ni verifica generación. El debounce de 250 ms no cancela consultas ya iniciadas.

**Reproducción actual:** se extrae la función real del componente TSX y se transforma con esbuild. A se solicita antes de B; B responde primero y A después. El filtro visible sigue en B, pero las filas terminan siendo A. Además, la primera respuesta apaga el indicador aunque la otra petición siga pendiente. HTTP y setters están simulados; no es una nueva ejecución de navegador. [Resultado](revision-2026-10-29/reproductions.json).

**Corrección pendiente:** AbortController y control de generación para datos, errores y `finally`. [`latestRequest.ts`](../../src/lib/latestRequest.ts) y Dashboard ya contienen mecanismos para otras lecturas; su existencia no corrige automáticamente Gastos. La aceptación debe alternar filtros y resolver respuestas/errores en orden inverso.

---

<a id="A10"></a>

### A10 · P1 · Dependencias con avisos de seguridad pendientes

**Estado al 29/10: PARCIAL.** La actualización anterior permanece en el código, pero «cero avisos de producción y solo `braces` pendiente» dejó de representar la última evidencia. El [análisis completo del 27/10](../mi-dinero/presupuesto-diario/dependency-audit.json) registró **7 avisos de producción: 2 críticos, 1 alto, 2 moderados y 2 bajos**; **8 en el árbol completo**, con un alto adicional de desarrollo. Señala tres avisos de Next, cuatro de `fast-uri` y uno de `body-parser` en desarrollo. El lockfile actual conserva `next@16.3.8`, `fast-uri@3.1.8` y `body-parser@2.3.0`.

**Límite de actualización:** los dos `pnpm audit` del 29/10 fallaron por DNS y después timeout del registro, incluso fuera del sandbox. No hay resultado nuevo completo ni se acredita explotabilidad en AFP. Los rangos/parches del archivo del 27/10 son históricos y requieren una nueva consulta antes de elegir la actualización. No se suprime un aviso ni se cambia el lockfile en esta revisión.

**Build pendiente resuelto:** `pnpm build` predeterminado pasó ahora con **Turbopack**, incluyendo TypeScript. Ya no debe pedirse como aceptación pendiente de A10. [Log actual](revision-2026-10-29/build.log). El texto siguiente conserva los avisos y la actualización originales del 15–17/10.

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

**Aviso residual en la auditoría histórica del 17/10:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), agotamiento de pila con patrones de llaves profundamente anidados en `braces@3.0.3`. El registro devuelve esa versión como última y no publica una versión corregida. `pnpm why braces` lo sitúa bajo `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch`, y también bajo shadcn/ts-morph; todas son herramientas de desarrollo. La auditoría JSON enumera una cadena representativa. No se encontró uso desde la aplicación y `pnpm why braces --prod` no devuelve dependientes. Se limita su uso a patrones/configuración de confianza en las herramientas locales. No se suprime el GHSA ni se fuerza una sustitución incompatible. **Seguimiento indicado entonces:** revisar el aviso en la próxima actualización de dependencias y antes de publicar; instalar un parche compatible cuando exista. El inventario posterior cambió y se resume al inicio de A10. El cierre de la actualización no significa que el árbol de desarrollo esté libre de avisos.

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

**Cierre al 29/10:** A10 sigue **parcial por dependencias**, con avisos de producción en el último análisis completo disponible. El build predeterminado está comprobado y deja de ser un pendiente. La publicación de la actualización del 17/10 tiene evidencia histórica; la operación original no desplegó. El recorrido autenticado conserva su pendiente transversal.

---

<a id="A11"></a>

### A11 · P1 · La BD no se reproduce completamente desde Git

**Estado al 29/10: CUBIERTA, reconstrucción repetida.** SQL histórico recuperado con checksum idéntico y RLS versionado. `pnpm db:verify` comprobó ahora **42 migraciones y 45 tablas con RLS**, catálogo equivalente, checksums, actualización con registros conservados y diff vacío en PostgreSQL local. La [aplicación remota documentada el 27/10](../bbva-debit-automation/production.json) registra esos mismos conteos; no se reconsultó producción. Los números 13/15/17 del seguimiento siguiente son históricos.

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

**Estado al 29/10: PENDIENTE, confirmado en código.** A01 retiró las API del service worker y A02 aisló la cola por propietario; el logout aún no implementa limpieza de caché financiera ni gestión de pendientes.

**Ubicación actual:** [service worker](../../public/sw.js), [cola offline](../../src/lib/offlineExpenses.ts), [bootstrap de Gastos](../../src/components/gastos/GastosContent.tsx) y [logout](../../src/components/layout/AppSidebar.tsx).

El bootstrap de Gastos sigue en localStorage por usuario; IndexedDB conserva pendientes y localStorage puede conservar su respaldo legado. `handleLogout` solo ejecuta `supabase.auth.signOut()` y navega al login, sin aplicar una política de limpieza/recuperación. El service worker actual **ya no almacena respuestas API**; la descripción original de esas respuestas en CacheStorage quedó superada por A01. No se ha demostrado una fuga automática entre cuentas, pero permanecen datos financieros locales en un equipo compartido. La autorización nativa Android es independiente y no se revoca al cerrar la sesión web; la política debe explicarlo.

**Corrección:** política de dispositivo confiable, caché aislada por usuario y limpieza de datos sincronizados al salir. Advertir y permitir exportar/sincronizar pendientes antes de borrarlos; conservar recuperabilidad. El cifrado con una clave almacenada junto a los datos no resolvería por sí solo este problema.

---

<a id="A13"></a>

### A13 · P2 · Consultas y cálculos crecen con todo el historial

**Estado al 29/10: PENDIENTE, confirmado en código.** Dashboard y Ciclos leen todos los gastos/ciclos del propietario, y Gastos vuelve a leer todas las fechas para los meses disponibles. Compartir peticiones evita duplicarlas, pero no acota el volumen.

**Ubicación actual:** [Dashboard](../../src/app/api/dashboard/route.ts), [Gastos](../../src/app/api/expenses/route.ts), [Ciclos](../../src/app/api/card-cycles/route.ts) y [DashboardProvider](../../src/components/dashboard/DashboardProvider.tsx).

Dashboard carga todos los gastos/ciclos/MSI/suscripciones y reconstruye comparativos. Gastos vuelve a leer todas las fechas del usuario para calcular los meses disponibles en cada consulta. En móvil, DashboardProvider también consulta el dashboard desde otras secciones para la cabecera. Esto es crecimiento comprobable en código; no se midió lentitud actual en producción.

**Corrección:** separar resumen de cabecera de análisis completo, acotar ventanas temporales sin perder referencias históricas, paginar y agregar en SQL. Medir cantidad de consultas, bytes, p95 y memoria con volúmenes sintéticos. Conservar el bootstrap agrupado y el desglose bajo demanda que ya existen.

---

<a id="A14"></a>

### A14 · P2 · El login móvil tiene controles táctiles pequeños

**Estado al 29/10: PENDIENTE, confirmado en código.** [Login](../../src/app/login/page.tsx) usa los tamaños base `h-7` de [Input](../../src/components/ui/input.tsx) y [Button](../../src/components/ui/button.tsx); cambiar de modo conserva `h-auto p-0`. La recuperación de errores no cambia esas áreas táctiles.

**Evidencia de navegador del 15/10:** a 390 px, ambos inputs y Entrar miden 28 px de alto; Crear cuenta mide 22 px. [Captura histórica](login-mobile.png). Ubicación: `src/app/login/page.js` y componentes base Input/Button. No se repitió la medición en navegador en esta revisión.

**Impacto:** tocar y completar el acceso resulta menos cómodo que los controles móviles de 44–48 px ya usados en otras partes. **Corrección:** áreas táctiles de al menos 44 px y campos más legibles en el login; verificar teclado, autocompletado y zoom. Los 44 px son aquí un objetivo ergonómico; no se declara una infracción WCAG AA solo por medir menos de 44 px.

---

<a id="mejoras"></a>

## Arquitectura, calidad e interfaz

**Conservar:** reglas compartidas, importes a centavos, referencias bancarias explícitas, transacciones, recibos idempotentes, componentes locales, borradores y recuperación de errores. Web y pruebas ya usan TypeScript estricto; esa migración está completada localmente y no es un pendiente de esta auditoría.

| Mejora | Estado al 29/10 | Ya realizado | Qué falta |
| --- | --- | --- | --- |
| Servicios por operación | **PARCIAL** | Servicios de gastos, deudas, suscripciones, captura, Calendar y Mi dinero. Dashboard API bajó a 796 líneas; Gastos tiene 1,953. | Separar consultas/contratos donde ayude a A08/A09/A13, sin duplicar reglas. La longitud por sí sola no demuestra un defecto. |
| Política monetaria y fechas | **PARCIAL** | Decimal, centavos y módulos reales `src/lib/money/`, con validación y zona México. | Extender validaciones a las rutas manuales y unificar vencimientos: A04/A08 siguen abiertos. Ya no corresponde hablar de `money.js`/`dates.js` vacíos. |
| Pruebas y contratos | **PARCIAL** | 871 escenarios con PostgreSQL, contratos negativos, cola, concurrencia, rollback y límites de día. Migraciones web/pruebas a TS cerradas. | Auth real con dos usuarios, zona compartida A04 y carrera A09. Los mocks no prueban el proveedor real. |
| Comandos reproducibles y CI | **PARCIAL** | pnpm fijado, lockfile, ejecutor TS, tipos, build predeterminado y reconstrucción de BD correctos. | No hay pipeline `.github/` versionado; verificar separación de entornos remotos. README ya indica variables por entorno y BD local desechable. |
| Recuperación y observabilidad | **PARCIAL** | Diálogo de recuperación, reintentos seguros y estados de sincronización visibles. | RequestId/logs estructurados comunes, métricas y límites de errores por módulo; no hay `error.tsx`/`global-error.tsx` en `src/app`. |
| Documentación y capas compartidas | **IMPLEMENTADA la limpieza anterior** | README actualizado, bitácora separada, módulos vacíos retirados, contratos Zod y código/pruebas TS. | Mantener documentos de fases como antecedentes fechados y cotejarlos con evidencia posterior; no presentar conteos antiguos como actuales. |
| Recuperar/cambiar contraseña | **PENDIENTE** | Login, registro y recuperación de fallos de conexión. | No se encontró flujo `resetPasswordForEmail`/`PASSWORD_RECOVERY`/cambio de contraseña; definir también el registro abierto para una app personal. |

### Evaluación de interfaz histórica · 15 de octubre — skill impeccable

La puntuación **13/20** se conserva únicamente como evaluación provisional original: accesibilidad 3/4, rendimiento 2/4, responsive 2/4, tokens/tema 3/4 y consistencia 3/4. Se basó en código y login. **No se reaplicó la skill ni se volvió a puntuar la interfaz** en esta revisión documental; no es una certificación de accesibilidad o rendimiento actuales. Existen aceptaciones posteriores de flujos concretos con Auth ficticio. Las siguientes verificaciones útiles son login A14, carrera A09 y recorrido autenticado con teclado.

<a id="features"></a>

## Funciones propuestas: estado actualizado

Estas funciones no son requisitos adicionales para cerrar A01–A14. Se distingue implementación comprobada en código/evidencias de aceptación completa con servicios reales.

| Función | Estado al 29/10 | Qué existe y qué falta |
| --- | --- | --- |
| **Conciliación dentro de la app** | **PARCIAL** | Cotejo por tarjeta/período, diferencias, evidencia y faltantes idempotentes implementados. Sigue pendiente importación general CSV/JSON/PDF con previsualización y repetición sin duplicados. |
| **Calendario financiero, reserva y proyección** | **IMPLEMENTADA la base** | [Mi dinero](../../src/lib/money/forecast.ts) modela cuentas/saldos, conciliaciones, transferencias, retiros, rendimientos, presupuestos, nómina y previsión de doce meses. [Google Calendar](../../src/lib/calendar/events.ts) integra fechas financieras. Mejoras adicionales de visualización/reserva requieren alcance propio; ya no falta modelar cuentas ni saldos. |
| **Historial de abonos de tarjetas** | **IMPLEMENTADO para abonos identificados** | `CardCyclePayment` conserva pagos de Captura y `MoneyCardPayment` los de Mi dinero, con reversión y garantías transaccionales. La captura manual de Tarjetas sustituye el acumulado; no reconstruye retroactivamente el desglose de pagos históricos. [Reglas en README](../../README.md#tarjetas-pagos-y-devoluciones). |
| **Presupuestos por categoría** | **IMPLEMENTADA la base** | Planes variables por categoría, consumo diario, vigencia y mezcla efectivo/débito/crédito con [pruebas](../../tests/money-budgets.test.ts) e [integraciones](../../tests/money-budgets-integration.test.ts); [publicación documentada](../mi-dinero/presupuesto-diario/production.json). Umbrales adicionales y su correspondencia con Análisis pueden definirse aparte. |
| **Historial general, papelera y exportación** | **PENDIENTE** | Recibos/evidencias, reversión de operaciones y `ExpenseTombstone` no constituyen historial general, papelera restaurable ni exportación integral. |
| **Alertas externas** | **PARCIAL** | Google Calendar ya tiene OAuth, calendario propio y sincronización. Android ya implementa avisos importantes mediante consulta nativa; la [publicación del 26/10](../android-important-notices/production.json) dejó pendientes permiso, activación y entrega real. Exportación ICS y Web Push no se encontraron; no confundirlos con estas funciones existentes. |
| **Tarifas y pausas de suscripciones** | **PARCIAL** | Activación/desactivación, cobros por mes, ajustes y referencias históricas existentes. Falta historial de tarifas con vigencia y períodos de pausa explícitos. |

Ya existen saldos iniciales, cuentas de efectivo/banco, transferencias y conciliaciones; se retira la afirmación anterior de que «hoy no están modelados». La disponibilidad sigue dependiendo de referencias y movimientos registrados, sin conexión directa con bancos. Una previsión no equivale a un ingreso real ni debe duplicar compra a crédito y pago de tarjeta como salida de efectivo.

<a id="orden"></a>

## Estado de las cinco etapas recomendadas

Estas etapas agrupan la auditoría; **no son las fases del plan Android**.

| Etapa | Estado global | Cubierto | Falta |
| --- | --- | --- | --- |
| **1 · Seguridad** | **PARCIAL** | A01, A11 y build predeterminado comprobados; publicación histórica de las correcciones. | A10: actualizar diagnóstico y resolver avisos de dependencias, incluidos críticos en el último registro completo. Aceptación con dos sesiones Supabase reales. |
| **2 · Integridad de registros** | **Correcciones CUBIERTAS; aceptación PARCIAL** | A02, A05 y A06, con transacciones, concurrencia, rollback y regresiones PostgreSQL actuales. | Recorrido autenticado offline/reintentos/ediciones entre módulos. |
| **3 · Exactitud visible** | **PARCIAL** | A03, parciales/cero/devoluciones/abonos; parte de A04 corregida. | **A04, A07, A08 y A09**: zona horaria, historial completo, validación y filtros. |
| **4 · Operación diaria** | **PARCIAL** | Cola durable, recuperación de errores, TS estricto y flujo de verificación reproducible. | **A12, A13 y A14**, recuperación de contraseña, CI y observabilidad común. |
| **5 · Producto** | **PARCIAL** | Mi dinero, presupuestos, Calendar, abonos individuales, cotejo y formatos bancarios publicados. | Importación general, funciones opcionales restantes y cobertura real de las fases Android abiertas. |

### Próximo trabajo concreto

1. **A10:** repetir auditorías con acceso al registro y atender los avisos del último análisis completo; el build predeterminado ya está aceptado. No reutilizar como diagnóstico vigente el cero de producción del 21/10.
2. **A04 y A08:** unificar día México independiente de `TZ`; rechazar fecha imposible, más de dos decimales y texto vacío tras `trim` en todas las entradas manuales.
3. **A07 y A09:** acceder al ingreso 101 con conteo/suma global y descartar respuestas/errores antiguos al alternar filtros.
4. **A12, A13 y A14:** política de salida con pendientes recuperables, consultas acotadas con medición sintética y controles táctiles del login. Después, contraseña, CI y observabilidad.
5. **Aceptación transversal y Android:** dos usuarios Supabase reales en entorno aislado; cobertura bancaria con pantalla bloqueada, recepción HSBC y conciliación de un corte completo. La ampliación original de Fase 7 y las funciones ya publicadas no vuelven a ser tareas de implementación.

Actualizar cada estado únicamente con evidencia de su alcance. Las pruebas locales, una publicación histórica y una aceptación real son comprobaciones distintas.
