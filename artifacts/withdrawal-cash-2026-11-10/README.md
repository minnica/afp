# Retiros con destino de efectivo

Publicado y corregido el registro histórico autorizado el 10 de noviembre de 2026. El diagnóstico confirmó que el formulario anterior solo guardaba la salida bancaria: no conocía la cuenta receptora ni cuánto efectivo se había recibido. Los datos personales, muestras, respaldos y recibos de ejecución permanecen privados y excluidos de Git.

## Funcionamiento

Registrar retiro solicita cuenta de salida, cuenta de tipo Efectivo, total bancario, efectivo recibido, fecha y concepto. Solo preselecciona la caja cuando existe una única cuenta CASH. Los importes permanecen vacíos hasta capturarlos. La diferencia entre total bancario y efectivo representa comisión e impuestos.

`MoneyWithdrawal` conserva el débito en `amount` y añade los campos opcionales `cashAccountId` y `cashAmount`. Un único registro produce una salida por el total y una entrada por el efectivo. No crea un ingreso ni otra transferencia o gasto que duplique la salida. La clave original de la salida se conserva para respetar las referencias existentes. Revertir el retiro retira las dos partes y comprueba las fechas de referencia de ambas cuentas.

La API conserva solicitudes antiguas sin destino; la interfaz nueva lo exige. El servicio comprueba propietario, tipo de cuenta, fecha y centavos. La restricción SQL exige ambos campos juntos, cuentas distintas e importe positivo no superior al total. La migración aditiva `20261110010000_withdrawal_cash_destination` no modifica registros anteriores ni RLS. La automatización de retiros conserva su configuración; esta corrección no supone que un aviso bancario revele cuánto efectivo entregó el cajero.

## Verificación

- [Suite completa](tests.log): **1149 pruebas correctas, cero fallos y omisiones**, con PostgreSQL local desechable. Once escenarios nuevos cubren el contrato y el flujo de retiro.
- [Pruebas específicas](focused-tests.log): 21 correctas, incluidos los escenarios existentes de captura de dinero.
- [Reconstrucción y actualización](database-verification.log): 46 migraciones, catálogo equivalente, diff vacío, checksums, repetición de deploy, registros conservados y RLS de las 46 tablas, incluido el historial.
- [Tipos de aplicación](typecheck.log), [pruebas](typecheck-tests.log), [contratos](test-types.log) y [build](build.log) correctos. [ESLint](lint.log): sin errores; tres advertencias previas fuera del alcance.
- [Auditoría de producción](audit-prod.log): cero vulnerabilidades conocidas. La [auditoría completa](audit-all.log) conserva un aviso moderado de minimatch y uno bajo de deepmerge en desarrollo. No se modificaron dependencias.
- [Navegador](ui-verification.json): fixture Next compilado, Auth ficticia, API y PostgreSQL reales locales; validación de efectivo superior al total y guardado completo. Con total ficticio de $100.47 y efectivo de $100, el banco bajó $100.47, la caja subió $100 y el conjunto bajó $0.47. Formulario revisado a 1440 × 1000 y 390 × 844; sin desbordamiento horizontal, con campos desplazables y acciones accesibles. [Escritorio](withdrawal-desktop.png) · [Móvil](withdrawal-mobile.png) · [Saldos ficticios](balances-after-fictitious-withdrawal.png).
- [Detector de interfaz](ui-detection.json): sin hallazgos en los archivos modificados.

## Producción y corrección puntual

La migración se aplicó después de verificar el respaldo PostgreSQL custom del esquema público: archivo legible con 46 entradas de datos de tablas. El historial tenía exactamente esta migración pendiente y ningún checksum distinto. [Aplicación de migración](production-migration.log).

Se publicó `dpl_676VHB1Q8j5v52XpGxkZKaTyGNzr` en producción y se confirmó que `finanzas.garatachia.com` apunta a esa versión READY. Los 414 archivos de código, recursos y configuración coinciden por SHA-1 con el manifiesto local. La base del workspace es `52f6ab5f7346f56c6d5ec7de727077480747160b`; la publicación incluye modificaciones locales mediante API, sin commit ni push nuevos. [Despliegue](production-deployment.json) · [Cotejo](source-verification.json).

La corrección histórica modificó únicamente `cashAccountId` y `cashAmount` del retiro existente, bajo el bloqueo financiero del propietario. Conservó identificador, fecha, total bancario, concepto, operación original y todos los demás registros financieros y reglas. El ensayo se revirtió antes de aplicar el cambio; una conexión independiente verificó los saldos resultantes y la igualdad de la instantánea posterior. No se creó otro retiro. Calendar ya estaba actualizado y omitió una sincronización innecesaria. [Verificación anónima](recovery-verification.json).

El login y Mi dinero responden 200; la API de Mi dinero rechaza el acceso anónimo con 401, `private, no-store` y `Vary: Authorization`. [HTTP](http-production.json). La primera ventana de logs mostró dos advertencias de deprecación del driver pg sobre consultas concurrentes, sin fallos de operación observados; ese aviso también aparece en las verificaciones locales. La ventana es breve y no acredita la ausencia de incidentes futuros. No se inició otra sesión autenticada de navegador en producción ni se requirió una APK nueva.
