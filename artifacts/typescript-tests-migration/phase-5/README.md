# Fase 5 — Fixtures de navegador y seeds

Fase completada localmente el **28 de octubre de 2026**; [aceptación consolidada](acceptance.json), sobre `f7c76b956bcdafdf6daf8733a3e5da3ad0c5ef45`. Se convirtieron los **siete helpers CJS restantes**, con 285 líneas originales. Todas las pruebas y helpers activos usan TypeScript; los puentes de configuración y descubrimiento permanecen para fase 6.

## Implementación

[inventory.json](inventory.json) relaciona los siete renombres: `next-fixture`, los servidores de Mi dinero, Captura y offline, y los seeds de UI, revisión de Captura y pagos de receptores. Los IDs fijos, datos ficticios, importes, relaciones y formatos se conservan. Las tuplas de enums usan `as const`; los resultados Prisma se infieren del cliente real, y las consultas que pueden devolver `null` se comprueban antes de acceder a ellas.

[fixture-database.ts](../../../tests/helpers/fixture-database.ts) valida protocolo PostgreSQL, host `localhost`/`127.0.0.1`, base `afp_test…` y ausencia de parámetros o fragmentos. La validación ocurre antes de importar clientes o crear directorios. Los seeds desconectan Prisma en `finally`; no cargan `.env`. El seed de receptores conserva la ruta de credencial ficticia anterior y admite `AFP_RECEIVER_TEST_CONTEXT` para elegir un destino propio con permisos `0600`. La verificación usa un archivo temporal, comprueba su forma sin guardar el secreto en evidencias y lo elimina.

[next-browser-fixture.ts](../../../tests/helpers/next-browser-fixture.ts) comparte la infraestructura de ambos servidores Next. Prepara el entorno local antes de cargar Next/Prisma y conserva puertos, Auth ficticia, API reales, opciones de dashboard/settings y HTTPS opcional. Las requests/responses y servidores usan los tipos Node; configuración, cliente Prisma y aplicación Next se derivan de sus bibliotecas. Cierra HTTP/HTTPS, Next y Prisma, y elimina la carpeta temporal al recibir señales o fallar el arranque. Las entradas CLI terminan después de esa limpieza para cerrar también los watchers internos que Next dev deja activos después de `app.close()`.

[next-fixture.ts](../../../tests/helpers/next-fixture.ts) copia únicamente `tsconfig.json`, `package.json`, PostCSS y las declaraciones web de `types/` si existen. No copia `.env`, `.next`, `next-env.d.ts` ajenos ni configuraciones de pruebas. Los servidores regeneran tipos Next en su propia copia y el modo estable compila allí con Webpack.

El servidor offline mantiene el JSON truncado de respuesta perdida, recibos por UUID, respuestas retenidas y liberación explícita. El cuerpo HTTP se recibe como `unknown` y solo se acota su sobre de operación; los módulos de cola y observador siguen siendo los reales, transformados a ESM por esbuild con el transporte ficticio anterior. IndexedDB y Web Locks son APIs reales del navegador.

[browser-fixture.test.ts](../../../tests/browser-fixture.test.ts) añade tres regresiones: rechazo de conexiones ajenas a la BD desechable, copia exclusiva de configuración web y rechazo de servidores/seeds antes de crear recursos. [tests/types/browser-fixtures.ts](../../../tests/types/browser-fixtures.ts) añade seis contratos negativos separados de la ejecución. La selección inválida del ejecutor ahora utiliza el seed `.ts` existente, conservando la comprobación de exclusión de helpers. No se añaden `any`, supresiones ejecutables, conversiones encadenadas ni declaraciones comodín.

## Verificación

[collect.py](collect.py) crea una copia sin secretos, instala con lockfile y usa PostgreSQL desechable ligado exclusivamente a `127.0.0.1`, con imagen fijada por digest. [final/execution.json](final/execution.json) conserva comandos, duraciones y versiones; [final/scenarios.json](final/scenarios.json) compara los escenarios con todas las fases previas de referencia.

