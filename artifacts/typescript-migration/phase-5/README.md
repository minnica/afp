# Fase 5 — Captura Android, Calendar y offline

Implementada sobre el commit indicado en [execution.json](execution.json), entre el 27 y el 28 de octubre de 2026. Sin publicación, activación de reglas, cambios de APK, esquema, SQL ni dependencias.

## Alcance y compatibilidad

**53 módulos convertidos de JS a TS**, incluidos los 16 handlers restantes. Se añadieron seis módulos de contratos y lectura de datos, además de pruebas de tipos y regresiones.

- **Captura:** protocolo Android v1, parsers, identidad, políticas, revisión, conciliación, piloto, prioridad Wallet/respaldo, pagos, transferencias, retiros, débito, devoluciones, avisos Android y comprobantes. Consultas y transacciones derivan sus tipos de Prisma. Los comandos distinguen resoluciones, destinos y pagos; los estados del dispositivo tienen variantes explícitas. No cambian paquetes admitidos, credenciales `Capture`, fechas, recibos, bloqueos ni reglas de activación.
- **Calendar:** OAuth, preferencias, agenda, paleta, transporte de Google, sincronización y trabajadores. El transporte valida campos externos antes de usarlos. Se conservan identificadores deterministas, revisión por cambios, cuotas, locks, continuidad de lotes, desconexión y cifrado AES-256-GCM `v1` ligado al propietario.
- **Offline:** `offlineExpenses.ts` y contratos de entradas/respuestas. Las lecturas preservan cargas parciales históricas y metadatos; los UUID no se regeneran al recuperar IndexedDB. Se conserva `afp-offline-expenses`, versión **1**, los almacenes `expenses`/`legacyImports`, sus claves e índice, importación aditiva y copia de localStorage. La suscripción de Gastos se extrajo a `offlineExpenseObserver.ts`, conservando dependencias de filtros, lecturas obsoletas, recargas y limpieza al cambiar de cuenta. Su consumidor JSX mantiene los mismos callbacks.

`captureJson.ts` valida campos sin reordenar ni reescribir los objetos originales. Esto conserva las comprobaciones optimistas basadas en `JSON.stringify`, los recibos y las notas de análisis históricas que no contienen una interpretación completa. Las aserciones locales corresponden a estructuras ya validadas, grupos de regex, cardinalidades comprobadas o referencias protegidas por los locks de la transacción. No se relajaron TypeScript, ESLint ni el build.

La corrección de un gasto con débito reutiliza su transacción mediante un coordinador mínimo marcado explícitamente como `existing`. El cambio tipa el adaptador anterior sin abrir otra transacción ni cambiar los bloqueos de Mi dinero. `ApiAccessError` declara el `retryAfter` que Captura ya utilizaba.

## Verificación

Los tres lotes se verificaron **secuencialmente**, con PostgreSQL local desechable, Auth ficticia y Google simulado. [execution.json](execution.json) conserva comandos, tiempos y resultados; `verify.py` reproduce las cinco verificaciones obligatorias por lote. El lote `offline-final` corresponde al estado final, incluidas las regresiones adicionales.

| Comprobación | Evidencia |
| --- | --- |
| `pnpm typecheck` y `pnpm test:types` | Configuración estricta; 19 casos negativos nuevos entre Captura, Calendar y offline |
| `pnpm lint` | Sin errores; se conserva la advertencia previa de TanStack Table |
| `pnpm test` con PostgreSQL | **849 correctas, 0 fallos y 0 omisiones**; [log final](offline-final-1-test.log) |
| `pnpm build` | Build con comprobación TypeScript por cada lote |
| Compatibilidad con JS anterior | [19 interpretaciones, agenda y payloads idénticos](compatibility.json) |
| Cifrado histórico | Credencial ficticia anterior legible en TS y credencial nueva legible en JS; otro propietario no puede descifrarla |
| Referencia financiera de fase 0 | [12 respuestas idénticas](transfer-reference.log) |
| Reconstrucción y actualización de PostgreSQL | [42 migraciones y 45 tablas con RLS](db-verify.log) |
| Integridad de esquema, SQL y lockfile | Hashes iniciales/finales en `execution.json` |

