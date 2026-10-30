# Cuentas · rendimiento diario, semanal y mensual

Refinamiento local del 29 de octubre de 2026. Sustituye el resumen anterior de tasas y acumulados por tres importes comparables, conforme a la petición del propietario y las guías de UI/UX Pro Max para lectura y estructura semántica.

## Método

La API añade `yieldEstimate.daily`, `weekly` y `monthly` a cada cuenta. Se calcula el rendimiento de un día con el saldo actual y la regla vigente mediante `dailyYieldCents` y `ruleAt`; se escala a 1, 7 y 30 días antes de redondear cada importe a centavos. Se conservan topes, tasas por tramos, base anual, descuentos y modalidad de redondeo.

Son equivalentes con capital y condiciones actuales, sin movimientos futuros ni capitalización. No constituyen el pronóstico de un mes calendario ni incorporan cambios futuros de tasa. El calendario de depósitos no altera estos períodos de generación; la nota visible explica las duraciones y los abonos según cada cuenta.

No se usan el acumulado histórico `calculatedYield` ni el pendiente `pendingYield` como importes de un período. Se retiran esos textos de la celda para evitar la ambigüedad. Las condiciones de rendimiento siguen disponibles en Editar. No se modifican saldos, reglas de proyección, movimientos ni persistencia; no hay migraciones ni cambios en producción.

## Validación

`tests/money-yield-estimates.test.ts` agrega siete regresiones: 1/7/30 días sin capitalización, tramos y redondeo, importe diario proporcional al tope, descuentos, cero/saldo negativo/vigencia, independencia del calendario y acumulados, y selección de regla vigente frente a una tasa futura.

| Comprobación | Resultado |
| --- | --- |
| Pruebas específicas | 7 correctas |
| Suite completa con PostgreSQL local | 1032 correctas, 0 fallos, 0 omitidas |
| `pnpm typecheck` | Correcto |
| `pnpm typecheck:tests` | Correcto |
| `pnpm test:types` | Correcto |
| `pnpm lint` | Sin errores; dos avisos previos fuera del alcance |
| `pnpm build` | Correcto |
| Detector Impeccable | `[]` |
| `git diff --check` | Correcto |

Los avisos previos de lint son `loadSubscriptions` sin uso en GastosContent y la incompatibilidad de memoización de TanStack Table en ui/data-table. Los logs de esta ejecución se conservan junto al informe.

## Navegador

Agent-browser con Chrome, fixture Next de desarrollo, Auth ficticia y PostgreSQL local desechable. Cuatro cuentas ficticias cubren efectivo sin rendimiento, tasa anual, importe diario observado y tasas por tramos. Se cotejaron las doce cifras visibles con la respuesta HTTP 200 de `/api/money`, con coincidencia completa. El registro de errores JavaScript quedó vacío.

| Captura | Resultado |
| --- | --- |
| [1280 px](desktop-1280.png) | Cuatro columnas y cuatro cuentas; Diario/Semanal/Mensual en cada fila |
| [1024 px](desktop-1024.png) | Tabla y contenedor de 734 px, documento de 1024 px; sin desbordamiento |
| [390 px](mobile-390.png) | Cuatro cards con las tres etiquetas y cifras; documento de 390 px |
| [320 px](mobile-320.png) | Cuatro cards con las tres etiquetas y cifras; documento de 320 px |

Las capturas pueden incluir el indicador de Next. No contienen datos personales y no acreditan producción ni una instalación Android. Pendiente de publicación.
