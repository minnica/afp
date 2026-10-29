# Identificación de pagos desde cargos BBVA · 29 de octubre de 2026

Implementación local, pendiente de publicación. La regla BBVA_DEBIT activa conserva su cuenta y terminaciones configuradas y busca un pago de tarjeta antes de crear el gasto genérico.

## Criterio

- Estado de cuenta capturado del mismo propietario, corte no futuro y saldo pendiente positivo.
- Pendiente calculado después de abonos y devoluciones aplicadas al pago del corte; un estado persistido PAID no reemplaza esa comprobación.
- Diferencia absoluta de hasta **$1.00 MXN**, incluido el límite, comparada en centavos.
- Vencimiento un día antes, el mismo día o un día después del día del aviso en México. Los días bancarios guardados conservan su fecha UTC.
- Una sola coincidencia crea el abono en Mi dinero y actualiza la tarjeta; varias coincidencias quedan por revisar en Movimientos de cuenta, sin gasto ni abono. Sin coincidencia se conserva el gasto con débito.

El abono conserva el importe real. Un pago un peso menor deja ese peso pendiente; uno un peso mayor conserva el excedente en el corte y la salida completa de la cuenta. La tolerancia de excedente se limita a la operación interna que ya comprobó el criterio; añadir una bandera al cuerpo de la API manual no la habilita.

Se reutilizan el bloqueo financiero del propietario, las validaciones de referencia de saldo y los controles de duplicados del cargo. Abono, actualización del corte y evidencia se guardan en la transacción de recepción. La propuesta y el snapshot conservan ciclo, tarjeta, vencimiento, pendiente previo, diferencia, margen y desfase de días. La fuente de identificación es `PENDING_AMOUNT_AND_DUE_DATE`, no una confirmación bancaria del destinatario.

## Verificación

**989 escenarios correctos, cero fallos y cero omisiones** con PostgreSQL local desechable y las 42 migraciones existentes. [Suite completa](tests.log).

Dieciséis escenarios nuevos cubren pago tardío, tres días permitidos y sus límites externos, ±$1 y ±$1.01, abonos previos y devoluciones, dos tarjetas compatibles, cortes liquidados/sin estado/futuros, estado PAID inconsistente, propietario ajeno, pausa/terminación, medianoche de México, concurrencia/reintentos, rollback real, bloqueo de excedentes desde la API manual y reversión. [Pruebas enfocadas](targeted-tests.log), [contratos del cargador y nueva integración](source-contract-regressions.log).

La primera ejecución enfocada falló al comparar objetos entre el contexto vm y el proceso: sus campos coincidían, pero tenían prototipos distintos. Se normalizó únicamente el objeto de prueba con el helper existente `plain`, conservando las aserciones sobre los campos originales. [Resultado inicial](targeted-tests-initial.log). Se añadió el contrato real de `captureInbox` al mapa del cargador, con sus tres exports públicos derivados del módulo real.

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| `pnpm typecheck` | Correcto | [Log](typecheck.log) |
| `pnpm typecheck:tests` | Correcto | [Log](typecheck-tests.log) |
| `pnpm test:types` | Correcto | [Log](test-types.log) |
| `pnpm lint` | Cero errores; dos advertencias previas | [Log](lint.log) |
| `pnpm test` con PostgreSQL local | 989 correctos, cero fallos y cero omisiones | [Log](tests.log) |
| `pnpm build` | Correcto con Turbopack y TypeScript | [Log](build.log) |
| Integración nueva y regresiones BBVA existentes | 27 correctos, cero omisiones | [Log](targeted-tests.log) |
| Integración nueva y contratos del cargador | 27 correctos, cero omisiones | [Log](source-contract-regressions.log) |

Las advertencias existentes son `loadSubscriptions` sin uso y TanStack Table con React Compiler. Para reproducir, crear y migrar una base PostgreSQL local desechable conforme al README, exportar `AFP_TEST_DATABASE_URL` y ejecutar `pnpm test`. La selección enfocada es `pnpm test capture-bbva-card-payment-match-integration.test.ts capture-bbva-debit.test.ts`.

## Alcance

El cambio utiliza los avisos que ya envía la APK instalada. No requiere otra APK, nuevas dependencias ni migraciones. Se actualizan los textos de configuración para explicar que los pagos tienen prioridad sobre los gastos y que la decisión usa una coincidencia de importe y fecha. La regla se puede pausar con su control existente.

No se reprocesan recibos, gastos ni decisiones históricas automáticamente. Los datos reales permanecen fuera de los fixtures y de esta evidencia; la verificación financiera usa exclusivamente cuentas y avisos ficticios. No se ha publicado la web ni activado una tarea programada.
