# Fase 6 — Interfaz, hooks y páginas

Implementada sobre `39da231760e4ac6a00c8ae32764f65f7eec4230d`, el 28 de octubre de 2026. El [inventario](inventory.json) registra **135 módulos con contenido convertidos a TS/TSX**, con 20 881 líneas originales. Todo el código activo de `src/` está en TypeScript; los 14 archivos JavaScript vacíos siguen inventariados para fase 7.

## Implementación

- Páginas y layout, seis hooks, pantallas y componentes compartidos. Props, refs y eventos derivan de React, Radix/Base UI, TanStack y Recharts. `DataTable` conserva el tipo de sus filas; borradores y setters comparten las claves y valores del formulario. `useCaptureResource` distingue estados inactivo, carga, contenido y error, conservando datos anteriores durante el refresco.
- [Contratos de respuesta](../../../src/lib/uiResponseSchemas.ts) y [cliente UI](../../../src/lib/uiClient.ts) separados del servidor. La validación ocurre dentro de la recuperación de `apiFetch`; el consumidor recibe el cuerpo original, incluidos metadatos, orden de claves y campos omitidos. Se admiten propuestas parciales, historial de análisis nulo y dinero serializado como texto o número.
- Los editores de Captura usan acciones discriminadas y formularios tipados con Zod/React Hook Form. `getCyclePaymentAmounts` separa el cálculo existente de importes del estado de calendario: el detalle de pagos no recibe fechas y no necesita inventarlas. Se mantienen centavos, créditos posteriores al corte y saldo desconocido sin estado de cuenta.
- `components.json` usa `tsx: true`, con los mismos componentes, alias y estilo. El fixture de navegador permite puerto explícito y catálogos reales de la base local. Las referencias literales de pruebas/documentación apuntan a las extensiones nuevas.

El [análisis de imports](client-boundaries.json) recorre 106 entradas cliente y 169 módulos propios alcanzables: ninguna dependencia de ejecución de Prisma, Node o rutas de servidor. Los [110 archivos protegidos](invariants.json) conservan sus hashes: esquema, migraciones, Android, service worker, dependencias, lockfile y configuración estricta.

## Verificaciones

[execution.json](execution.json) conserva comandos, tiempos e intentos; `verify.py` ejecuta secuencialmente los cinco controles obligatorios con PostgreSQL local y variables públicas ficticias. El intento 6 corresponde al código final.

| Control | Resultado y evidencia |
| --- | --- |
| `pnpm typecheck` | Correcto, con `strict` y `noUncheckedIndexedAccess`; [log](6-typecheck.log) |
| `pnpm test:types` | Correcto; nueve casos negativos nuevos de interfaz; [log](6-test-types.log) |
| `pnpm lint` | Sin errores; [log y advertencias](6-lint.log) |
| `pnpm test` | 854 pruebas correctas, sin fallos ni omisiones; [log](6-test.log) |
| `pnpm build` | Compilación y comprobación TypeScript correctas; [log](6-build.log) |
| `pnpm db:verify` | Reconstrucción y actualización desde 13 migraciones; 42 migraciones, 45 tablas con RLS y 853 regresiones correctas; [log](db-verify.log) |

Las integraciones validan los JSON reales de las API financieras, de Captura y del estado de Calendar contra los contratos de interfaz. Las cuatro regresiones del cliente verifican respuestas incompletas, propuestas históricas, metadatos y conservación exacta del JSON usado por las correcciones optimistas. La prueba adicional de importes cubre el detalle de Captura sin fechas; se añadió después de `db:verify` y está incluida en las 854 pruebas finales.

## Navegador

Chromium con `agent-browser`, Auth ficticia, API local y PostgreSQL desechable. El fixture compila una copia aislada con Webpack, sin copiar `.env`. Los [26 recorridos](browser-smoke.json) cubren las 13 pantallas principales a 1440 × 1000 y 390 × 844: datos visibles, sin alertas de recuperación inesperadas, errores de página ni desbordamiento horizontal. [Script](browser-smoke.py), [log](browser-smoke.log) y [errores finales](browser-final-errors.json).

Interacciones verificadas:

