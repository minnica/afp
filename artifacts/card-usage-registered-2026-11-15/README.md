# Consumo mínimo con compras registradas — 15 de noviembre de 2026

## Resultado

Las compras manuales y automáticas ya guardadas suman al consumo desde su fecha, aunque su conciliación esté pendiente. Se aplica al avance vigente, historial, resumen móvil y seguimiento de compras de Nu. Las compras nuevas a meses cuentan una vez por el importe total. Los registros anteriores se benefician al recalcular sin cambiar sus datos ni inventar un cotejo.

Las fechas futuras, suscripciones sin cargo registrado y exclusiones bancarias conservan su tratamiento. Una discrepancia real entre gasto y comprobante sigue requiriendo revisión y aparece en «Cargos por revisar»; los cargos programados aparecen en «Cargos previstos». El desglose identifica capturas y cargos conciliados. Completar la meta describe lo registrado en AFP.

La conciliación es opcional para el avance. Confirmar y quitar el cotejo conservan el mismo importe; editar, eliminar o aplicar una devolución recalculan usando los registros vigentes. La captura mantiene sus reglas de identificación, duplicidad, evidencia y autorización.

## Verificación

- **1,228 pruebas correctas**, sin fallos ni omisiones, con PostgreSQL 16 local desechable. Se añaden seis regresiones: cuatro financieras, una de Turbo y una de API/BD; la selección dirigida de capturas/consumo pasó 74 escenarios y la de ventanas/API pasó 15.
- `typecheck`, `typecheck:tests`, `test:types` y build correctos. Lint sin errores; tres avisos en archivos ajenos a esta modificación (`CaptureIncomeSettings`, `GastosContent`, `data-table`). Detector visual sin hallazgos en los dos componentes modificados. Revisión de React: hooks estables, campos JSON opcionales tipados, datos derivados durante render y controles accesibles conservados.
- Chromium con autenticación ficticia y API/PostgreSQL reales locales: cuatro capturas registradas por **$268.38**, avance y **$31.62** faltantes en escritorio y móvil. Una suscripción futura por **$40** queda fuera. Respuestas de dashboard y resumen HTTP 200 válidas según los esquemas del cliente.
- Confirmar y quitar el cotejo mediante la API desde el navegador devuelven HTTP 200; cambian la indicación Conciliado y conservan **$268.38** en ambos casos. Las lecturas no concilian registros ni crean comparaciones.
- Revisión visual en escritorio de 1440 px y móvil de 390/320 px, sin desbordamiento horizontal. Capturas con datos ficticios: [escritorio](desktop.png), [avance móvil](mobile-progress.png), [desglose móvil](mobile-breakdown.png).
- Auditoría de producción sin avisos; árbol completo con nueve avisos de desarrollo (siete moderados y dos bajos) en dependencias transitivas de herramientas. Se conservan los informes completos; no se cambian dependencias.

## Alcance y límites

Implementación local, sin publicación, migración, cambios de APK ni escrituras en producción. Los datos de prueba se crearon exclusivamente en una base local desechable. AFP conserva su cálculo basado en registros; no consulta el consumo reconocido por un banco.

El resumen reproducible está en [verification.json](verification.json); los logs incluyen tipos, pruebas, lint, build y auditorías. Para repetir: preparar una base PostgreSQL local `afp_test*`, aplicar el historial con `prisma migrate deploy` y ejecutar `pnpm test` con `AFP_TEST_DATABASE_URL`, conforme al README principal. La revisión de navegador usó `seed-ui.ts` y `money-browser-server.ts`, añadiendo únicamente datos ficticios al usuario de QA para el ciclo del 5 de noviembre al 4 de diciembre de 2026.
