# Ingresos BBVA y nómina estimada — 31 de octubre de 2026

Implementación publicada y regla personal activada el 31 de octubre de 2026, tras autorización expresa del propietario. No se registraron ingresos históricos. La regla personal preparada a partir de comprobantes permanece en `estados_cuenta/_soporte/respaldos-y-revisiones/capture-income-2026-10-31/`, excluida de Git y con permisos privados.

## Comportamiento

- El aviso real anonimizado de nómina conserva cuenta, fecha y quincena, sin inventar importe bancario. Sin regla queda pendiente.
- Una regla aceptada por cuenta, tipo de ingreso y terminación permite importes netos estimados diferentes por quincena. Un nuevo aviso crea un ingreso estimado y su ruta a la cuenta, dentro de la transacción de captura.
- Mi dinero suma la estimación e indica su contribución al saldo. Se actualiza al recuperar foco/conexión y cada 15 segundos mientras está visible. Ingresos identifica los registros estimados.
- Confirmar el importe real modifica el mismo ingreso; editarlo desde Ingresos también confirma el importe. El recibo conserva la estimación inicial y su origen.
- Los depósitos completos exigen una muestra propia registrada antes de automatizar ese formato/cuenta. El candidato de depósito no se declara una gramática real verificada por pruebas ficticias.
- Recibos idempotentes, bloqueo por propietario y comprobaciones de cuenta/referencia protegen las escrituras. Una nómina repetida del mismo período no se suma automáticamente, incluso tras confirmar otro importe o borrar el ingreso. Otra quincena puede reutilizar la clave de notificación del banco.
- Reinterpretar conserva el original y el historial y no registra movimientos. Los avisos ausentes no se reconstruyen a partir de sus importes.

## Persistencia y publicación

La migración aditiva `20261031010000_capture_income` incorpora `Income.isEstimated`, el vínculo de ingreso en `CaptureMoneyPosting` y `CaptureIncomePolicy`. Empieza con reglas vacías, habilita RLS en la tabla nueva y conserva los recibos si se elimina un ingreso. No requiere actualizar la APK 0.9.0.

Aplicar la migración antes de publicar el servidor compatible. Tras autorización de producción, reinterpretar expresamente la muestra histórica y aplicar la regla personal preparada. La configuración no registra automáticamente movimientos anteriores. Conservar los límites del formato y de la disponibilidad de notificaciones.

## Verificación

Las pruebas usan identidades, cuentas e importes ficticios, con PostgreSQL local desechable. Incluyen ambas quincenas, concurrencia, confirmación del importe sobre el mismo ingreso, reintentos, avisos repetidos, registros borrados, regla de depósitos, rollback de ingreso/ruta/recibo y autorización de API por propietario. Los casos negativos de formato incluyen compras, promociones, otro banco, rechazo, precisión inválida, fecha/hora imposibles y cuerpos contradictorios.

Los archivos `*.log` adjuntos registran tipos, contratos, lint, suite completa, compilación y reconstrucción/actualización de BD. La revisión mecánica de los componentes no reportó hallazgos. La revisión con agent-browser se detuvo por instrucción del propietario; no se tomaron capturas ni se completó una validación visual. La compilación y las pruebas de API/dominio no acreditan una revisión visual de la interfaz.

Resultados: suite completa **1065/1065**, sin fallos ni omisiones; los veinte escenarios nuevos de ingresos también pasan por separado. `typecheck`, `typecheck:tests`, `test:types`, `lint` y `build` correctos. `db:verify` reconstruye desde vacío y actualiza desde las trece migraciones históricas: **44 migraciones**, diff vacío, checksums conservados, ejecución repetible y **46 tablas con RLS**, incluido el historial de Prisma. Su ejecución interna de regresiones pasó los 1062 escenarios presentes al arrancar; la suite final separada incluye las últimas tres regresiones adicionales y completa los 1065.


## Publicación autorizada

Producción **READY** en `finanzas.garatachia.com`, despliegue `dpl_9mCyRA2CAXqZDt3EzrXVZwUKxvjL`. Se publicaron 419 archivos mediante la API de Vercel; el árbol remoto permitió cotejar los 419 por SHA-1 sin diferencias. Base Git `f472a5d2b90aaa68357d2273cbe209f9f0a77c99`, con los cambios locales probados incluidos; no se creó un commit ni se hizo push. Se excluyeron secretos, comprobantes, respaldos y artefactos del paquete publicado.

Antes de la migración se creó y validó un respaldo PostgreSQL privado y un snapshot consistente de las 45 tablas existentes. Tras aplicar la migración, se cotejaron 1434 registros anteriores en 38 tablas financieras/de configuración: sin cambios, normalizando únicamente las dos columnas aditivas. Los recibos de operaciones se compararon por fila completa, incluidos sus identificadores compuestos. Las tablas de captura y sincronización que pueden cambiar por actividad ordinaria se excluyeron de ese cotejo financiero. La auditoría conserva 44 migraciones activas, checksums correctos y cero pendientes; una fila histórica de migración revertida se conserva aparte.

Con la web publicada se reinterpretó expresamente la muestra de nómina y se activó la regla personal preparada. La comprobación de solo lectura con los servicios reales devuelve `INCOME_READY`, selecciona la estimación correspondiente y conserva la ausencia de importe bancario. El número de ingresos no cambió: configurar e interpretar no cargaron nóminas históricas. Las cantidades, identidad y muestra de la regla permanecen en el informe privado de activación.

HTTP sin sesión: login 200; configuración, movimientos de ingreso, Ingresos y Mi dinero 401 con `private, no-store`. La consulta inicial de logs del despliegue no reportó grupos de errores o fallos fatales; es una ventana breve. No se generó una notificación bancaria de prueba ni se observó una nómina nueva. Las verificaciones autenticadas de datos usaron los servicios de aplicación contra PostgreSQL; no se usó una sesión de navegador autenticada.

La auditoría actual mantiene cero avisos en dependencias de producción. Desarrollo conserva un aviso bajo de `deepmerge` (shadcn) y dos moderados de `minimatch` en rutas de ESLint; no se modificaron dependencias para esta funcionalidad. [Resumen de publicación](production.json), [auditoría de producción](audit-prod.log) y [auditoría completa](audit-all.log).
