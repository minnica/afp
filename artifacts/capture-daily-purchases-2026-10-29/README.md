# Compras diarias y revisión de duplicados · 29 de octubre de 2026

Implementación local. La búsqueda de compras con la misma tarjeta e importe en ±3 días podía bloquear compras habituales de días distintos. Ahora se compara el día financiero completo: fecha bancaria o fecha del aviso en México, según el formato y su regla aceptada. La misma comprobación se aplica en la recepción y antes de crear el gasto.

Para conservar la protección de avisos entre días contiguos:

- Las propuestas cuyas horas conocidas de operación/publicación distan hasta 15 minutos siguen siendo candidatas, incluido el límite exacto.
- Si banco o Wallet ya registró el gasto, el otro canal conserva revisión hasta el día contiguo, aunque el gasto se haya editado. Fuera del margen de 15 minutos, una hora bancaria de operación posterior al aviso Wallet distingue la compra nueva. Un aviso bancario pendiente del día anterior no bloquea por sí solo la compra Wallet de hoy. La hora de publicación bancaria no se confunde con la de operación: si falta esta última, la coincidencia entre canales conserva revisión.
- Compras iguales del mismo día, referencias contradictorias, revisiones de notificación, recibos idempotentes y resoluciones expresas conservan sus controles.

Se añaden siete escenarios de integración con PostgreSQL local y datos ficticios: compras en cuatro días consecutivos, gastos manuales en ambos extremos del día, límite de 15 minutos al cruzar medianoche, compra nueva tras borrar la anterior, compras diarias con ambos avisos, banco/Wallet a ambos lados de medianoche en ambos órdenes y aviso bancario del día siguiente sin hora de operación. Las regresiones existentes verifican Wallet tardío, banco tardío con otra fecha, edición, concurrencia, reintentos y revisión de compras iguales del mismo día.

Verificación final:

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| `pnpm typecheck` | Correcto | [Log](typecheck.log) |
| `pnpm typecheck:tests` | Correcto | [Log](typecheck-tests.log) |
| `pnpm test:types` | Correcto | [Log](test-types.log) |
| `pnpm lint` | Cero errores; dos advertencias previas | [Log](lint.log) |
| `pnpm test` con PostgreSQL local | **972 correctos, cero fallos y cero omisiones** | [Log](tests.log) |
| `pnpm build` | Correcto, Turbopack y TypeScript | [Log](build.log) |
| Cuatro integraciones de Captura seleccionadas | **81 correctos, cero fallos y cero omisiones** | [Log](targeted-tests-final.log) |

Las advertencias de lint existentes corresponden a `loadSubscriptions` sin uso y a la compatibilidad de TanStack Table con React Compiler. Los logs `tests-initial.log` y `tests-daily-regression.log` conservan los casos que motivaron las excepciones entre canales y la comprobación del orden temporal: cada ejecución contiene un escenario fallido y su contenedor marcado como fallido. `tests-before-notification-guard.log` conserva el pase intermedio de 971 escenarios antes del último control sobre avisos sin hora de operación; `tests.log` verifica la implementación final con los 972 escenarios.

Para reproducir, crear y migrar una base local desechable siguiendo el README principal, exportar su conexión como `AFP_TEST_DATABASE_URL` y ejecutar `pnpm test`. La selección enfocada es `pnpm test capture-wallet-real-integration.test.ts capture-bank-fallback-integration.test.ts capture-processing-integration.test.ts capture-santander-wallet-backup-integration.test.ts`.

Los logs de esta carpeta corresponden a datos ficticios y una base desechable local, creada con las 42 migraciones existentes. No se introducen migraciones ni cambios Android. La publicación y los avisos históricos pendientes mantienen su alcance separado: el cambio no registra automáticamente una compra que ya estaba por revisar. La creación manual de gastos conserva su validación independiente frente a capturas por conciliar.
