# Auditoria de rendimiento AFP

## Diagnostico

El cuello de botella principal estaba en codigo de inicializacion, no en Vercel ni en Supabase como causa primaria.

Evidencia medida en local contra Supabase:

- `POST /api/setup-user`: 6.6 s antes del cambio.
- `GET /api/expenses`: ~474-927 ms, payload ~296 KB.
- `GET /api/card-cycles`: ~432 ms, payload ~270 KB.
- `GET /api/dashboard`: ~425 ms, payload ~339 KB.
- Consultas simples Prisma/Supabase: ~70-90 ms.
- Primera conexion Prisma/Supabase: ~575 ms.
- La app usa el pooler de Supabase (`aws-1-us-west-1.pooler.supabase.com:6543`), asi que no parece ser un problema principal de conexion directa en Vercel.

La causa de los ~8 s por page era la suma de:

- `setup-user` ejecutandose en cada page.
- `setup-user` hacia 16 upserts secuenciales por navegacion.
- Las pages bloqueaban la UI hasta terminar sesion, setup y carga de datos.
- `/gastos` hacia seis llamadas de datos iniciales desde el cliente.
- Endpoints pesados devuelven historial completo y relaciones completas.
- Dashboard y card-cycles recalculan agregados en memoria sobre arrays completos.

## Cambios implementados

- `src/app/api/setup-user/route.js`
  - Reemplazados loops secuenciales por una transaccion con `user.upsert`, `category.createMany({ skipDuplicates: true })` e `incomeType.createMany({ skipDuplicates: true })`.
  - El endpoint sigue siendo idempotente, pero ahora evita 16 rondas secuenciales a la BD.

- `src/lib/userSetup.js`
  - Nuevo helper `ensureUserSetup(user)`.
  - Cachea setup por usuario en memoria y `sessionStorage`.
  - Evita repetir `POST /api/setup-user` en cada navegacion.

- Componentes de pages autenticadas
  - Sustituyen el bloque repetido de `fetch("/api/setup-user")` por `ensureUserSetup(session.user)`.

- `src/app/login/page.js`
  - Ejecuta `ensureUserSetup(data.user)` despues de login exitoso y antes de navegar a `/gastos`.

- `src/app/api/gastos/bootstrap/route.js`
  - Nuevo endpoint `GET /api/gastos/bootstrap?userId=...`.
  - Carga settings, cards, expenses, receivables, payables y subscriptions en paralelo desde servidor.

- `src/components/gastos/GastosContent.jsx`
  - La carga inicial usa una sola llamada a `/api/gastos/bootstrap`.
  - Se elimino el waterfall inicial de seis fetches desde el browser.
  - La pantalla abre filtrada al dia actual.
  - Los filtros de fecha, mes, categoria, concepto, metodo/tarjeta y monto consultan `/api/expenses` en servidor.
  - Se reemplazo el spinner inicial por skeletons con dimensiones similares al formulario y tabla reales.

- `src/components/layout/PageSkeleton.jsx`
  - Nuevo skeleton generico reutilizable para pantallas autenticadas.
  - Reemplaza spinners de carga inicial en dashboard, tarjetas, suscripciones, ingresos, configuracion, compras a meses, cuentas por cobrar y cuentas por pagar.
  - Incluye variantes para dashboard, settings, listas y pantallas formulario-tabla.

- APIs de datos principales
  - Se agregaron `select` minimos en gastos, bootstrap, settings, cards, subscriptions, compras a meses, ingresos, cuentas por cobrar y cuentas por pagar.
  - Las actualizaciones internas de estado de cuentas por cobrar/pagar usan agregaciones `_sum` en vez de cargar listas completas solo para sumar.

- `src/app/api/dashboard/route.js`
  - Se agregaron selects minimos para tarjetas, ciclos, gastos, suscripciones, compras, ingresos, categorias y cuentas por cobrar.
  - Se preagruparon gastos por mes y registros por tarjeta para reducir filtros repetidos sobre el historial completo.

- `src/app/api/card-cycles/route.js`
  - Se agregaron selects minimos y preagrupacion por tarjeta.
  - La lista de ciclos devuelve resumen sin desglose detallado.
  - El desglose se carga bajo demanda con `cycleId`/`includeBreakdown=true`.

- `src/components/tarjetas/TarjetasContent.jsx` y `CyclesDataTable.jsx`
  - El dialogo de desglose ahora pide el detalle del ciclo seleccionado al abrirse.

## Validacion posterior

- `npm run lint`: pasa con 1 warning de TanStack Table/React Compiler en `src/components/ui/data-table.jsx`.
- `npm run build`: pasa.
- Medicion local contra Supabase despues del cambio:
  - `POST /api/setup-user`: ~369 ms en caliente.
  - `GET /api/gastos/bootstrap` filtrado por dia actual: ~338 ms en caliente, ~38 KB.
  - `GET /api/expenses` filtrado por dia actual: ~160 ms en caliente, ~2 KB.
  - `GET /api/dashboard`: ~188-229 ms en caliente, ~307 KB.
  - `GET /api/card-cycles`: ~369 ms en caliente, ~77 KB.
  - `GET /api/card-cycles` con desglose individual: ~226 ms, ~4 KB.

## Siguientes optimizaciones recomendadas

- Reducir aun mas `GET /api/expenses` con paginacion si se quiere navegar historico muy grande sin traerlo completo al elegir "Todos los meses".
- Reducir `GET /api/dashboard` con agregaciones SQL si el volumen de datos crece mucho mas.
- Mejorar UX de carga:
  - Mostrar shell/sidebar inmediatamente.
  - Usar skeletons por seccion en lugar de spinner global para toda la page.

## Criterios de aceptacion

- `POST /api/setup-user` debe bajar de segundos a cientos de ms o menos en usuarios ya existentes.
- Navegar entre pages despues del primer setup no debe volver a disparar `POST /api/setup-user`.
- `/gastos` debe cargar con una sola llamada inicial de datos.
- `npm run build` debe pasar.
- `npm run lint` debe revisarse; antes de esta auditoria ya tenia errores existentes en `TarjetasContent.jsx` y `use-mobile.js`.
