# A13 · Consultas acotadas e historial · 29 de octubre de 2026

Implementación local sobre `948bc319a9c55d5dcc75852994662611cf36f6f5`. [Hallazgo](../informe.md#A13). PostgreSQL 16 desechable y Auth ficticia. Sin publicación, migraciones nuevas, cambios de dependencias ni acceso a servicios remotos.

## Implementación

- [DashboardReader](../../../src/lib/dashboardReader.ts) conserva los cálculos compartidos y separa el resumen de cabecera del análisis anual. La ruta habitual conserva su respuesta; [summary](../../../src/app/api/dashboard/summary/route.ts) devuelve solo avisos y consumo. El proveedor comparte por usuario/modo y descarta consultas sustituidas, incluso durante la espera de sesión.
- Año seleccionado con diciembre anterior y enero siguiente. Se recuperan además todos los pendientes históricos/sin estado, las tarjetas pagadas del batch activo y los vecinos. Dashboard, Análisis y Tarjetas permiten recorrer otros años. Revisar otro año no desplaza el día real de los avisos.
- [Ciclos](../../../src/app/api/card-cycles/route.ts): páginas de hasta 100 filas por año; detalle por ID de cualquier año, limitado al dueño. Los predecesores se leen en lote. La generación manual reutiliza el mismo lector y conserva `ok`/`cycles`. El desglose sigue bajo demanda.
- [ExpenseHistory](../../../src/lib/expenseHistory.ts): filas paginadas, conteo, sumas de cargo/aportación y meses distintos en SQL, bajo `RepeatableRead`. Comparte lector con el bootstrap agrupado. Fechas/filtros/orden/tamaño/página controlan la URL vigente; móviles conservan alternativas por campo y búsqueda sin diacríticos comunes. Los totales de guardados incluyen todo el filtro; los pendientes del dispositivo siguen recuperables y se distinguen.
- [HistoryWindow](../../../src/lib/historyWindow.ts) incluye ocurrencias confirmadas con contabilización fuera de ventana y compras cuyo plazo/anclas bancarias afectan el período. No elimina registros ni modifica importes o referencias. Las suscripciones se filtran por vigencia en cada ventana, sin llenar los huecos entre un pendiente antiguo y el año consultado.
- [DashboardDebts](../../../src/lib/dashboardDebts.ts) agrega abonos históricos en SQL; conserva solo los cobros del mes actual para avisos. El ingreso mensual también se suma en SQL.
- [NuHistory](../../../src/lib/nuHistory.ts) recupera la última compra válida por lotes de 100 candidatos y retiene comprobantes y exclusiones históricos. Comparte patrones de clasificación con el cálculo de consumo. No acredita comisiones, capturas pendientes ni recibos inválidos como compra.

## Regresiones y verificaciones

| Comprobación | Resultado y evidencia |
| --- | --- |
| Suite completa | **965 escenarios correctos, cero fallos y cero omisiones**, PostgreSQL real local. 951 anteriores, trece A13 y autorización adicional de la ruta summary. [Log](tests-local.log). |
| A13 | [Trece escenarios](../../../tests/history-window-integration.test.ts): 251 filas con empates en tres páginas; centavos y totales globales; ajustes fuera de rango; dueño falsificado; alternativas móviles/acentos; bootstrap paginado; ciclos por año y detalle aislado; `PAID` parcial antiguo; tarjeta pagada del batch antiguo; cargo contabilizado fuera de mes; ancla MSI de 2010 para 2026; resumen sin matrices anuales; última compra Turbo tras 101 comisiones; comprobante histórico; parámetros inválidos y ausencia de Auth. [Log](targeted-a13.log). |
| Contratos | CRUD, variantes, generación de ciclos, parciales, JSON original y respuestas de la nueva ruta comprobados contra PostgreSQL. [Log](targeted-contracts.log). Los adaptadores históricos mantienen sus proyecciones mínimas; el lector SQL se verifica con la BD real. |
| Tipos | Web, pruebas/helpers y contratos negativos correctos. [Web](typecheck.log) · [Pruebas](typecheck-tests.log) · [Contratos](test-types.log). |
| ESLint/React | Cero errores, dos advertencias previas: `loadSubscriptions` sin uso y TanStack/React Compiler. [Log](lint.log). Revisión de efectos, invalidación, propiedad, refs y controles compartidos realizada; no hay supresiones nuevas. |
| Build | `pnpm build` predeterminado, Next.js 16.4.3/Turbopack, con comprobación TypeScript. Variables de Auth ficticias y conexión local explícita. [Log](build.log). |
| BD | Las 42 migraciones existentes se aplicaron a `afp_test_a13`. [Log](migrate.log). No hay cambios de esquema; no se requiere otra ejecución de `db:verify`. |
| Navegador: escritorio | 208 gastos ficticios: bootstrap de 100 filas y total $357.05; página 2 solicita `page=2&pageSize=100`, conserva total y muestra 100 filas. [Estado final](browser-final-desktop.json) · [Captura](desktop-page2.png). |
| Navegador: móvil | A 390×844: bootstrap agrupado, cabecera por `/api/dashboard/summary` sin dashboard completo, página 2, apertura de avisos desde el resumen y ausencia de desbordamiento horizontal. [Estado](browser-mobile-page2.json) · [Avisos](browser-header-dialog.json) · [Captura](mobile-page2.png). |
| Navegador: años | Tarjetas consulta 2026 y luego 2025 con HTTP 200; Análisis solicita el año elegido con HTTP 200. [Ciclos](browser-cycles-previous.json) · [Análisis](browser-analysis-year.json). |

El recorrido usa un fixture Next compilado para producción con API y PostgreSQL reales, Auth simulada y datos ficticios. Se corrigió durante la aceptación una dependencia ausente del efecto de recarga: ahora página, tamaño, orden y alternativas móviles disparan la misma lectura vigente de Gastos. El modo de desarrollo inicial se descartó por recargas HMR y no acredita el recorrido final.

## Medición sintética

[Resultados y muestras](benchmark-final.json) · [Ejecución final](benchmark-final.log) · [Medición base](benchmark.json) · [Ejecutor](../../../tests/helpers/benchmark-history.ts).

| Flujo · 100,000 históricos | p95 antes → después | SQL antes → después | Datos BD antes → después | JSON antes → después | Heap observado p95 antes → después |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 30,079.4 → 231.3 ms | 32 → 27 | 49.28 MiB → 50.9 KiB | 136.8 → 30.7 KiB | 373.6 → 9.0 MiB |
| Cabecera móvil | 30,079.4 → 130.0 ms | 32 → 25 | 49.28 MiB → 45.1 KiB | 136.8 → 0.1 KiB | 373.6 → 4.5 MiB |
| Ciclos: listado | 30,682.4 → 170.8 ms | 28 → 20 | 47.05 MiB → 48.1 KiB | 120.4 → 11.9 KiB | 434.5 → 5.3 MiB |
| Ciclos: detalle | 1,836.5 → 62.7 ms | 28 → 20 | 47.05 MiB → 39.2 KiB | 27.0 → 27.0 KiB | 375.4 → 3.4 MiB |
| Gastos | 337.0 → 66.0 ms | 11 → 14 | 3.52 MiB → 94.0 KiB | 88.8 → 88.8 KiB | 80.1 → 8.5 MiB |
| Bootstrap Gastos | 337.6 → 63.5 ms | 24 → 27 | 3.52 MiB → 94.4 KiB | 89.2 → 89.3 KiB | 82.6 → 9.2 MiB |


El corpus mantiene **100 gastos recientes, una tarjeta sin política de consumo, 120 cortes liquidados y 10/100/1,000 MSI históricas liquidadas**, y aumenta los gastos antiguos de **1,000 a 10,000 y 100,000**. El resumen del corpus queda vacío (80 bytes): ese tamaño no representa una cuenta con avisos o metas de consumo. Los casos no vacíos y sus reglas se verifican en las regresiones.

Cada flujo/versión usa un proceso Node independiente, un calentamiento y cinco repeticiones. p95 usa nearest-rank: con cinco muestras es el máximo observado, de precisión limitada. Auth está simulada y se ejecuta el handler, sin HTTP, navegador ni red externa. La base anterior procede de `git show 948bc319a9c55d5dcc75852994662611cf36f6f5` y usa los mismos cálculos; la cabecera anterior reutiliza la medición del dashboard, que era exactamente su petición. Se repitieron las variantes nuevas y se conservaron las mediciones anteriores: las fechas de ambas están en el JSON. Los tiempos pueden incluir contención del entorno local y no son comparaciones de un entorno dedicado.

Se cuentan sentencias reales mediante eventos de Prisma. Los bytes de BD suman el JSON de los resultados de operaciones superiores, incluidas relaciones; son una aproximación al volumen materializado, **no bytes físicos del protocolo PostgreSQL**. Los bytes de respuesta son JSON sin compresión. Se registra heap en las fronteras de consulta/respuesta, después de GC antes de cada muestra: es crecimiento observado, **no el pico absoluto del heap**. El JSON conserva también el máximo RSS del proceso completo; incluye runtime, cargador y calentamiento, por lo que no debe confundirse con memoria exclusiva de la petición.

Con pocos registros, Gastos y bootstrap añaden coste por la transacción y agregados: el objetivo es evitar materializar todo el historial manteniendo sumas exactas, no minimizar a cualquier precio el número de SQL. Con 100,000 gastos, Gastos pasa de 11 a 14 sentencias; aun así devuelve alrededor de 94 KiB desde BD, frente a 3.52 MiB antes. La cantidad de SQL depende también de las relaciones y de los lotes internos de Prisma. Los resultados de todas las escalas y las cinco muestras individuales permanecen en el JSON.

## Reproducción

Crear una BD desechable local con nombre `afp_test_a13` según el README; esta evidencia usó el puerto 55443.

```bash
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55443/afp_test_a13 \
  pnpm exec prisma migrate deploy
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55443/afp_test_a13 \
  pnpm test
pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
pnpm build
```

El benchmark usa `AFP_A13_BASE_COMMIT` para fijar la versión anterior; por defecto toma HEAD. Requiere solo PostgreSQL local desechable y crea/elimina sus propios usuarios sintéticos. Guardar los resultados fuera del repositorio hasta revisarlos:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55443/afp_test_a13 \
AFP_A13_BASE_COMMIT=948bc319a9c55d5dcc75852994662611cf36f6f5 \
  node --import tsx tests/helpers/benchmark-history.ts > /tmp/afp-a13-benchmark.json
```

Para UI: ejecutar `tests/helpers/seed-ui.ts` con la misma conexión; añadir más de 100 gastos ficticios del mismo día para comprobar páginas. Iniciar `tests/helpers/money-browser-server.ts` con `AFP_CAPTURE_TEST_PRODUCTION=1`, `AFP_UI_TEST_REAL_SETTINGS=1`, `AFP_CAPTURE_TEST_REAL_DASHBOARD=1`, `AFP_UI_TEST_PORT=4221` y la conexión local explícita. Entrar como `money-qa@example.test` con una contraseña inventada de seis o más caracteres. Comprobar página/orden/búsqueda, el total global, resumen móvil y selección de años. Los datos/UUID cambian al reproducir. Cerrar servidor y navegador y eliminar la BD al terminar.

[Resumen y huellas de fuentes](verification.json).

## Límites

No se acredita publicación, Supabase Auth real, dispositivos Android físicos ni rendimiento bajo carga concurrente de producción. El lector nativo de avisos Android conserva su alcance previo; esta corrección trata las rutas web auditadas. No se cambiaron índices, migraciones, dependencias ni el lockfile.

Los agregados exactos todavía recorren las filas correspondientes en SQL. La ventana puede contener muchos movimientos; los pendientes históricos legítimos y las referencias necesarias también pueden crecer. Turbo puede necesitar varios lotes si encuentra muchos candidatos descartados. No se truncan silenciosamente obligaciones ni se promete memoria constante o un p95 fijo para cualquier cartera. Una aceptación posterior debe contrastar volumen y planes de consulta reales antes de cambiar índices o estrategias de agregación.
