# Fase 2: transferencias tipadas de formulario a persistencia

Implementada sobre `2ff43a952175563cfab631252282ecbbede959da` el **27 de octubre de 2026, America/Mexico_City** (28 de octubre UTC). Completa el piloto del [plan](../../../docs/plan-migracion-typescript.md). No hubo publicación ni acceso a Supabase personal. Esquema, las 42 migraciones y lockfile conservan los hashes de la fase 1.

## Alcance y fronteras

| Módulo | Responsabilidad | Líneas |
| --- | --- | --- |
| `src/lib/money/transferContracts.ts` | Zod, entradas/salidas de formulario, unión por acción, UUID y respuestas `{ok,id}` / `{ok}` / `{error}` | 42 |
| `src/lib/money/transfers.ts` | Consultas Prisma inferidas, propiedad, fecha desde referencia, escritura y reversión | 36 |
| `src/lib/money/transferClient.ts` | Cliente tipado por acción, cuenta esperada, cancelación y validación de respuesta | 23 |
| `src/components/mi-dinero/transferEditor.ts` | Configuración tipada del formulario y validación del callback JSX | 39 |
| `src/components/mi-dinero/MoneyTransferEditor.tsx` | Props y conexión al editor existente | 18 |

Son **158 líneas TS/TSX**, incluidas 80 de adaptadores de cliente/formulario. No hay `any`, conversiones `as` ni supresiones de tipos en estos módulos. Los ocho casos negativos nuevos están en `tests/types/transfers.ts`: destino obligatorio, variante incompatible, importe validado, recibo incompleto, nombre de campo, callback incorrecto, respuesta de reversión y propietario esperado.

El handler `/api/money/route.js`, `mutateMoney`, `loadMoneyData`, autorización, recuperación, fechas, `MoneyContent`, `MoneyEditor` y las otras acciones continúan en JS/JSX. **Sus interiores no están comprobados estáticamente.** El servicio entrega el cuerpo como `unknown` al módulo TS; este lo valida y recibe `Prisma.TransactionClient`. Las consultas seleccionan los campos necesarios con tipos generados. El formulario valida la proyección desconocida antes de extraer IDs/nombres y valida el callback del editor. El cliente trata el retorno de `apiFetch` como `unknown`, comprueba `Response` y valida el JSON. `schema.js` reexporta el esquema de transferencia para conservar consumidores existentes.

`MoneyEditor` conserva React Hook Form, borrador, UUID, controles, errores y foco. El wrapper no sustituye esas responsabilidades. Se mantiene la recuperación de `apiFetch`; su nueva opción **opcional** `validateResponse` comprueba el éxito dentro del manejo de errores y no llega a `fetch`. Una respuesta inválida entra en el mismo diálogo de recuperación. La política de reenvío automático no cambia: el resultado incierto conserva el aviso «Revisa si se guardó» y el formulario mantiene el UUID para el reenvío manual.

## Compatibilidad

- `POST /api/money`, acciones, UUID, códigos HTTP, mensajes y formas JSON se conservan. La huella sigue calculándose con el cuerpo original antes de Zod; número, texto y propiedades adicionales mantienen identidades distintas. El cliente serializa el comando recibido sin normalizarlo; el formulario ya entregaba importes numéricos tras su resolver.
- El lock por propietario, la consulta del recibo anterior, el movimiento y el recibo nuevo permanecen en la transacción existente. El módulo TS no abre transacciones. Un reintento histórico devuelve su recibo antes de comprobar las reglas actuales.
- Se permiten fechas programadas y el mismo día de la referencia. Se rechazan cuentas iguales, ajenas/inexistentes y fechas anteriores a la referencia. Una conciliación posterior bloquea la reversión con el mensaje anterior. La reversión conserva el movimiento.
- Las consultas nuevas por propietario son deliberadamente acotadas: una al crear y dos al revertir. Temporalmente duplican datos de `loadMoneyData`; evitan afirmar que su resultado JS está tipado. La fase 3 debe tipar esa instantánea y reutilizarla para retirar estas lecturas duplicadas, conservando el orden de validación y el lock.
- No se modifican formatos persistidos, esquema, SQL, dependencias, cálculos de saldo ni interfaz.

## Validación

