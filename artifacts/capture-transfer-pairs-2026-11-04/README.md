# Transferencias BBVA → Nu con dos avisos

Implementación y publicación autorizada del 4 de noviembre de 2026. Migración aplicada y regla aceptada en producción; corrección histórica revisada completada. La APK actual ya envía los campos necesarios. Las verificaciones iniciales locales se conservan a continuación y el seguimiento de producción se detalla al final.

## Comportamiento

La nueva regla «BBVA → Nu · Vincular ambos avisos» requiere una cuenta BBVA bancaria y una cuenta Nu bancaria o de ahorro propias distintas, las terminaciones BBVA exactas y aceptación de la asociación por importe y tiempo. El aviso de recepción de Nu no identifica al remitente ni acredita una referencia bancaria compartida. Por eso la asociación es una regla aceptada por el usuario, con posibilidad de revisión y corrección.

Se exige importe exacto en centavos, hasta cinco minutos entre publicaciones y una coincidencia única desde ambos extremos. Si BBVA imprime hora de operación, también debe ser compatible con la recepción de Nu. Ambos avisos deben ser posteriores a la aceptación. La fecha del registro es la del cargo BBVA; los saldos de referencia de ambas cuentas deben permitirla.

Funciona en cualquier orden. Si Nu llega primero, espera el cargo. Si BBVA creó primero un gasto genérico automático, solo se sustituye cuando conserva importe, fecha, cuenta, concepto, categoría «Por clasificar», ausencia de notas, conciliación y vínculos. Se reutiliza la corrección transaccional de débito existente, conservando el ID original del gasto, tombstone e historial del recibo. Las notificaciones e interpretaciones originales permanecen intactas.

Se crea una transferencia y dos recibos ligados a ella. Los reintentos se identifican por evento y evidencia, bajo el bloqueo financiero del propietario. Movimientos manuales cercanos, transferencias revertidas, avisos resueltos, cambios personales y ambigüedades requieren revisión. Una recepción sin contraparte queda pendiente, con acceso a Mi dinero e Ingresos. Configurar, pausar, reactivar, publicar o reinterpretar no procesa movimientos históricos.

## Cambios

- `src/lib/captureMoneyParsers.ts` y catálogo: gramática de recepción Nu real anonimizada, validación de importe y conflictos de campos.
- `src/lib/captureTransferPairs.ts`: asociación, unicidad recíproca, duplicados, protección de registros y escritura atómica.
- `captureMoney.ts` y `captureProcessing.ts`: configuración expresa y procesamiento al recibir un evento nuevo.
- Ajustes y revisión de cuentas: selección de dirección, cuentas y terminaciones, confirmación con nombres de cuentas y explicación del efecto financiero.
- Migración `20261104010000_capture_bbva_nu_transfer_pairs`: amplía las restricciones de tipos y cuentas. No cambia tablas, datos, políticas RLS ni activa reglas.

## Verificación

- **22 pruebas nuevas correctas**: gramática, importes inválidos, fuente ajena, aceptación, propiedad, ambos órdenes, saldos, reintentos concurrentes, coincidencias ambiguas, ventana, terminaciones, modificaciones, clasificación, vínculos personales, borrado, ingreso manual, reversión, aislamiento, pausa, históricos, medianoche, referencias, rollback y restricciones/RLS. [Resultado dirigido](targeted-tests.log).
- **1128 pruebas correctas, cero fallos y cero omisiones** dentro de `pnpm db:verify`. Reconstrucción desde cero y actualización desde las trece migraciones históricas: catálogos equivalentes, diff vacío, despliegue repetible, registros conservados, **45 migraciones y 46 tablas con RLS**. [Resultado](database-reproduction.log).
- `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types` y `pnpm build`: correctos. `pnpm lint`: cero errores y las tres advertencias previas de CaptureIncomeSettings, GastosContent y data-table. Logs adjuntos.
- Navegador con interfaz y API reales, Auth ficticia y PostgreSQL local: regla creada desde Ajustes, cinco peticiones a la API nativa, transferencia única de **$845.30 ficticios**, dos recibos, ningún gasto ni ingreso. Las cuentas ficticias pasan de $10,000 cada una a $9,154.70 y $10,845.30. La recepción independiente de $333.40 queda por revisar. API sin sesión: HTTP 401. [Flujo](browser-flow.json), [API nativa](native-api-local.json), [Persistencia](database-local.json).
- Regla pausada y reactivada desde su interfaz; estado final comprobado en BD. [Controles](policy-controls.json).
- Capturas a 1280, 390 y 320 px; confirmación y recepción contenidas, sin desbordamiento horizontal. Axe: cero violaciones en configuración, confirmación y recepción. Los dos diálogos tienen una comprobación de contraste incompleta; la medición adicional con composición de fondos da mínimo **6.94:1**, incluidos los botones. [Confirmación](contrast-confirmation-320.json), [Recepción](contrast-receipt-mobile.json). Detector Impeccable: sin hallazgos. Estos resultados no equivalen a una certificación general de accesibilidad.