1. Alta de un gasto de **$1,250.50** desde el formulario de escritorio, con categoría elegida mediante teclado; la tabla y PostgreSQL conservan los centavos y un solo registro.
2. Borrador móvil con concepto, categoría e importe **38.75**, navegación a Ingresos y regreso: [valores restaurados](draft-restored.json).
3. Guardado sin conexión desde el mismo formulario, mensaje de pendiente y UUID idéntico en `clientId` y `operationId`. Al reconectar hay un solo gasto y recibo en PostgreSQL; IndexedDB conserva versión 1 y queda sin pendientes. [Antes](offline-before-sync.json), [después](offline-after-sync.json) y [registros](browser-data.json).
4. Dos correcciones sucesivas de un aviso, usando «Guardar sin registrar»: [confirmación](capture-correction.json) y corrección persistida en `browser-data.json`. Se conserva el orden devuelto por PostgreSQL para la segunda edición.
5. Respuesta de ingresos deliberadamente inválida: el diálogo «La respuesta llegó incompleta» recibe el foco en su título. Tras retirar la interceptación y reintentar, carga el ingreso real. [Antes](recovery-before.json) y [después](recovery-after.json).
6. Filtro de método de pago mediante teclado, tabla filtrada y cierre del editor con Escape devolviendo el foco a «Editar gasto». [Filtro](filter-keyboard.json), [foco](edit-focus.json).
7. Selección del corte desde el editor móvil de pago: estado de cuenta de 1000, pago previo de 250 y [saldo pendiente de 750](payment-preview.json), calculado directamente con el detalle sin fechas.

Capturas: [Dashboard](dashboard-desktop.png), [Gastos escritorio](gastos-desktop.png), [formulario móvil](gastos-mobile-form.png), [Gastos móvil](gastos-mobile.png), [Análisis móvil](analisis-mobile.png), [Captura móvil](registro-automatico-mobile.png), [corrección](capture-correction-mobile.png), [pago](payment-preview-mobile.png) y [recuperación](recovery-mobile.png).

## Incidencias y límites

Las primeras comprobaciones detectaron un caso negativo de tipos que también disparaba una regla de asignación insegura en ESLint; se corrigió sin desactivar reglas. Las integraciones permitieron ajustar nulos históricos y campos omitidos. La revisión del código evitó normalizar los importes PATCH en el estado de Tarjetas y separó los importes de las fechas de pago. Un intento intermedio detectó que `Omit` sobre un objeto Zod con propiedades adicionales perdía las claves conocidas; se conservó el contrato inferido con su representación monetaria compatible. La prueba nueva de importes requirió comparar objetos serializados porque el cargador los crea en otro contexto VM; el resultado numérico ya coincidía. Los intentos fallidos permanecen en el manifiesto.

El fixture de desarrollo recargaba módulos durante las interacciones; las comprobaciones finales usan su modo compilado y una sesión de navegador nueva. Se corrigió el uso de los localizadores CLI (`--name`), sin modificar controles de la aplicación. Los estados de foco y cierre se comprueban después de las transiciones.

Lint muestra la advertencia previa de TanStack/React Compiler y dos avisos por código sin usar que ahora comprueba TypeScript (`loadSubscriptions`, `activeReceivables`). Persiste la advertencia de `pg` del adaptador Prisma. Los datos sintéticos no completan todas las previsiones, por lo que conservan sus avisos de información incompleta. No se certifican Google/Supabase reales ni recepción desde un teléfono físico. No se publicó ni se modificaron datos remotos.

La fase 7 resolverá los 14 archivos vacíos, `allowJs`, los adaptadores de Mi dinero y los fallbacks de extensiones del cargador. Esos puentes se conservan deliberadamente en esta entrega.

## Reproducir

Preparar PostgreSQL local desechable y aplicar las migraciones según el README principal. Usar conexiones explícitas; los comandos siguientes no toman una conexión personal de `.env`:

```bash
export AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55446/afp_test_phase6
python3 artifacts/typescript-migration/phase-6/verify.py
AFP_MIGRATION_TEST_DATABASE_URL="$AFP_TEST_DATABASE_URL" pnpm db:verify
node artifacts/typescript-migration/phase-6/check-client-boundaries.cjs

node tests/helpers/seed-ui.cjs
AFP_UI_TEST_PORT=4226 AFP_UI_TEST_REAL_SETTINGS=1 \
  AFP_CAPTURE_TEST_REAL_DASHBOARD=1 AFP_CAPTURE_TEST_PRODUCTION=1 \
  node tests/helpers/money-browser-server.cjs
```

El seed recrea únicamente al usuario ficticio `00000000-0000-4000-8000-000000000094` y rechaza bases remotas o que no se llamen `afp_test…`. En `http://127.0.0.1:4226/login`, iniciar sesión con `money-qa@example.test` y una contraseña ficticia. En otra terminal, con `agent-browser` disponible, ejecutar `python3 artifacts/typescript-migration/phase-6/browser-smoke.py` (o indicar el ejecutable mediante `AFP_BROWSER_CLI`). Los pasos de escritura, desconexión y recuperación anteriores se reproducen desde los controles de la interfaz; el script automatiza la navegación y las comprobaciones de cada pantalla. Detener navegador, fixture y contenedor al terminar.