[execution.json](execution.json) registra commit, comandos, versiones, hashes, códigos de salida y tiempos. [collect.py](collect.py) trabaja en una copia temporal sin `.env` ni dependencias previas, instala con lockfile congelado y usa exclusivamente PostgreSQL local ficticio.

| Comprobación | Resultado | Tiempo |
| --- | --- | --- |
| [Instalación limpia](install.log) | Correcta | 3.288 s |
| [Typecheck](typecheck.log) | Correcto | 4.384 s |
| [Contratos de tipos](type-contracts.log) | Correctos | 3.421 s |
| [Lint](lint.log) | 0 errores, 1 advertencia previa | 16.760 s |
| [Migraciones del entorno de pruebas](migrate.log) | Sin pendientes | 0.970 s |
| [Suite completa](tests.log) | **840 correctas; 0 fallos, 0 omisiones** | 45.187 s |
| [Comparación contra fase 0](transfer-reference.log) | **12 respuestas idénticas** | 0.647 s |
| [Build Turbopack](build.log) | Correcto, incluida comprobación TS | 11.580 s |

La base desechable se creó vacía y recibió el historial completo antes del recolector: [primera aplicación](initial-migrate.log). Se mantienen los 828 escenarios de la fase 1 y se añaden 12 resultados: cuatro pruebas de cliente/frontera JSX y ocho del conjunto de integración (incluido su contenedor).

Las integraciones nuevas comprueban concurrencia, conservación de centavos, repetición/conflicto, rollback, propiedad y fechas. La prueba de rollback escribe realmente movimiento y recibo en PostgreSQL y lanza un fallo después de la inserción del recibo; verifica ausencia de ambos y reutilización del UUID. El log `Money operation failed Error` corresponde a ese fallo deliberado. Se conservan la advertencia de `pg` sobre consultas concurrentes y `react-hooks/incompatible-library` en la tabla compartida. No se silencian.

No se repitió `db:verify`: no cambian sus herramientas, esquema, SQL ni garantías de persistencia. La reconstrucción/RLS ya están acreditadas en fases 0/1; aquí se ejecutaron todas las integraciones con PostgreSQL real local y se compararon los hashes. No se atribuye una ejecución nueva de reconstrucción a esta fase.

Una primera pasada de lint señaló una asignación deliberadamente inválida dentro de una prueba negativa. Se expresó como acceso a propiedad con `void` para comprobar el mismo rechazo sin introducir una asignación insegura; la validación final de la tabla corresponde al estado corregido.

## Navegador → API → datos → respuesta

El [fixture](../../../tests/helpers/money-browser-server.cjs) compiló con Webpack en un directorio aislado y sirvió la interfaz/API reales con Auth ficticia y PostgreSQL local: [log](money-fixture.log). Se usaron `agent-browser` y el procedimiento de `vercel:verification`; no se simularon las escrituras financieras.

Evidencias: [peticiones y verificaciones](browser-checks.json), [consulta posterior de PostgreSQL](browser-persistence.json), [formulario escritorio](transfer-desktop.png), [formulario móvil](transfer-mobile.png) y [recuperación de lectura](refresh-recovery.png).

| Frontera/caso | Evidencia |
| --- | --- |
| UI y teclado | Título enfocado al abrir; selección con Tab/Enter/Home/End; Escape cierra y devuelve el foco a Transferir |
| Formulario → API | Transferencia de 200.25 en escritorio; importe enviado como número y UUID estable |
| API → PostgreSQL | Dos transferencias persistidas en total, una de 200.25 y una móvil de 0.01; seis recibos contando las dos cuentas iniciales |
| Respuesta → saldos | 1000.25/100.10 → 800/300.35 → 799.99/300.36; total 1100.35 |
| Respuesta perdida | Se dejó completar el POST real y se lanzó un error de red solo en el navegador; conserva borrador, comando y UUID; reenvío obtiene el mismo ID |
| Lectura fallida tras guardar | GET simulado con 503: diálogo «Cambio guardado»; reintentar solo lee, sin nuevos POST |
| Móvil | 390 × 844, selectores móviles, alta de un centavo, reversión de ambos movimientos; sin desbordamiento horizontal |
| Historial | Ambos registros conservan `reversedAt`; los recibos en PostgreSQL coinciden con cada respuesta observada |
| Estado final | 1000.25/100.10; total 1100.35; consola sin excepciones de aplicación |

