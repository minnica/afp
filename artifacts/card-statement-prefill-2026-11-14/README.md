# Avisos de corte → estado de cuenta y fechas reales

Implementación local del 14 de noviembre de 2026. Sin publicación, migraciones, dependencias nuevas ni cambios de datos personales. Pruebas con PostgreSQL desechable, usuario y operaciones ficticios; Auth simulada en el fixture de navegador.

## Comportamiento

- Los avisos web `CUT_CYCLE` y `CUT_CYCLE_UPCOMING` transmiten el identificador explícito del ciclo en `/tarjetas?statementCycleId=…`. Dashboard y cabecera móvil comparten el enlace.
- La consulta autenticada `GET /api/card-cycles?cycleId=…` recupera el ciclo vigente, aunque no esté en el año o página visibles. La URL no contiene importes, nombres ni fechas sugeridas.
- El formulario «Estado de cuenta» prepara el monto bancario existente y las fechas actuales de inicio, corte y límite de pago. El monto ausente queda vacío; no se copia la estimación. Todos son editables y los errores aparecen junto al campo.
- «Guardar estado de cuenta» utiliza `UPDATE_STATEMENT` con las tres fechas. Una única transacción bloquea el ciclo por propietario, confirma las fechas y guarda los cuatro campos. Conserva pagos, devoluciones y sus restricciones. Las llamadas anteriores sin fechas mantienen su comportamiento.
- Abrir y cerrar no escriben. La navegación consume la intención después de preparar el formulario; cerrar y recargar no lo reabren. Un corte no disponible muestra un mensaje y permite reintentar.
- Una lectura fallida después de un PATCH confirmado se informa como cambio guardado con listado pendiente de actualizar.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types` | Correctos |
| `pnpm lint` | Sin errores; tres advertencias previas fuera del alcance |
| `pnpm build` | Compilación de producción correcta, incluida `/tarjetas` con Suspense |
| Pruebas focalizadas con PostgreSQL | 30 correctas, sin omisiones |
| `pnpm test` con PostgreSQL | 1,196 correctas, sin fallos ni omisiones |
| `pnpm db:verify` | Reconstrucción y actualización correctas; 46 migraciones y 46 tablas con RLS; regresiones sin fallos ni omisiones |
| Detector de diseño | Sin hallazgos en los componentes modificados |
| Navegador | API y persistencia reales locales; consola sin errores de ejecución |

Las nuevas regresiones cubren identidad del aviso, ausencia de estimaciones en el enlace, importes y fechas imposibles, cero, orden de fechas, guardado conjunto, propiedad, rollback después de escritura real, compatibilidad de devoluciones y lectura histórica.

## Recorrido comprobado en navegador

| Frontera | Evidencia |
| --- | --- |
| Aviso → Tarjetas | Clic en «Tarjeta cortada» desde Dashboard abre el formulario del ciclo 11/2026 |
| Tarjetas → API | GET por `cycleId` autenticado; el formulario inicia con monto vacío y fechas del ciclo |
| Formulario → PostgreSQL | Se capturó `1234.56` y se modificaron las tres fechas mediante los calendarios |
| PostgreSQL → interfaz | Lectura independiente confirmó monto `1234.56`, inicio `2026-10-16`, corte `2026-11-15`, límite `2026-12-05` y confirmación de fechas; el listado reflejó los valores |
| Cabecera móvil → mismo destino | Desde Tarjetas, el aviso «Corte mañana» abre el mismo formulario con los valores guardados |
| Cerrar → recargar | El diálogo permanece cerrado y la URL ya no contiene `statementCycleId` |
| Ciclo fuera del listado | El ciclo 12/2025 se abre con `345.67` y fechas de 2025/2026 mientras el listado conserva 2026 |
| Enlace no disponible | Muestra «Este corte ya no está disponible» y «Reintentar», sin abrir un formulario vacío |
| Móvil pequeño | A 375×667 no hay desbordamiento horizontal; a 667×375 el contenido desplaza dentro del diálogo y Guardar queda visible |

Capturas: [escritorio](desktop-form.png) · [móvil](mobile-form.png). Corresponden al navegador local de desarrollo, con viewport de escritorio y emulación móvil. No acreditan pruebas de servicios autenticados de producción ni del selector nativo en un teléfono real.

Los logs de esta carpeta conservan las ejecuciones finales; el fixture de navegador y el contenedor de PostgreSQL se retiran al terminar.

Extensión posterior: [inicio del siguiente ciclo desde el corte real confirmado](cycle-starts/README.md), con propagación atómica y respeto de fechas ya confirmadas.
