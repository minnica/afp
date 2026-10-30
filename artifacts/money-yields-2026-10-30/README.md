# Mi dinero · Rendimientos

La presentación inicial descrita aquí fue sustituida por el [seguimiento automático](automatic/README.md), solicitado después por el propietario. Sus evidencias y 1045 pruebas corresponden al comportamiento vigente.

Implementación local del 30 de octubre de 2026. Se leyó el README y se aplicaron Impeccable y shadcn al sistema Mira existente, en modo Operate. No se publicó ni se consultaron o modificaron datos financieros personales.

## Comportamiento

- Nueva pestaña después de Cuentas. Abre en el mes actual, conforme a la respuesta del propietario; permite otros meses, año actual e historial completo, con filtro por cuenta.
- Abonos confirmados y cálculos históricos de AFP aparecen separados. El reconocimiento usa el tipo de ingreso actual e histórico de cada cuenta, con el mismo helper que sustituye cálculos automáticos por abonos reales. No se infieren ganancias del concepto, las conciliaciones ni el saldo.
- Se excluyen nóminas y otros tipos de ingreso, cobros de deudas, transferencias, movimientos excluidos, sin fecha y futuros. Los rendimientos identificados sin cuenta se señalan aparte y se conservan en el total general.
- Los equivalentes a 7 y 30 días reutilizan `yieldEstimate` del motor existente. Usan saldo y condiciones de hoy, sin movimientos futuros ni capitalización; cambiar el período histórico no cambia estos importes. El pendiente de acreditación calculado se explica aparte cuando existe.
- Tabla de cuentas en escritorio y desglose legible en móvil, configuración de condiciones con el editor existente, detalle de movimientos con carga de veinte en veinte y enlace a Ingresos.
- Sin contratos API nuevos, migraciones, dependencias ni cambios a la fórmula de rendimientos. La consulta no crea movimientos ni altera saldos.

## Verificación

| Control | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm typecheck:tests` | Correcto |
| `pnpm test:types` | Correcto |
| `pnpm lint` | Cero errores, dos advertencias anteriores fuera del alcance |
| `AFP_TEST_DATABASE_URL=… pnpm test` | **1043 correctas, cero fallos y cero omisiones** |
| `pnpm build` | Correcto, Turbopack |
| Impeccable detect sobre ambos TSX | `[]` |
| `git diff --check` | Correcto |

Las once regresiones nuevas cubren clasificación, tipos históricos, referencias conciliadas, exclusiones y fechas, mes/año/historial, filtro de cuenta, estimaciones independientes del período, tipos compartidos, rendimientos sin cuenta y sumas a centavos sin mutaciones. También pasan las regresiones existentes de sustitución de abonos y cálculo automático. Los registros de ejecución se conservan en [checks/](checks/).

Las advertencias previas de ESLint son `loadSubscriptions` sin uso en GastosContent y la incompatibilidad de memoización de TanStack Table en ui/data-table. Ninguna pertenece a los archivos modificados.

## Navegador

Agent-browser con Chrome, interfaz y API Next reales, Auth ficticia y PostgreSQL local desechable. El seed reproducible [seed-yields.ts](../../tests/helpers/seed-yields.ts) rechaza bases remotas y no carga `.env`. Incluye tres cuentas ficticias: tasa anual, ahorro por tramos con abono en días hábiles y efectivo sin rendimiento; abonos reales actuales e históricos, nómina y un rendimiento sin cuenta.

- Cotejo de la API HTTP 200 con la interfaz: **$19.14 confirmados en octubre**, **$139.69 en todo el historial**, **$102.45 a 7 días** y **$439.07 a 30 días**. Son importes exclusivamente ficticios. El abono real de hoy sustituye los cálculos de ambas cuentas; la nómina queda fuera de los rendimientos confirmados. El total sin asignar se explica y no se atribuye a una cuenta.
- Filtros de período y cuenta comprobados, incluido efectivo con importes cero y estado sin movimientos. La estimación actual permanece igual al cambiar el historial.
- Paginación comprobada de 20 a 40 de 53 movimientos. Apertura de Configurar mediante teclado, editor correcto y cierre con Escape devolviendo el foco al botón de la cuenta.
- Se inspeccionaron [1280 px](desktop-1280.png), [tabla a 1024 px](desktop-accounts-1024.png), [390 px](mobile-390.png), [320 px](mobile-320.png) y [detalle de cuentas móvil](mobile-accounts-320.png). Documento sin desbordamiento horizontal; tres cuentas móviles y tabla oculta a 320 px, controles visibles de al menos 44 px. [Historial completo](desktop-history.png) y [cuenta sin rendimiento](empty-account.png).
- Contraste medido: 10.21:1 para el total confirmado, 7.66:1 para el texto secundario sobre el fondo y 6.94:1 sobre la tarjeta. [Cotejo y mediciones](browser-verification.json). Sin errores JavaScript registrados en [browser-errors.txt](browser-errors.txt).

Las capturas son del fixture de desarrollo y pueden incluir el indicador de Next y las barras de desplazamiento de Chrome. Esta revisión no acredita producción, una sesión de Supabase real ni una prueba en dispositivo físico. No se ejecutó una auditoría global de accesibilidad.
