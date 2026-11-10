# Compras con tarjeta de débito BBVA

Implementación publicada y recuperación puntual autorizada aplicada el 10 de noviembre de 2026. Las notificaciones, importes personales, identificadores, respaldos y recibos de ejecución permanecen privados y excluidos de Git.

## Cambio

La rama anterior de «Compra con TDD» solo admitía `MERPAGO*TARJETADE`, un descriptor revisado como evidencia de pago de tarjeta. Un aviso con otro comercio terminaba en `INCOMPLETE_FORMAT`, antes de llegar a la regla de gastos con débito.

`bbva.debit-purchase.es.v1` reconoce el formato observado de compra con terminación de cuatro cifras, comercio, importe con centavos y día/mes/hora bancaria. Conserva el comercio y usa la regla BBVA_DEBIT existente del propietario para determinar cuenta, terminaciones aceptadas y MXN. El gasto usa `paymentMethod: DEBIT` y `debitAccountId`; no depende de la ruta general de efectivo. No liquida automáticamente deudas ni tarjetas por coincidir en importe y fecha. La rama del descriptor de pago anterior conserva su semántica y sus verificaciones.

La fecha procede del banco. El año omitido solo se completa si existe una única fecha válida dentro de 36 horas de la publicación, incluido el cambio de año. Campos contradictorios, otras monedas, horas futuras, fechas inválidas, importes ambiguos, reglas pausadas, terminaciones ajenas y referencias posteriores conservan revisión. La evidencia bancaria compartida con el control de duplicados permite distinguir dos cargos del mismo importe con horas distintas y protege reintentos, modificaciones de avisos, gastos manuales y registros eliminados.

Los gastos de débito aplicados aparecen en Gastos de Registro automático; los avisos pendientes conservan su revisión de cuenta. No se añadieron controles visuales, migraciones, dependencias ni APK. Publicar no reinterpreta históricos ni activa nuevas reglas.

## Verificación

- [Suite completa](tests.log): **1161 pruebas correctas, cero fallos y omisiones**, con PostgreSQL local desechable. Doce escenarios nuevos cubren el reconocimiento y el efecto financiero.
- [Pruebas específicas](focused-tests.log): 68 correctas, incluidas las regresiones de cargos genéricos, pagos de tarjeta, transferencias y avisos receptores.
- [Tipos de aplicación](typecheck.log), [pruebas](typecheck-tests.log), [contratos](test-types.log) y [build](build.log) correctos.
- [ESLint](lint.log): sin errores; tres advertencias existentes en componentes sin cambios.
- [Auditoría de producción](audit-prod.log): sin vulnerabilidades conocidas. La [auditoría completa](audit-all.log) conserva un aviso moderado de minimatch y uno bajo de deepmerge en desarrollo; no se modificó el lockfile.

La suite completa final se ejecutó después de terminar todos los comandos que regeneran Prisma. Una ejecución anterior coincidió con esa regeneración y un subproceso no encontró temporalmente el cliente generado; no se modificaron pruebas ni código para ocultar ese fallo. El cierre completo posterior pasó sin omisiones.

## Producción y recuperación

Vercel `dpl_6eNJkbf64Qykck67D1YxTuNK3LBA`, proyecto afp, está READY en producción y asociado a `finanzas.garatachia.com`. Los 414 archivos remotos coinciden por SHA-1 con el manifiesto local. La base del workspace es `66b8fd478f014ff7da5c5c7fee1d65ac89af1056`; se incluyeron las modificaciones locales mediante API, sin commit ni push nuevos. [Despliegue](production-deployment.json) · [Cotejo](source-verification.json).

El respaldo PostgreSQL custom del esquema público se verificó como legible, con 46 entradas de datos de tablas. La auditoría del historial no encontró migraciones pendientes ni checksums distintos; no se aplicó una migración. El ensayo de recuperación se revirtió íntegramente y se confirmó por una conexión independiente antes de aplicar.

La recuperación puntual solicitada reinterpretó el aviso existente y registró un solo gasto de débito mediante los servicios de dominio, bajo el bloqueo financiero por propietario. Conservó el aviso original, su interpretación inicial y el resto de movimientos. El gasto incluye una nota visible de registro desde BD. La repetición de la resolución no creó otro gasto. La lectura independiente confirmó el descuento único, todas las demás filas financieras intactas y reglas de captura sin cambios. Calendar terminó sincronizado. En el teléfono conectado se confirmó el gasto con su comercio, importe, fecha y cuenta de débito, y se cotejaron los saldos bancario y de efectivo con la BD. [Verificación anónima](recovery-verification.json).

El login responde 200; Mi dinero, la bandeja de Captura y la recepción de eventos rechazan acceso anónimo con 401, `private, no-store` y `Vary: Authorization`. [HTTP](http-production.json). La primera ventana de logs mostró dos advertencias de deprecación del driver pg sobre consultas concurrentes, también observadas en el diagnóstico local, sin fallos de operación observados. Esa ventana breve no sustituye la observación continuada. La comprobación en el teléfono usa la sesión real existente; sus evidencias con datos personales permanecen privadas.
