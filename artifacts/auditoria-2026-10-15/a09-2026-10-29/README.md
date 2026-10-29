# A09 · Lecturas de Gastos con filtros vigentes · 29 de octubre de 2026

Implementación local sobre `be596435d41e4c20c774819367b1dd1f61f616f7`. [Hallazgo actualizado](../informe.md#A09). PostgreSQL 16 desechable, datos ficticios y Auth simulada; sin publicación ni cambios en servicios remotos.

## Cambio

Una consulta antigua podía reemplazar las filas, los meses disponibles o el estado de carga del filtro actual. El debounce solo retrasaba el siguiente envío. Ahora [expenseReader.ts](../../../src/lib/expenseReader.ts), integrado en [GastosContent.tsx](../../../src/components/gastos/GastosContent.tsx), conserva una selección y una generación de lectura:

- Cambiar URL de filtros o propietario cancela e invalida inmediatamente la consulta anterior, antes del debounce de 250 ms. Se retiran las filas anteriores y se muestra el esqueleto de carga.
- El transporte recibe `signal` y `expectedUserId`. Después del JSON, en `catch` y en `finally`, se comprueban identidad, selección y cancelación. Un transporte que ignore abort tampoco puede aplicar una respuesta antigua.
- Las recargas de altas, ediciones, borrados, suscripciones y sincronización offline leen la selección vigente al terminar la operación. Una recarga forzada sustituye también otra lectura de la misma URL. Los envíos duplicados ordinarios comparten la petición pendiente.
- El bootstrap online y su respaldo local solo aportan filas a su consulta original y no sustituyen una lectura posterior. React selecciona la URL antes de aplicar el snapshot, incluso cuando Auth y el respaldo local resuelven dentro del mismo lote. Salir cancela tanto la lectura como la inicialización.
- Un error vigente permanece visible y permite reintentar. Los errores sustituidos no se propagan a los avisos de las operaciones que ya se guardaron. Una recarga fallida no marca la URL como cargada.

Las rutas HTTP, las escrituras, IndexedDB, el formato del respaldo y los filtros propios de móvil conservan sus contratos. No hay migraciones, cambios de dependencias ni modificaciones a datos históricos.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Suite completa | **934 correctas, cero fallos y cero omisiones**: 923 anteriores más once A09. PostgreSQL real local y Auth ficticia. [Log](tests-local.log). |
| A09 dirigida | **Once correctas**, con transporte diferido que ignora cancelación. [Prueba](../../../tests/expense-reader.test.ts) · [Log](focused.log). |
| Casos A09 | B antes de A; A termina con B pendiente; error antiguo antes/después de B; intervalo de debounce; JSON pendiente; A→B→A; recarga tras mutación con URL actual y misma URL; salida/cambio de propietario; bootstrap; error vigente/reintento y petición compartida. |
| Tipos | Web, pruebas/helpers y contratos negativos correctos. [Web](typecheck.log) · [Pruebas](typecheck-tests.log) · [Contratos](test-types.log). |
| ESLint | Cero errores y dos advertencias previas: `loadSubscriptions` sin uso y TanStack/React Compiler. [Log](lint.log). |
| Navegador escritorio | A 1280×633, API/BD reales y Auth ficticia: B responde antes de A; error antiguo posterior a B sin diálogo/alerta; A termina mientras B conserva el esqueleto. El transporte ignora deliberadamente la cancelación. [Resultados](browser-desktop.json) · [Captura](desktop.png). |
| Navegador móvil | A 390×844: consulta de todos los días pendiente, selección del 28/10 vacía responde primero, respuesta anterior con filas llega después sin reemplazar el vacío. [Resultados](browser-mobile.json) · [Captura](mobile.png). |
| Respaldo offline | Se simula `navigator.onLine = false`, se vuelve a Gastos con sesión ficticia y respaldo previamente guardado; aparecen los dos gastos locales y no queda un esqueleto pendiente. No se comprueba aquí la entrega completa del service worker. [Resultado](browser-offline.json) · [Captura](offline.png). |
| Build predeterminado | Turbopack falla por `Operation not permitted` al crear proceso/abrir puerto, también fuera del sandbox. No se declara correcto `pnpm build`. [Intento](build.log) · [Reintento](build-escalated.log). |
| Build alternativo | **Webpack correcto**, con comprobación TypeScript y generación de páginas. Conexiones locales y Auth ficticia explícitas. [Log final](build-webpack-escalated.log). El [intento dentro del sandbox](build-webpack.log) falló al leer la salida de `tsc --showConfig`. |
| BD | 42 migraciones existentes aplicadas a `afp_test_a09`. No hay cambios de esquema; no se repite `db:verify`. [Deploy](migrations-local.log). |
| Revisión | `git diff --check` correcto. README, bitácora e informe actualizados. Los diagnósticos y resultados históricos se conservan. |

[Resumen y huellas de fuentes](verification.json).

## Reproducción

Preparar PostgreSQL desechable con el procedimiento del README; usar la BD `afp_test_a09`:

```bash
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a09 \
  pnpm exec prisma migrate deploy
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a09 \
  pnpm test
pnpm test expense-reader.test.ts
pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
```

Para navegador, iniciar el fixture con `AFP_TEST_DATABASE_URL` local, `AFP_UI_TEST_REAL_SETTINGS=1` y `node --import tsx tests/helpers/money-browser-server.ts`. Entrar en `http://127.0.0.1:4216/login` como `money-qa@example.test` con una contraseña ficticia de al menos seis caracteres. Crear dos gastos del 29/10/2026: `Alpha A09` por $11.25 y `Beta A09` por $22.50, categoría ficticia `Categoría A09`.

En escritorio, ejecutar [browser-race.js](browser-race.js) en la página de Gastos. Buscar `Alpha` y después `Beta`, esperando a que cada petición aparezca en `window.__a09.pending`. Resolver B y después A con `.release()`. Repetir con `__a09_error` y `Beta`, liberando el error antiguo con `.release(true)`, y con A resuelta mientras B sigue pendiente. Verificar filas, alertas y esqueleto.

En móvil, ejecutar [browser-mobile.js](browser-mobile.js), quitar los filtros y seleccionar el día 28/10. Esperar ambas peticiones en `window.__a09Mobile.pending`, liberar primero el día vacío y después todos los días. El listado debe conservar el vacío. Los scripts son instrumentos de diagnóstico, con respuestas PostgreSQL reales y entrega HTTP diferida.

Para compilar con la alternativa documentada, generar Prisma y ejecutar `pnpm exec next build --webpack`, fijando `DATABASE_URL`/`DIRECT_URL` a la BD local y `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` a valores ficticios.

## Límites

Supabase Auth se simula en el navegador y las integraciones. Las pruebas del lector aíslan transporte y callbacks; las de navegador recorren la interfaz, la API real y PostgreSQL local. No se publican cambios ni se comprueba producción. La publicación y aceptación con sesión real siguen pendientes. Los intentos de suite dentro del sandbox no acreditan las integraciones: el log final usa PostgreSQL accesible y no tiene omisiones. No se repiten auditorías de dependencias; A10 conserva su alcance independiente.