La inspección visual de las capturas confirma que los controles y botones siguen disponibles en ambos tamaños. La instrumentación de prueba interceptó únicamente la respuesta perdida y los GET fallidos; no cambió código de producción. La primera comparación de recibos por `JSON.stringify` se corrigió para comparar valores: PostgreSQL JSONB devuelve las claves en otro orden, sin modificar su contenido. Los IDs y datos de las evidencias son ficticios.

## Esfuerzo y siguientes lotes

[implementation-measurements.json](implementation-measurements.json) registra el intervalo observado desde la creación del primer módulo TS hasta terminar implementación, comprobaciones y documentación inicial; excluye la lectura inicial del repositorio. Es una medida local de esfuerzo asistido, no una estimación de calendario ni tiempo humano exclusivo.

Comparando las ejecuciones de esta máquina con fase 1: typecheck 4.487 → 4.384 s, contratos 3.097 → 3.421 s, lint 16.239 → 16.760 s y build 11.135 → 11.580 s. Son observaciones de una ejecución por fase; instalación y cachés no están controladas para un benchmark. La suite final tarda 45.187 s; el tiempo de fase 1 incluía también reconstrucción de BD y no es directamente comparable.

Se ajustó fase 3 a tres lotes: cuentas/conciliaciones y `loadMoneyData`; rutas/planes y composición del editor; fuentes/rendimientos/presupuestos/proyección. Retirar las fronteras y consultas duplicadas al convertir sus productores/consumidores, conservando los casos de comportamiento y contratos negativos. No extender estos adaptadores con declaraciones globales que oculten módulos pendientes.

## Reproducción

Node 22.23.2, pnpm 10.33.0, Python 3 y PostgreSQL local desechable. No usar una base compartida.

```bash
podman run --rm -d --name afp-ts-phase2 \
  -e POSTGRES_PASSWORD=afp_test_only -e POSTGRES_DB=afp_test_ts2 \
  -p 127.0.0.1::5432 docker.io/library/postgres:16-alpine
podman exec afp-ts-phase2 pg_isready -U postgres -d afp_test_ts2
podman port afp-ts-phase2 5432
```

Esperar disponibilidad y reemplazar `PUERTO`:

```bash
AFP_TEST_DATABASE_URL='postgresql://postgres:afp_test_only@127.0.0.1:PUERTO/afp_test_ts2' \
  python3 artifacts/typescript-migration/phase-2/collect.py
```

El recolector migra la base y ejecuta los comandos de la tabla; elimina su instalación temporal. No ejecuta el recorrido interactivo de navegador. Para repetirlo, en otra terminal:

```bash
AFP_TEST_DATABASE_URL='postgresql://postgres:afp_test_only@127.0.0.1:PUERTO/afp_test_ts2' \
  AFP_CAPTURE_TEST_PRODUCTION=1 node tests/helpers/money-browser-server.cjs
```

Abrir `http://127.0.0.1:4216/login`, con correo `money-qa@example.test` y contraseña ficticia (el fixture simula Auth). Crear dos cuentas sin rendimientos de 1000.25/100.10, referencia de hoy. Repetir los pasos de la tabla: transferencia, respuesta perdida/reenvío, fallo de GET/recuperación, alta móvil de 0.01 y ambas reversiones. Las simulaciones se aplican en el navegador después del POST real y antes de devolver GET, respectivamente. Guardar las nuevas peticiones/observaciones como `browser-checks.json` antes de ejecutar:

```bash
AFP_TEST_DATABASE_URL='postgresql://postgres:afp_test_only@127.0.0.1:PUERTO/afp_test_ts2' \
  node artifacts/typescript-migration/phase-2/verify-browser-data.cjs
```

El verificador exige los IDs de esa ejecución y el usuario ficticio del fixture. Después, cerrar navegador, detener el fixture y `podman stop afp-ts-phase2`. Los proveedores reales Supabase/Google, Android físico y otros módulos de UI no forman parte de esta aceptación. Revisar los diffs de evidencias al repetir; no regenerar la referencia JSON de fase 0 para ocultar diferencias.
