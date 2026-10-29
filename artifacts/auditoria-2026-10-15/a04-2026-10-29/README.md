# A04 · Día financiero de México · 29 de octubre de 2026

Implementación y verificación locales sobre `ec11d0f07f28efc0a14ebaf02b82695934141401`. No hubo publicación ni cambios de servicios remotos. [Hallazgo actualizado](../informe.md#A04).

## Cambio

[`financialDates.ts`](../../../src/lib/financialDates.ts) distingue las fechas bancarias (día UTC almacenado) del instante actual (día en `America/Mexico_City`). El estado de un corte, su persistencia al editar, los avisos y las leyendas comparten esa política. No se desplazan ni reescriben las fechas existentes.

Con vencimiento el 15 de octubre, `2026-10-16T00:01:00Z` sigue siendo el día 15 en México: devuelve `PAYMENT_PENDING`. A `2026-10-16T06:00:00Z` cambia a `OVERDUE`. Un pago parcial conserva su saldo, y cero o liquidado no vence. La hora guardada en la fecha bancaria no adelanta ni retrasa el día límite.

Dashboard envía `clientDate` como fecha civil de México y rechaza valores vacíos, imposibles o con hora. Sin parámetro usa el reloj del servidor interpretado en México. Su mes financiero, los pagos seleccionados, el consumo vigente, el mes de ocultación de avisos y los encabezados de presentación siguen esa zona. El temporizador del navegador busca la próxima medianoche mediante reglas IANA, con comprobaciones de cambios históricos de offset.

Mi dinero y Calendar reutilizan el helper. Los avisos Android conservan el instante real; `timeZone` sigue validándose por compatibilidad, pero la zona del teléfono no cambia el día financiero de AFP.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Suite completa | **882 correctas, cero fallos y cero omisiones**, con PostgreSQL 16 local desechable: 871 anteriores y once regresiones nuevas, 583 pruebas de primer nivel y 299 subcasos. [Log](tests.log). |
| Matriz por zona de proceso | **UTC, México, Tokio y UTC+14 correctos**. Ejecuta las mismas fuentes, instantes UTC explícitos y expectativas de API/presentación en cada proceso. Incluye la nueva integración PostgreSQL. La selección específica tiene 13 pruebas externas correctas, sin omisiones. [Log](timezones.log). |
| Persistencia real A04 | PATCH → estado guardado en PostgreSQL → listado de Tarjetas → Dashboard sin `clientDate` → aviso, antes/después de medianoche de México, en día ordinario, fin de mes y fin de año. Se ejecuta en la suite y en los cuatro procesos. [Prueba](../../../tests/financial-day-integration.test.ts). |
| Tipos web | `pnpm typecheck` correcto. [Log](typecheck.log). |
| Tipos de pruebas | `pnpm typecheck:tests` correcto, incluidos ambos archivos nuevos. [Log](typecheck-tests.log). |
| Contratos negativos | `pnpm test:types` correcto. [Log](test-types.log). |
| ESLint | Cero errores y las tres advertencias preexistentes: variable sin uso en Gastos, variable sin uso en Ingresos e incompatibilidad del compilador con `useReactTable`. [Log](lint.log). |
| Build predeterminado | **Bloqueado por el entorno**: Turbopack falla al crear un proceso/abrir un puerto con `Operation not permitted`. Persistió tras solicitar ejecución fuera del sandbox. No se cambió el script de build ni se declara correcto ese comando. [Log](build.log). |
| Build alternativo documentado | `pnpm exec next build --webpack` **correcto**, con comprobación TypeScript, generación de páginas y trazas. Conexiones locales y Auth ficticia explícitas. [Log](build-webpack.log). |
| Base local | Las 42 migraciones existentes se aplicaron a `afp_test_a04` en un contenedor desechable. No se añadió SQL ni se modificó el esquema. [Log](migrations.log). |
| Revisión | `git diff --check` correcto. Componentes revisados según las convenciones shadcn y buenas prácticas React: política de fecha derivada sin nuevo estado duplicado, temporizador con limpieza, sin cambios de composición, foco o estilos. |

## Reproducción

Desde la raíz, con dependencias instaladas y una base local desechable migrada como indica el README:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a04 pnpm test

# La prueba de fechas inicia automáticamente los cuatro procesos por zona.
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a04 \
  pnpm test financial-dates.test.ts payable-notices.test.ts

pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
```

Para reproducir el build alternativo, generar antes Prisma (`pnpm exec prisma generate`) y ejecutar:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://afp-a04.example.test \
NEXT_PUBLIC_SUPABASE_ANON_KEY=afp-a04-public-test \
DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a04 \
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a04 \
  pnpm exec next build --webpack
```

La selección sin `AFP_TEST_DATABASE_URL` omite la integración PostgreSQL y no acredita persistencia real. Los fixtures previos de fechas locales se convirtieron a instantes explícitos de México; las expectativas de consumo que antes cambiaban a medianoche UTC ahora cambian a medianoche México. Se conserva la cobertura anterior de importes, transacciones y avisos.

## Límites

PostgreSQL es real y desechable; Supabase Auth y los transportes externos están simulados. No se verificaron una sesión Supabase real, un teléfono, un recorrido de navegador ni el entorno publicado. La actualización diaria se comprueba con el helper temporal y revisión del efecto React, no con un navegador abierto a medianoche. El build Turbopack debe repetirse en un entorno que permita sus procesos y puertos.

Los estados históricos no se reescriben en lote: las lecturas derivan el estado actual y las ediciones guardan el recalculado. No hace falta una migración de datos para aplicar la política. Publicación y aceptación autenticada permanecen pendientes.