| Control | Resultado | Duración |
| --- | --- | --- |
| Instalación con lockfile | Correcta | 3.235 s |
| Migraciones | 42 aplicadas | 2.675 s |
| `pnpm typecheck` | Correcto | 12.537 s |
| `pnpm typecheck:tests` | Correcto | 14.82 s |
| `pnpm test:types` | Correcto | 8.852 s |
| `pnpm lint` | 0 errores; 3 advertencias previas | 47.541 s |
| `pnpm test` | 870 correctas; 0 omisiones | 60.21 s |
| `pnpm build` | Correcto | 21.287 s |
| `pnpm db:verify` | Reconstrucción, actualización y 870 regresiones | 73.719 s |
| Observación de escenarios | Mismos 870 escenarios en orden | 53.933 s |
| Seed de receptores | Datos, relaciones y credencial verificados | 0.447 s |
| Navegador completo (`reference/`) | Tres recorridos correctos | 276.347 s |
| Cierre CLI definitivo (`development/dev-shutdown/`) | SIGINT, SIGTERM y fallo de TLS correctos | — |

Las **870 pruebas** incluyen los **867 escenarios de fase 4**, conservados por archivo, nombre, repetición, orden y jerarquía, y tres regresiones nuevas. También se conservan los 854 escenarios originales, los 863 de fase 2 y los 866 de fase 3. La suite normal, la observación con reporteros y las regresiones PostgreSQL de `db:verify` coinciden, sin fallos, omisiones, cancelaciones ni TODO. La reconstrucción y actualización verifican **42 migraciones y 45 tablas con RLS**.

[final/discovery.json](final/discovery.json) registra **109 pruebas TS y cero CJS**. [final/type-inclusion.json](final/type-inclusion.json) confirma **130 módulos TS** activos de pruebas/helpers/ejecutor, las tres declaraciones específicas de scripts y ESLint estricto. Los trece archivos de contratos de tipos permanecen separados. No quedan helpers CJS; `allowJs: true`, `checkJs: false` y el descubrimiento mixto se retiran en fase 6.

[final/hash-comparison.json](final/hash-comparison.json) conserva los **394 archivos protegidos**, los **672 artefactos históricos** y los **204 archivos de evidencias anteriores de pruebas**. [implementation-hashes.json](implementation-hashes.json) identifica el código y la documentación finales. No cambian fuentes de producto, esquema, SQL, fixtures JSON, service worker, Android, dependencias ni servicios remotos.

## Navegador, seeds y limpieza

[browser.py](browser.py) utiliza `agent-browser` 0.27.0 y Chrome. Los tres servidores se arrancan con sus comandos TS; Mi dinero y Captura compilan en copias temporales y usan el dashboard real local mediante su opción existente. Auth continúa simulada. [reference/browser/](reference/browser/) conserva requests, respuestas, capturas de pantalla, estado de página y consultas de persistencia:

- Transferencia desde el formulario: **$125.50**, cuentas y concepto coincidentes, `POST 200`, UUID estable y un recibo en PostgreSQL.
- Captura ficticia: abrir la propuesta, editar el concepto y guardar sin registrar; `PATCH 200`, corrección persistida y ausencia de gasto creado. El seed conserva nueve tarjetas, 24 alias y tres avisos/eventos ficticios.
- Cola offline: IndexedDB/Web Locks reales, respuesta truncada, UUID preservado al reintentar en otra pestaña y un recibo. El cambio de cuenta conserva el pendiente del propietario anterior. Dos pestañas que sincronizan la misma cola producen **un solo envío y una confirmación**, con notificación de cambios y sin pendientes resucitados.
- Configuración aislada: sin `.env`, pruebas ni configuraciones exclusivas de tests; tipos Next regenerados y compilaciones propias. Sin errores de página, diálogos de recuperación inesperados ni desbordamiento horizontal en los recorridos de aceptación.

[final/receiver-seed.json](final/receiver-seed.json) verifica el tercer seed en otra BD recién migrada: dos tarjetas, dos cortes, dos políticas en observación, un alias y un dispositivo, además de la forma y permisos de la credencial ficticia. La consulta usa los nombres SQL mapeados del esquema. No activa automatizaciones.

