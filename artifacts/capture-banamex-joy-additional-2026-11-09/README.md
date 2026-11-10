# Banamex: variante JOY BANAMEX ADICIONAL

Implementación publicada y recuperación histórica aplicada con autorización del propietario. El diagnóstico y la comprobación posterior se realizaron en transacciones PostgreSQL de solo lectura; la recuperación se confirmó atómicamente bajo el bloqueo financiero del propietario. Las notificaciones, importes personales, identificadores, respaldos y recibos de ejecución permanecen en almacenamiento privado excluido de Git.

## Cambio

`banamex.card-charge.es.v1` admite `- JOY BANAMEX ADICIONAL` además de `- ADICIONAL`. Mantiene la fecha bancaria, el comercio completo, el importe, las tres cifras y la autorización abreviada. Sigue siendo un formato parcial: no supone MXN ni tipo de compra a partir de `$` y «Retiro/Compra». La regla de respaldo aceptada por tarjeta completa esos campos y conserva la espera de 15 minutos.

La modificación no activa formatos ni cambia alias, reglas, APK, dependencias o esquema. Los avisos históricos conservan su interpretación original; solicitar otra lectura no los registra ni programa una espera automática. Gmail continúa sin automatización por tarjeta habilitada.

## Verificación

- [Suite completa](tests.log): **1138 correctas, cero fallos y omisiones**, con PostgreSQL local desechable.
- [Pruebas específicas](focused-tests.log): 36 correctas. Incluyen ambas gramáticas, importe y calendario, alias, marca, contradicciones, fecha futura, reintentos concurrentes, gasto único por aviso y protección de originales al reinterpretar históricos.
- [Tipos de aplicación](typecheck.log), [tipos de pruebas](typecheck-tests.log), [contratos](test-types.log) y [build](build.log) correctos.
- [ESLint](lint.log): cero errores y tres advertencias en componentes sin cambios.
- [Auditoría de producción](audit-prod.log): sin vulnerabilidades conocidas. La [auditoría completa](audit-all.log) conserva un aviso moderado de `minimatch` y uno bajo de `deepmerge`, en desarrollo. No se cambiaron dependencias.

## Recuperación histórica autorizada

El ensayo usa los servicios de revisión y registro bajo el bloqueo financiero por propietario. Reinterpreta los cuatro avisos, registra el total explícito del recibo actualizado y vincula los dos cargos bancarios y el recibo anterior como evidencias del mismo gasto. Los importes parciales permanecen en sus avisos y movimientos. La correspondencia es personal y expresa: el reloj bancario está un segundo antes del minuto del recibo y el comercio de la propina usa otra descripción. No se amplían las tolerancias ni los nombres de las asociaciones automáticas.

El ensayo se revirtió íntegramente y confirmó un solo gasto nuevo, cuatro evidencias, conservación de todos los gastos anteriores y de los eventos originales, reglas sin cambios y protección de duplicados por cada importe desglosado. Tras comprobar que el dominio sirve la versión publicada y que las filas seguían coincidiendo con la revisión, se aplicó el mismo procedimiento. Una conexión independiente confirmó gasto único, cuatro evidencias, importes parciales preservados y todos los invariantes anteriores. [Verificación de recuperación](recovery-verification.json). Hay un respaldo privado PostgreSQL custom legible del esquema público, con 46 entradas de datos de tablas.

Los avisos futuros de viaje y propina pueden generar cargos separados mediante el respaldo bancario existente. Su agrupación histórica en esta recuperación no activa una regla Gmail ni fusiona otros viajes.

## Despliegue

Vercel `dpl_FEBVrE7dAM45xdo3BP3TXpYQswu5`, proyecto `afp`, está `READY` en producción y asociado a `finanzas.garatachia.com`. Se publicaron 412 archivos de código, recursos y configuración. Los 412 archivos expuestos por Vercel coinciden por SHA-1 con el manifiesto local, incluido el único módulo de producción modificado. [Despliegue](production-deployment.json) · [Cotejo de fuentes](source-verification.json). La base del workspace es `63c566fd19216d8f7083f0faad16af68c8e94edf`; la modificación local se incluye mediante API, sin crear un commit ni hacer push.

El login responde 200 y las API de Gastos y Captura comprobadas rechazan solicitudes anónimas con 401, `private, no-store` y `Vary: Authorization`. [Comprobaciones HTTP](http-production.json). El barrido inicial del despliegue no encontró errores ni fallos fatales; la ventana es breve y no sustituye la observación continuada. Los datos financieros se verificaron con los servicios reales y lectura independiente de PostgreSQL; no se inició otra sesión autenticada de navegador.
