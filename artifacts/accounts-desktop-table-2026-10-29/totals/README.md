# Cuentas · totales al pie

Cambio local del 29 de octubre de 2026 solicitado por el propietario: sumar saldo actual y rendimientos diario, semanal y mensual al pie del listado.

## Implementación

- TableFooter de shadcn con «Total de cuentas», saldo y tres rendimientos alineados con las columnas de las filas.
- Footer móvil después de las cards con los mismos cuatro importes y un Separator local.
- `accountTotals.ts` suma en centavos cada columna de forma independiente. Los totales coinciden con los importes mostrados por cuenta; semanal y mensual no se recalculan desde el diario total.
- El cálculo se comparte entre ambas vistas y se deriva de las cuentas vigentes, por lo que se actualiza después de guardar y recargar los datos.

No se cambia API, persistencia, cálculo de rendimientos ni configuración de cuentas. Pendiente de publicación.

## Verificación funcional

Chrome mediante agent-browser, fixture Next, Auth ficticia y PostgreSQL local desechable. Cuatro cuentas ficticias, sin datos personales. Se comparan las filas y ambos footers en centavos: saldo **$47,120.10**, diario **$15.81**, semanal **$110.63** y mensual **$474.12**. Coincidencia completa.

Se concilia Efectivo ficticio desde el formulario, pasando de $5,000 a $5,100. Al guardar, el total cambia a **$47,220.10** sin recarga manual, con rendimientos conservados. [Resultado](reconciliation.json). Registro de errores JavaScript vacío.

Una comprobación directa del helper valida centavos exactos (0.1 + 0.2), inclusión de saldo negativo, lista vacía e inputs sin mutar. No se agregaron pruebas permanentes para este ajuste de presentación.

| Captura | Resultado |
| --- | --- |
| [1280 px](desktop-1280.png) | Footer con cuatro totales alineados y fondo diferenciado |
| [1024 px](desktop-1024.png) | Tabla de 734 px, sin desbordamiento del documento |
| [390 px](mobile-390.png) | Totales al pie de las cards; documento de 390 px |
| [320 px](mobile-320.png) | Cuatro totales legibles, sin desbordamiento |

Las capturas preceden a la conciliación de prueba y pueden incluir el indicador de Next. No acreditan producción ni Android.

## Controles del repositorio

`pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types` y `pnpm build` correctos. Suite completa con PostgreSQL local: 1032 pruebas correctas, cero fallos y cero omisiones. `pnpm lint` sin errores y con las dos advertencias previas de GastosContent y ui/data-table. Detector Impeccable: `[]`. `git diff --check` correcto. Logs en esta carpeta.
