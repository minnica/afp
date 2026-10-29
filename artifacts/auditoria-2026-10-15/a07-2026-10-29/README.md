# A07 · Historial completo de ingresos · 29 de octubre de 2026

Implementación local sobre `eead77a1f345b4e75463a7ff207035fb43e31c6a`. [Hallazgo actualizado](../informe.md#A07). Sin migraciones nuevas, despliegues ni acceso a datos financieros reales.

## Cambio

Antes, 101 ingresos de $10 devolvían solo 100 filas y $1,000, sin forma de acceder al restante. Ahora la API devuelve dos páginas por defecto: 100 y 1 filas, ambas con `totalCount: 101` y `total: 1010`. La pantalla inicia con diez filas y permite cambiar el tamaño.

- `GET /api/incomes` añade `page`, `pageSize`, búsqueda `q`, tipo, fechas inclusivas y orden. Devuelve `incomes`, `total`, `totalCount`, `page`, `pageSize` y `pageCount`; todos los agregados corresponden al conjunto filtrado del propietario autenticado.
- PostgreSQL suma Decimal y cuenta sin cargar el historial en memoria. Agregado y página comparten instantánea `RepeatableRead`. El orden desempata por fecha, creación e ID; una página inexistente se ajusta a la última válida. Vacío: página 1 de 1 y total/conteo cero.
- El cliente exige esos metadatos mediante Zod. Resumen y pies de escritorio/móvil usan la suma completa. Buscar, filtrar, ordenar o cambiar tamaño vuelve a la primera página. El modo de servidor de `DataTable` es opcional; el resto de pantallas mantiene su modo local.
- El hook de Ingresos cancela consultas sustituidas y comprueba vigencia incluso si el transporte ignora la cancelación. Una respuesta o error antiguo no modifica filas, suma ni carga actuales. Las mutaciones recargan los filtros vigentes y ajustan la página tras borrar su última fila.

Contrato detallado y parámetros: [README](../../../README.md#historial-de-ingresos). Implementación: [API](../../../src/app/api/incomes/route.ts), [hook](../../../src/hooks/use-income-history.ts), [pantalla](../../../src/components/ingresos/IngresosContent.tsx), [tabla](../../../src/components/ui/data-table.tsx) y [contrato](../../../src/lib/uiResponseSchemas.ts).

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Suite completa | **891 correctas, cero fallos y cero omisiones**, con PostgreSQL 16 desechable. Conserva las 882 anteriores y añade nueve escenarios A07, incluidos seis subcasos PostgreSQL. [Log](tests.log). |
| Regresiones A07 | Validación de consultas antes de consultar BD, contrato obligatorio, acceso al ingreso 101, suma global entre páginas, centavos `0.10 + 0.20 = 0.30`, filtros combinados y límites inclusivos, búsqueda por relaciones, aislamiento de propietario, orden estable con empates, vacío y eliminación de la última página. [Prueba](../../../tests/income-history.test.ts). |
| Comprobación final dirigida | 47 escenarios A07/autorización correctos, sin omisiones, tras los ajustes finales de mensajes de consulta y orden único de tabla. [Log](focused-tests.log). |
| Tipos | Web, pruebas/helpers y contratos negativos correctos. [Web](typecheck.log) · [Pruebas](typecheck-tests.log) · [Contratos](test-types.log). |
| ESLint | Cero errores; dos advertencias previas: `loadSubscriptions` sin uso en Gastos y TanStack/React Compiler. Se retiró la variable sin uso de Ingresos al modificar su carga. [Log](lint.log). |
| Build predeterminado | Turbopack falla al crear un proceso/abrir un puerto con `Operation not permitted`, incluso al repetir fuera del sandbox. No se cambia el script ni se declara correcto `pnpm build`. [Log](build.log). |
| Build alternativo documentado | Webpack correcto, con comprobación TypeScript y generación de páginas. Conexiones locales y Auth ficticia explícitas. [Log](build-webpack.log). |
| BD local | Las 42 migraciones existentes se aplicaron a `afp_test_a07`. No cambian esquema, SQL ni lockfile. [Log](migrations.log). |
| Navegador | Interfaz y API reales sobre PostgreSQL local, con Auth ficticia. Escritorio a 1440 px y viewport móvil a 390 px: navegación, ingreso 101, total/conteo completos, búsqueda/estado vacío y borrado con ajuste de página. También se inyectaron éxito y error antiguos con retraso de 1,500 ms e ignorando `AbortSignal`: permanece el resultado nuevo. [Resumen](verification.json) · [Escritorio](desktop.png) · [Móvil](mobile.png). |
| Revisión de UI/código | Componentes locales shadcn, etiquetas específicas y filtros móviles de 44 px, foco/formularios/borradores existentes, limpieza de efectos y controles de tabla. Revisión React; detector Impeccable sin hallazgos. [Resultado mecánico](design-detector.json). `git diff --check` correcto. |

## Reproducción

Preparar PostgreSQL local desechable con el procedimiento del README y aplicar las migraciones existentes. Desde la raíz:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a07 pnpm test

# Selección durante desarrollo; no sustituye el cierre completo anterior.
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a07 \
  pnpm test income-history.test.ts api-authorization.test.ts

pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
```

Para compilar con la alternativa documentada, generar Prisma (`pnpm exec prisma generate`) y ejecutar:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://afp-a07.example.test \
NEXT_PUBLIC_SUPABASE_ANON_KEY=afp-a07-public-test \
DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a07 \
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55441/afp_test_a07 \
  pnpm exec next build --webpack
```

La prueba crea sus propios usuarios/datos ficticios y los retira al terminar. Sin `AFP_TEST_DATABASE_URL` omite la integración y no acredita persistencia real. Los escenarios antiguos del script de diagnóstico de auditoría se conservan como antecedentes y no se reescriben para aparentar una reproducción vigente.

## Límites

PostgreSQL es real y local; Supabase Auth está simulado. La emulación de viewport no sustituye un teléfono real, un recorrido de accesibilidad completo ni una medición de rendimiento con grandes volúmenes. La paginación limita las filas enviadas; la suma/conteo siguen recorriendo el conjunto filtrado en PostgreSQL.

El fixture de desarrollo presentó incidencias transitorias durante recargas/recompilación: una advertencia de actualización React previa al montaje y un HTTP 500 por JSON incompleto; al recargar se completó el flujo. Se repitió la aceptación con el fixture compilado, incluida la cancelación y el borrado final: sin mensajes de consola ni errores de página. Las capturas finales corresponden a este fixture compilado. El resumen distingue ambos entornos. No se certifica un entorno remoto ni se corrige aquí la carrera de Gastos A09 o la validación de escrituras A08.

Publicación y aceptación con Supabase Auth real permanecen pendientes.
