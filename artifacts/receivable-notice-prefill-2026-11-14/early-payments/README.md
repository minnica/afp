# Cobros programados: abonos anticipados

Corrección local del 14 de noviembre de 2026, posterior al commit `353fbde`. No publicada. No requiere migraciones ni modifica ingresos existentes.

## Causa y corrección

El formulario permitía corregir la fecha programada al día real del ingreso, pero el aviso buscaba abonos desde el vencimiento hasta hoy. Un ingreso del 13 no resolvía el aviso del 15. Además, ese criterio podía reutilizar un ingreso posterior para más de una fecha vencida.

`src/lib/receivableOccurrences.ts` define intervalos compartidos desde dos días antes de cada cobro, con fin exclusivo al empezar el intervalo del siguiente. Para fechas muy próximas, se conserva el pago puntual de la fecha anterior: el comienzo nunca es anterior al día posterior a esa fecha. Se ajustan los días al fin de cada mes y se eliminan duplicados en el calendario de intervalos. Solo se consideran ingresos vinculados a la cuenta, desde su origen y fechados hasta el día actual de México.

Dashboard, resumen móvil, avisos Android, validación del prerrellenado y Calendar usan el mismo cálculo. La consulta de Dashboard incluye dos días del mes anterior para anticipos del día 1. Se mantienen los IDs y fechas programadas de avisos y eventos; el ingreso conserva fecha real, importe y notas. Un abono retira el aviso de su fecha según el comportamiento existente; Calendar conserva sus sumas en centavos, estados parciales y saldo restante.

No se infiere a qué fecha corresponden pagos hechos más de dos días antes. Tampoco se introducen vínculos persistidos por ocurrencia ni cambios en Mi dinero, cuya previsión ya descuenta abonos por mes.

## Comprobaciones

- El ingreso del 13 resuelve el cobro del 15 el día 14, el propio 15 y después del vencimiento; no resuelve el siguiente cobro del 30 ni otra quincena.
- Un pago del 28 pertenece al cobro del 30 y no liquida también el del 15 si quedó pendiente.
- Cambios de mes/año, febrero bisiesto, días consecutivos, inicio de la cuenta y medianoche México.
- El prerrellenado rechaza un aviso ya atendido por un anticipo y deja de usar la excepción anterior que consideraba ingresos futuros.
- Borrar o cambiar la fecha/vínculo del ingreso restaura el aviso según los registros vigentes; el cálculo no modifica movimientos.
- Calendar distingue un anticipo completo de uno parcial y mantiene el siguiente cobro pendiente.
- Paridad de respuestas entre Dashboard completo, resumen y Android.
- Integración real con PostgreSQL local: alta por `POST /api/incomes` con fecha dos días anterior y lectura por ambas API de Dashboard; incluye cobros del 15, del 1 de enero con ingreso en diciembre y de febrero bisiesto. La lectura limitada de Dashboard incluye el anticipo, y el registro conserva un solo ingreso, su fecha, importe y notas. Al borrar el ingreso vuelve el aviso.

El diagnóstico del caso comunicado se realizó en una transacción de solo lectura. Las escrituras de prueba se ejecutaron exclusivamente en un contenedor PostgreSQL 16 local desechable, con usuarios ficticios. No se realizaron escrituras en producción, commit, push ni despliegue. La corrección del cálculo se aplicará al ingreso existente al publicar el código.

Los logs adjuntos documentan tipos, lint, pruebas y build. No hay cambios visuales ni nuevas dependencias. Las pruebas de API y PostgreSQL no equivalen a una verificación autenticada del despliegue de producción.

| Control | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm typecheck:tests` | Correcto |
| `pnpm test:types` | Correcto |
| `pnpm lint` | Cero errores; tres advertencias previas fuera del cambio |
| Suite completa con PostgreSQL local | 1,190 pruebas correctas; cero fallos u omisiones |
| Selección de cobros, prerrellenado, Calendar y Android | 43 pruebas correctas |
| Integración nueva | Tres calendarios bancarios mediante la API real y PostgreSQL local |
| `pnpm build` | Correcto |