[dev-shutdown.py](dev-shutdown.py) verifica los watchers reales de Next dev: Mi dinero recibe `SIGINT`, Captura recibe `SIGTERM`, y otro arranque falla por un archivo TLS inexistente. [development/dev-shutdown/results.json](development/dev-shutdown/results.json) confirma códigos de salida esperados, eliminación de directorios y ausencia de rechazos sin manejar. Los servidores de navegador, procesos hijos, sesiones, contenedores, bases y archivos de credencial temporales del recolector se eliminan al terminar. Los seeds ejecutados individualmente conservan sus datos hasta eliminar su BD desechable.

## Incidencias y límites

[development/incidents.json](development/incidents.json) conserva las incidencias de preparación. El primer recolector pasó instalación, los seis controles, `db:verify`, correspondencia de escenarios y hashes; falló después al consultar el seed de receptores con nombres de modelos Prisma en lugar de sus tablas SQL mapeadas. [initial-validation/](initial-validation/) conserva esa ejecución y su limpieza. Se corrigió únicamente la consulta del recolector.

El primer recorrido automatizado no reconocía snapshots con `[required, ref=…]`; se corrigió el lector. Otro recorrido guardó la transferencia y cerró el diálogo de Captura sin enviar la corrección. Se estabilizó el recolector con viewport explícito, espera de hidratación y desplazamiento al control antes de pulsarlo; la repetición dirigida guardó la corrección. El arranque de Next dev expuso también que sus watchers permanecían activos tras `app.close()`; las entradas CLI ahora terminan después de cerrar recursos. [reference/](reference/) conserva el cierre previo a ese último ajuste; `final/` comprueba las entradas definitivas con los seis controles y PostgreSQL; `development/dev-shutdown/` verifica sus señales y el fallo de arranque. La repetición adicional de navegador en `final/` rechazó los puertos todavía ocupados por el recorrido de `reference/`; esa incidencia conserva su log y no altera las fuentes. [acceptance.json](acceptance.json) relaciona los controles finales, el recorrido completo y el cierre de las entradas definitivas. El último ajuste de las entradas afecta exclusivamente la terminación después de cerrar recursos; los handlers y los helpers de dominio son los mismos del recorrido completo.

Persisten las tres advertencias de lint y el aviso de concurrencia de `pg` ya registrados. El modo dev mostró el aviso previo de actualización de estado durante el arranque; la aceptación de navegador usa compilaciones estables y registra sus errores de página. No se conectan Google, Supabase Auth ni teléfonos reales. El HTTPS opcional conserva sus tipos y comportamiento; el fallo de lectura de TLS se comprueba como caso de limpieza. No se requiere APK nueva ni publicación.

## Reproducción

Con dependencias instaladas, Podman, Chrome y acceso al CLI de navegador, elegir un destino nuevo:

```bash
python3 artifacts/typescript-tests-migration/phase-5/collect.py /tmp/afp-tests-ts5-evidence-new
```

El recolector no sobrescribe salidas. Usa PostgreSQL local desechable y elimina sus recursos. Los puertos 4192, 4208–4209 y 4216–4217 deben estar libres. Para repetir únicamente el navegador con una BD local desechable ya migrada:

```bash
AFP_TEST_DATABASE_URL='<conexión-local-afp_test>' \
  python3 artifacts/typescript-tests-migration/phase-5/browser.py /tmp/afp-ts5-browser-new
```

Los ejecutores antiguos conservan logs, snapshots y código; cuando importan helpers retirados se reproducen en su commit de cierre:

| Ejecutores históricos | Commit de reproducción |
| --- | --- |
| Fase 0 de pruebas | `700afcc842a0d7694972eb28dde04acf8779c8d5` |
| Fase 1 de pruebas | `c0a0a3798a92fc2c0b23281bb95b1a77e32c994f` |
| Fase 2 de pruebas | `dd81d4f80d6f52a32f5189f4412dfe2fdd9abcd1` |
| Fase 3 de pruebas | `429d747d75bd1a7fa7c99bbda5b096800f8f6c93` |
| Fase 4 de pruebas | `f7c76b956bcdafdf6daf8733a3e5da3ad0c5ef45` |
| Ejecutores web dependientes de helpers CJS retirados | `6aad1ab` |

README, producto, ambos planes, bitácora y guía Android reflejan los comandos actuales. La **fase 6 continúa pendiente**.
