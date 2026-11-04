# Movimientos por cuenta — 3 de noviembre de 2026

Implementación local de **Mi dinero → Cuentas → Ver movimientos**, solicitada por el propietario con Impeccable y shadcn. Sin publicación, migraciones, cambios de reglas ni escrituras de datos personales.

## Comportamiento

Cada cuenta abre su detalle en un Sheet lateral en escritorio o inferior en móvil. El saldo se explica desde la última referencia con entradas, salidas y ajustes. La lista muestra fecha, concepto, tipo, efecto firmado y saldo después de cada movimiento. Incluye acceso al módulo de origen, búsqueda sin distinguir acentos, filtro por mes y ampliación de veinte filas en veinte. Los filtros conservan los saldos del historial completo. En móvil, el resumen empieza plegado; las estimaciones permanecen visibles y la primera fila aparece en la pantalla inicial.

El cálculo se comparte con el saldo de AFP mediante `src/lib/money/balance.ts`; no se mantiene una fórmula independiente para la interfaz. `accountLedger.ts` descompone los efectos normales y explica por separado las diferencias de registros ya incluidos en la referencia. Los recibos de pagos de tarjeta conservan su agrupación por corte y la asignación tardía de importes previamente sin cuenta no vuelve a crear dinero.

El panel usa `forecast.accounts` y `forecast.actual` de la respuesta autenticada existente. Abrirlo o filtrar no solicita un historial adicional ni escribe en la base. Conserva la recarga normal de Mi dinero, su tratamiento de errores y el aislamiento de la sesión; el escenario de simulación no sustituye el saldo real del detalle.

## Límites del historial

La referencia puede contener movimientos anteriores que no se vuelven a sumar. Un registro modificado, eliminado o reasignado puede producir un ajuste neto respecto a esa referencia. La referencia guarda efectos agregados: no permite recuperar el texto original de un registro borrado, las partidas anteriores de un corte ni la fecha de su edición. Esos casos se etiquetan como ajustes y su fecha se identifica como referencia, sin presentarlos como depósitos o gastos bancarios nuevos.

El saldo acumulado usa un orden diario determinista de AFP. No acredita el orden intradía del banco. Las previsiones, operaciones futuras y rendimientos pendientes de abono no forman parte del saldo actual; los rendimientos calculados que sí se suman y los ingresos estimados se identifican expresamente.

## Verificación

- **1106 pruebas correctas, cero fallos y cero omisiones**, con PostgreSQL local: [suite final](tests-final.log). Incluye diecinueve regresiones nuevas de referencias, registros editados/borrados, reasignaciones, pagos de tarjeta, transferencias, estimaciones, redondeo, saldos negativos y filtros: [pruebas del desglose](ledger-tests.log).
- `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types` y `pnpm build` correctos. La compilación final incluye las etiquetas compactas de mes en móvil. [Build](build-final.log), [tipos de aplicación](typecheck-final.log), [tipos de pruebas](typecheck-tests-final.log), [contratos negativos](type-tests-final.log).
- ESLint: cero errores; tres advertencias preexistentes fuera del alcance en `CaptureIncomeSettings.tsx`, `GastosContent.tsx` y `ui/data-table.tsx`. Lint del alcance correcto. [Lint completo](lint.log), [revisión final del componente](lint-scope-final.log).
- **17 comprobaciones de navegador** con componentes, API y PostgreSQL reales y Auth/datos ficticios: importes de cuatro cuentas, búsqueda, mes, paginación, ajuste de referencia, estado vacío, saldo negativo, rendimientos automáticos, selector móvil anidado, conceptos largos, foco y teclado. Cero errores de consola. [Resultados](browser-checks.json), [API y desglose por cuenta](api-ledgers.json).
- La API local rechaza la lectura sin sesión con `401`; autenticada devuelve `200` y `private, no-store`. Los saldos y las filas visibles coinciden con su respuesta. No se probaron credenciales reales ni producción.
- Capturas finales inspeccionadas en 1280, 1024, 390 y 320 px, sin desbordamiento horizontal. Los controles del panel móvil tienen al menos 44 px. [Escritorio](desktop-1280.png), [1024 px](desktop-1024.png), [móvil](mobile-390.png), [320 px](mobile-320.png), [resumen desplegado](mobile-summary-expanded.png), [concepto largo](mobile-long-concept.png), [ahorro con rendimientos](savings-desktop.png).
- Axe: cero infracciones en el panel de escritorio y móvil. El escritorio final no conserva comprobaciones incompletas; en móvil queda una comprobación automática incompleta de contraste del subtítulo. Se revisó esa línea manualmente: contraste **6.94:1** y ambas líneas de texto sin obstrucción. El mínimo entre los textos medidos del panel es **6.21:1**. No se declara conformidad global de toda AFP. [Axe escritorio](axe-desktop-final.json), [Axe móvil](axe-mobile-final.json), [contraste medido](contrast.json), [subtítulo móvil](mobile-description-check.json).
- Detector Impeccable sin hallazgos: [resultado](impeccable-detector.json). Se conserva el sistema Mira, Geist y los tokens semánticos del proyecto.

## Reproducción de la interfaz

Con una base local desechable `afp_test…` migrada conforme al README:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55463/afp_test_account_ledger \
  node --import tsx tests/helpers/seed-account-ledger.ts

AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55463/afp_test_account_ledger \
  AFP_CAPTURE_TEST_PRODUCTION=1 node --import tsx tests/helpers/money-browser-server.ts
```

Abrir `http://127.0.0.1:4216/login`, utilizar `money-qa@example.test` y una contraseña ficticia de al menos seis caracteres. El fixture copia el código, conserva las API reales y simula Auth; se niega a usar una base remota. La base y el servidor de esta verificación se retiraron al terminar. Los archivos adjuntos contienen exclusivamente datos ficticios.
