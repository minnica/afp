# A08 · Validación semántica de entradas manuales · 29 de octubre de 2026

Implementación local sobre `5d4683cf39c5daca21107a6db3f0cdacef471e1e`. [Hallazgo actualizado](../informe.md#A08). Datos ficticios y PostgreSQL 16 desechable; sin publicación ni acceso a datos financieros reales.

## Cambio

Gastos e Ingresos aceptaban una fecha imposible, más de dos decimales y un concepto que quedaba vacío al recortarlo. Ahora cada uno de esos casos devuelve `400`, también al editar. El servidor comparte las comprobaciones de [financialValidation.ts](../../../src/lib/financialValidation.ts):

- Fechas bancarias `YYYY-MM-DD` que conservan su día al interpretarse en UTC. `2024-02-29` pasa; `2026-02-30`, `2026-02-29`, `2100-02-29`, meses/días inexistentes y formatos ambiguos se rechazan. No se cambia la política de vencimientos de México de A04.
- Importes numéricos o cadenas decimales con hasta dos decimales y valor absoluto máximo de **$9,999,999,999.99**, compatible con `Decimal(12,2)`. Las cadenas con comas, espacios o notación científica se rechazan. No se redondea `10.123` para aceptarlo. Cada operación conserva sus restricciones de signo y cero.
- Nombre, concepto y fuente presentes con contenido después de `trim`. El cuerpo se valida sin recortarlo ni convertir importes; los handlers recortan el texto al guardar.

[financialContracts.ts](../../../src/lib/financialContracts.ts) aplica las comprobaciones a Gastos, Ingresos, cuentas por cobrar/pagar, MSI, suscripciones, ciclos, tarjetas y catálogos. Los campos opcionales conservan ausencia, `null` o cadena vacía cuando su operación lo permite. Una desactivación acepta día bancario o el instante ISO enviado por la interfaz, siempre con día real. Los errores semánticos usan mensajes en español y los tipos incorrectos conservan el mensaje «Datos no válidos.».

Mi dinero y transferencias, saldos de tarjetas y revisión/conciliación de Captura reutilizan las mismas comprobaciones básicas. El servicio de cobros valida también el importe cuando recibe una llamada interna. Un total de conciliación inválido revierte la transacción completa, sin dejar el registro creado por `upsert`.

El lector conserva valores, campos adicionales y orden del cuerpo HTTP. Los recibos idempotentes siguen distinguiendo contenido diferente: reenviar el mismo gasto con el mismo UUID devuelve el mismo resultado; cambiar su concepto, incluso solo los espacios originales, devuelve conflicto. Las entradas inválidas no consumen un UUID ni crean recibos. No se modifican registros históricos, esquema, SQL ni dependencias.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Suite completa | **923 correctas, cero fallos y cero omisiones**: 891 anteriores más 32 A08. PostgreSQL local real y Auth ficticia. [Log](tests.log). |
| A08 dirigida | **32 correctas, cero omisiones**: seis pruebas de primer nivel, 17 subcasos POST/PATCH y nueve PostgreSQL. [Prueba](../../../tests/financial-validation.test.ts) · [Log](focused-tests.log). |
| Rechazo en rutas | Fechas, importes y texto inválidos en diez familias de API, incluidas altas y ediciones, sin acceder a persistencia en las rutas del contrato financiero. |
| Persistencia | Altas/ediciones reales de gastos, ingresos, deudas, MSI y suscripciones; conservan centavos, fecha bisiesta, texto recortado y campos opcionales. Entradas inválidas no alteran las filas. También se verifica el máximo monetario, recibos, estado cero de corte y rollback del cotejo de Captura. |
| Tipos | Web, pruebas/helpers y contratos negativos correctos. [Web](typecheck.log) · [Pruebas](typecheck-tests.log) · [Contratos](test-types.log). |
| ESLint | Cero errores y dos advertencias previas: `loadSubscriptions` sin uso y TanStack/React Compiler. [Log](lint.log). |
| Build predeterminado | Turbopack falla al crear un proceso/abrir un puerto: `Operation not permitted`. Se repite fuera del sandbox con el mismo resultado. No se cambia el script ni se declara correcto `pnpm build`. [Intento](build.log) · [Reintento](build-escalated.log). |
| Build alternativo | **Webpack correcto**, con TypeScript y generación de páginas. Conexiones locales y Auth ficticia explícitas. [Log correcto fuera del sandbox](build-webpack-escalated.log). El [primer intento dentro](build-webpack.log) falló al interpretar la salida de `tsc --showConfig`; la consulta directa de esa configuración funcionó y el reintento completó el build. |
| BD | Se aplicaron las 42 migraciones existentes a `afp_test_a08`, sin migraciones nuevas. [Deploy correcto](migrations-local.log). El [primer intento](migrations.log) no pudo conectar dentro del sandbox; se repitió fuera. |
| Revisión | `git diff --check` correcto. README, bitácora e informe actualizados; el diagnóstico histórico se conserva sin reescribir sus resultados. |

El [primer intento dirigido](focused-tests-initial.log) detectó que Zod reordenaba las claves del cuerpo aunque conservaba sus valores. El lector ahora conserva también el orden. Ese intento precede a la corrección y omite PostgreSQL; los logs finales anteriores son la aceptación vigente.

[Resumen de verificación y hashes de fuentes](verification.json).

## Reproducción

Preparar PostgreSQL desechable con el procedimiento del README. Desde la raíz:

```bash
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a08 \
  pnpm exec prisma migrate deploy

AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a08 \
  pnpm test

# Selección para desarrollo, sin sustituir la suite completa.
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a08 \
  pnpm test financial-validation.test.ts

pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
```

Compilación con la alternativa documentada, después de generar Prisma:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://afp-a08.example.test \
NEXT_PUBLIC_SUPABASE_ANON_KEY=afp-a08-public-test \
DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a08 \
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a08 \
  pnpm exec next build --webpack
```

Las pruebas crean y eliminan sus usuarios ficticios. Sin `AFP_TEST_DATABASE_URL`, la prueba PostgreSQL se omite y no acredita persistencia real.

## Límites

No se repitió el recorrido de navegador: el cambio valida entradas de servidor y reutiliza los mensajes de error existentes. Supabase Auth y Google se simulan en las integraciones locales. No se auditan ni corrigen datos históricos; no se publican cambios ni se comprueba producción. La publicación y aceptación con sesión real siguen pendientes. A09 conserva su alcance independiente.