Las regresiones existentes conservan eventos repetidos, concurrencia, pausa/revocación, aislamiento por propietario, conciliación, fechas bancarias/recepción, prioridad Wallet, pagos y devoluciones. Calendar mantiene OAuth de un solo uso, contenido/identidad de eventos, cuotas, revisiones, desconexión y recuperación tras perder respuestas de Google.

Las pruebas nuevas cargan directamente el [formato IndexedDB v1 anterior](../../../tests/fixtures/offline/expenses-v1.json), sin pasar por el alta nueva. Verifican respuesta perdida, repetición del mismo UUID/cuerpo, dos pestañas, metadatos y otra cuenta intacta. El observador ignora lecturas antiguas y deja de publicar al desmontar. Una prueba de comportamiento ejecuta `public/sw.js` directamente y comprueba que las API, incluso al navegar a ellas, no pasan por caché.

## Navegador real

Se utilizó la skill `agent-browser` con el [servidor offline aislado](../../../tests/helpers/offline-browser-server.cjs). El fixture entrega los módulos TS como JavaScript ESM con esbuild; no copia credenciales ni contacta Supabase.

1. Antes de convertir la cola se crearon entradas usando el módulo **JavaScript anterior**, para dos propietarios, y una copia antigua en localStorage. [Entradas originales](offline-before.json).
2. Tras servir TypeScript se recuperaron los mismos campos/UUID. Una confirmación truncada mantuvo el pendiente para reintentar. [Lectura y error recuperable](offline-after-read.json).
3. El reintento usó el mismo UUID y dejó un único recibo. La cola anterior de localStorage se importó/sincronizó y conservó su copia; la otra cuenta permaneció intacta. [Sincronización y versión de BD](offline-synchronized.json).
4. Otra pestaña recibió la confirmación con el observador real. [Cambios entre pestañas](offline-cross-tab.json).
5. Dos sincronizaciones concurrentes, con la primera respuesta retenida por el servidor, enviaron **un solo POST** bajo Web Locks. [Resultado](offline-web-locks.json).

El primer intento de simular pérdida cerrando el socket fue reintentado automáticamente por Chromium: hubo dos peticiones con el mismo UUID y un único recibo. Se hizo determinista el fixture devolviendo JSON truncado después de guardar. Se restauró exactamente la entrada original guardada, sin cambiar su UUID, y se repitió el escenario.

## Incidencias de implementación y límites

Las comprobaciones iniciales detectaron una validación demasiado estricta del historial de análisis; se amplió para aceptar las notas antiguas sin interpretación. Se añadió una regresión de segunda edición que utiliza el orden de claves devuelto por PostgreSQL. El descubrimiento de autorización mantenía excepciones literales `.js` para callback/cron: ahora son independientes de la extensión, conservando sus pruebas específicas de OAuth/secreto. Un ajuste del tipo del coordinador mantuvo el rechazo estático de clientes transaccionales sin el adaptador explícito. Las ejecuciones iniciales fallidas figuran en el manifiesto; algunos logs de desarrollo fueron reutilizados antes de añadir nombres únicos por intento.

Se conservan las advertencias previas de `pg` y TanStack. No se verificaron proveedores reales ni una recepción desde el teléfono físico. La equivalencia del contrato y las pruebas nativas existentes no requieren otra APK por esta conversión. El interior de las pantallas, hooks y UI JSX sigue pendiente de fase 6; estas evidencias verifican la cola y su consumidor de eventos, no todos los formularios de la aplicación. El fallback de extensiones del cargador de pruebas sigue reservado para fase 7. `public/sw.js` continúa siendo JavaScript servido directamente.

## Reproducir

Crear y migrar una base local desechable como indica el README y ejecutar:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55445/afp_test_phase5 \
  python3 artifacts/typescript-migration/phase-5/verify.py offline-final

node artifacts/typescript-migration/phase-5/compare-contracts.cjs

node tests/helpers/offline-browser-server.cjs
```

El servidor usa `http://127.0.0.1:4192`, IndexedDB real y recibos ficticios en memoria. El escenario `perdida` conserva el recibo y trunca su primera respuesta; `cierre` espera a `/release`. La importación histórica y concurrencia también se reproducen en la suite Node. Detener servidor, navegador y contenedor al terminar.
