# Rendimientos: seguimiento automático

Corrección del 30 de octubre de 2026 a petición del propietario: no desea capturar abonos diarios y espera usar el cálculo ya configurado para sus cuentas, incluidas DiDi y Mercado Pago.

La cifra principal es ahora **Rendimiento acumulado**. Incluye los movimientos históricos automáticos de AFP y los abonos registrados que los sustituyen, sumados a centavos. El desglose por cuenta usa el mismo acumulado. Se retiran el indicador de confirmados en cero y el botón de captura manual; el detalle conserva el origen Automático/Registrado. Los próximos 7 y 30 días permanecen como estimaciones independientes, y lo pendiente de acreditación se presenta aparte.

Se reutiliza el motor existente: recupera días sin abrir la aplicación y respeta las reglas históricas, tasas, topes, capitalización histórica y calendario de abonos. No requiere crear ingresos diarios persistidos. Los cálculos conservan su origen automático; no se presentan como comprobación bancaria. No se modificaron las reglas financieras ni la configuración de cuentas personales.

## Validación

- 1045 pruebas correctas, cero fallos y cero omisiones con PostgreSQL local. Dos nuevas regresiones verifican acumulado sin ningún ingreso/tipo configurado, mezcla de orígenes, centavos y pendientes separados. Se mantienen las pruebas del motor para importe diario observado, tramos, días hábiles y sustitución de cálculos por abonos.
- `typecheck`, `typecheck:tests`, `test:types` y `build` correctos. ESLint sin errores y con las dos advertencias preexistentes fuera del alcance. Logs en `checks/`.
- Detector Impeccable: `[]`; `git diff --check` correcto.
- Navegador con Next y API reales, Auth ficticia y PostgreSQL desechable. Se ejecutó `tests/helpers/seed-yields.ts` y se eliminaron exclusivamente los ingresos del usuario ficticio en esa base local para probar el caso sin captura manual.
- HTTP 200, **cero ingresos capturados**, 52 movimientos automáticos del mes y **$382.84 ficticios acumulados**, coincidentes con la cifra principal. El indicador Confirmado y la acción Registrar rendimiento real ya no aparecen. Evidencia en `browser-verification.json`.
- Capturas inspeccionadas a 1280, 390 y 320 px. Sin desbordamiento horizontal a 320 px; sin errores JavaScript registrados. Las capturas anteriores en la carpeta superior corresponden al diseño inicial, sustituido por esta corrección.

Cambios locales pendientes de publicación. No se consultaron ni modificaron datos de producción ni se verificaron importes personales.
