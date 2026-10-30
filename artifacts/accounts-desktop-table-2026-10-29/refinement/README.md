# Cuentas · reserva oculta y rendimiento conciso

Refinamiento local del 29 de octubre de 2026 solicitado después de la primera tabla. Las capturas y resultados de la carpeta superior corresponden a la versión anterior.

- Se elimina «Disponible tras tu reserva» de la tabla, cards y caption accesible de Cuentas. Se conserva la reserva en configuración y cálculos.
- `AccountYieldSummary.tsx` comparte el mismo copy breve en escritorio y móvil: tasa anual o importe diario estimado, tope, calendario e importes estimados incluidos o por abonar, cuando corresponden. Ejemplos ficticios: «13 % anual» y «$9.50/día estimados con $25,000.00».
- Se elimina el aviso repetido de cálculo automático y se acorta la nota general. Las acciones e historial existentes se conservan.
- No cambian API, reglas financieras, dependencias ni datos reales. Pendiente de publicación.

Se utilizó UI/UX Pro Max para estructura semántica y lectura responsive. La búsqueda no arrojó una recomendación específica para este microcopy; la selección de contenido sigue la petición del propietario y la prioridad general de contenido.

## Navegador

Chrome mediante agent-browser, fixture Next de desarrollo, Auth ficticia y PostgreSQL local desechable. Cuatro cuentas ficticias cubren ausencia de rendimiento, tasa anual, importe diario y tasas por tramos.

| Captura | Comprobación |
| --- | --- |
| [1280 px](desktop-1280.png) | Cuatro columnas: Cuenta, Saldo actual, Rendimiento y Acciones; reserva ausente y resumen breve |
| [1024 px](desktop-1024.png) | Tabla y contenedor de 734 px; documento de 1024 px, sin scroll horizontal |
| [390 px](mobile-390.png) | Cuatro cards, tabla oculta, reserva ausente y documento de 390 px |
| [320 px](mobile-320.png) | Cuatro cards, reserva ausente y documento de 320 px |

Registro de errores JavaScript vacío. Las capturas pueden incluir el indicador de Next y no acreditan producción ni Android.

## Comprobaciones del repositorio

`pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types` y `pnpm build` correctos. Suite completa con PostgreSQL local: 1025 pruebas correctas, cero fallos y cero omisiones. `pnpm lint` sin errores, con las dos advertencias previas de GastosContent y ui/data-table. Detector Impeccable sobre los tres componentes: `[]`. `git diff --check` correcto. Logs de esta ejecución en esta carpeta.