## Reproducir y publicar

Las pruebas requieren PostgreSQL local desechable `afp_test…`, señalado mediante `AFP_TEST_DATABASE_URL`. Aplicar las migraciones en esa base y ejecutar `pnpm test capture-transfer-pairs.test.ts`. Para la auditoría completa, usar `AFP_MIGRATION_TEST_DATABASE_URL` con un usuario local que pueda crear bases y roles y ejecutar `pnpm db:verify`.

`tests/helpers/seed-transfer-pairs.ts` y `tests/helpers/capture-browser-server.ts` permiten revisar la interfaz con cuentas ficticias. No cargan `.env`; rechazan conexiones fuera de localhost o bases ajenas a `afp_test…`. El seed imprime una credencial desechable de captura: usarla solo en el fixture y no incorporarla a evidencias versionadas.

En producción se requiere autorización expresa según README. Primero comprobar historial y aplicar la migración; después publicar el código y aceptar las cuentas/terminaciones en la nueva regla. Los movimientos históricos necesitan una corrección separada y autorizada. El cambio no requiere reinstalar Android.

## Publicación y seguimiento

Publicación confirmada en `https://finanzas.garatachia.com`: commit de código `d3f6ff67de4bc254ffc19e5a52a75e67f6d15ac4`, deployment `dpl_Ck794ATt5Pcbi9gxoA4H5z9mUkbZ`, production/READY y alias asignado. Incluye el desglose de Mi dinero autorizado previamente. La migración se aplicó tras respaldo privado completo y revisión de checksums; el historial final no tiene errores ni pendientes.

La primera ejecución detectó que el destino estaba clasificado como ahorro y revirtió toda la transacción. Se corrigieron validación, búsqueda y selector de destino para admitir BANK/SAVINGS, manteniendo exclusión de CASH. La regresión específica pasó; el flujo tiene ahora **23 pruebas** y la suite completa **1129 correctas, sin omisiones**. Los tres controles de tipos, lint (cero errores, tres advertencias anteriores) y build se repitieron correctamente; logs `release-*.log`. La interfaz y API locales se comprobaron nuevamente con destino SAVINGS y cinco envíos nativos, incluidos reintentos. [Selección de ahorro](savings-ui-check.json).

Con autorización expresa se activó la regla y se corrigió el movimiento histórico revisado en una transacción. Se conservan dos evidencias para una transferencia única, originales intactos y tombstone del gasto sustituido; la anotación visible indica «Actualizado desde la BD.». Se comprobaron por separado el capital trasladado y el cambio en rendimientos calculados por AFP. La verificación independiente posterior confirmó persistencia, reglas anteriores intactas y saldos en la sesión autenticada real del teléfono. Los importes, terminaciones, IDs financieros, respaldos y capturas reales se guardan exclusivamente en evidencia privada. [Resultado saneado](production-verification.json).

Las páginas afectadas responden HTTP 200; las API financieras sin sesión responden 401. Los registros recientes de Vercel mostraron advertencias de deprecación del driver pg, sin fallo operativo observado. La auditoría de producción tiene cero vulnerabilidades; la completa reporta una baja y dos moderadas en dependencias de desarrollo, sin cambios de dependencias en esta tarea. [HTTP](production-http.json) · [Auditorías](release-audits.json).

En el teléfono se abrió además el desglose de Nu y se comprobó la transferencia y la nota visible; se dejó ese panel abierto para revisión del propietario. El trabajador de Calendar dejó su revisión en estado PENDING, conservada para la siguiente ejecución de la aplicación o su tarea programada.
