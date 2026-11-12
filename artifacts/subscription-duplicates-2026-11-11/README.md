# Suscripciones y gastos capturados — 11 de noviembre de 2026

## Causa y alcance

La captura y la confirmación manual ya compartían el registro mensual cuando existía una regla de comercio con `subscriptionId`. Sin esa regla, una compra automática se guardaba como gasto independiente y la confirmación manual podía crear un segundo gasto. El diagnóstico personal se hizo en una transacción de solo lectura y se conserva fuera de Git.

La corrección local revisa las capturas antes de confirmar. `GET /api/subscription-charges` admite una vista previa con `subscriptionId` y los ajustes del cobro; devuelve candidatos y una huella de la revisión. Se comparan propietario, tarjeta, importe y una ventana inclusiva de tres días alrededor de la fecha seleccionada. Una regla existente para esa suscripción también permite proponer cargos de importe distinto. Las coincidencias son propuestas, nunca vínculos implícitos.

`action: link` vincula el gasto seleccionado al mes, conserva sus datos y sus evidencias y crea la decisión mensual en la misma transacción. La opción `rememberMerchant` guarda la regla exacta por tarjeta cuando las propuestas siguen respaldando los datos del gasto. No reemplaza una regla de otra suscripción ni aprende de datos editados o de varias denominaciones bancarias ambiguas. Los formatos en observación conservan ese modo; esta operación no habilita nuevas fuentes.

Confirmar, vincular y capturar toman el bloqueo financiero por propietario antes del de la suscripción. El servidor reconsulta las coincidencias y comprueba la huella antes de vincular o aceptar una compra distinta. Reintentar el vínculo confirmado conserva un único gasto. Los gastos borrados, asociados a otra suscripción o con devoluciones/aportaciones/deudas se protegen; no se reconstruyen para completar la vinculación.

## Verificación

- `pnpm typecheck`, `pnpm typecheck:tests` y `pnpm test:types`: correctos.
- `pnpm lint`: sin errores, tres advertencias previas en archivos fuera del alcance; lint focal final sin advertencias.
- `pnpm test` con PostgreSQL 16 local desechable y todas las migraciones aplicadas: **1172 pruebas correctas, sin fallos ni omisiones**. Las diez regresiones nuevas, dentro de su prueba de integración, cubren API, preservación de datos, reintentos concurrentes, regla del siguiente mes e importe real, candidatos múltiples, elección de otro gasto, cambios concurrentes, aislamiento, límites de fechas, devoluciones, reglas incompatibles, omisiones, rollback y eliminación. Repetición focal tras el ajuste final de validación: 13 pruebas correctas.
- `pnpm build`: correcto. Sin migraciones nuevas, cambios de dependencias ni APK.
- Detector de interfaz: sin hallazgos. Las comprobaciones de navegador usan Auth ficticia, API real y PostgreSQL local. La compilación de producción del fixture evita un bucle de recarga observado en su servidor de desarrollo.
- Teléfono Android físico conectado por USB, con el fixture local abierto en una pestaña aparte de Chrome: confirmar mostró la captura; guardar el vínculo y aceptar su regla mantuvo los mismos cuatro gastos ficticios y su total de $399, conservó el gasto de $249 y su nota y creó un solo cobro y una sola regla. El aviso pasó de tres a dos y la suscripción quedó en el historial sin pendientes. Una segunda confirmación desde la pestaña de escritorio que aún mostraba la revisión devolvió «Este cobro ya estaba registrado», sin duplicar.
- Revisión visual en el teléfono (384 px CSS), escritorio de 1280 × 900 y viewport de 320 × 740: controles visibles, texto envuelto y diálogos contenidos, sin desplazamiento horizontal. La acción de crear otro gasto empezó deshabilitada hasta declarar que se trata de otra compra. No se instaló una APK de prueba ni se usó la base personal para estas acciones.

Logs, datos ficticios y capturas de verificación en esta carpeta. El estado personal consultado desde el teléfono y el plan de corrección permanecen en `estados_cuenta/_soporte/respaldos-y-revisiones/`, excluido de Git.

## Estado y límites

**Publicado y aplicado con autorización expresa.** Vercel `dpl_8mCQRMRHLF7FfLzPcazgXK2QuViU`, producción/READY, sirve `finanzas.garatachia.com`. Los 415 archivos remotos coinciden por SHA-1 con el manifiesto revisado. Se publicó el workspace sobre `de711f7de0abb7edeaa23e134ae86b03469e9269`, sin commit ni push nuevos. [Despliegue](production-deployment.json) · [Cotejo](source-verification.json).

El respaldo custom del esquema público es legible, de 789064 bytes y 46 entradas de datos de tablas. Se ensayó la operación y se comprobó por una lectura independiente que la reversión conservó todas las filas vigiladas. La aplicación posterior conservó la captura original, sus notas, categoría, estado de conciliación y evidencias; eliminó exclusivamente el registro manual duplicado y lo archivó con el mecanismo normal de borrado. La decisión mensual conservó su identidad y quedó vinculada al gasto capturado; la regla expresa de comercio y tarjeta quedó guardada. Reintentar el vínculo devolvió el mismo gasto. La verificación independiente confirmó una reducción neta de $399, con los demás movimientos, suscripciones, cuentas, reglas previas, eventos e interpretaciones intactos. Calendar terminó `SYNCED`, sin revisiones pendientes. [Verificación anónima](recovery-verification.json).

El login devuelve 200 y las API financieras revisadas rechazan acceso anónimo con 401 y cabeceras privadas. La ventana inicial de logs del nuevo despliegue no mostró errores ni fallos fatales. [HTTP](http-production.json). En el teléfono conectado, con la sesión real, chatGPT aparece una sola vez en el historial de cobros como registrado por $399 en su tarjeta; el pendiente que permanece corresponde a otra obligación. La evidencia personal se conserva privada. La auditoría de dependencias de producción devolvió cero vulnerabilidades conocidas; la completa conserva dos avisos de desarrollo, uno moderado y uno bajo. No se cambiaron dependencias. Los logs de auditoría y los respaldos privados conservan su alcance temporal.

La prevención depende de recibir una captura compatible o de configurar el comercio correcto. Una denominación bancaria nueva, otra tarjeta o una fecha fuera de la ventana necesitan revisión; la app no identifica todas las suscripciones por el nombre comercial ni por importe solamente. La regla de comercio resuelve las ocurrencias compatibles que se registren en adelante y conserva los conflictos mensuales para revisión.
