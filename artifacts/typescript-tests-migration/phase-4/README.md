# Fase 4 — Integraciones y persistencia offline

Cierre local del **28 de octubre de 2026**, sobre `429d747d75bd1a7fa7c99bbda5b096800f8f6c93`. Se convirtieron las **50 pruebas CJS restantes**, con 6 178 líneas originales. Las **108 pruebas ejecutables** usan TypeScript. Los siete helpers CJS de navegador, seeds y preparación de Next continúan en fase 5; los puentes de configuración y descubrimiento se retiran en fase 6.

## Implementación

[inventory.json](inventory.json) relaciona los 50 renombres, los dos helpers nuevos, los cuatro helpers ampliados y el contrato negativo nuevo. Se amplía también `source-loader.test.ts` con una regresión de metadatos de rutas. El alcance comprende parsers, protocolo Android v1, políticas, revisión, conciliación, automatización, recibos y avisos de Captura; OAuth, cifrado, agenda, locks, revisiones y reintentos de Calendar; Auth/HTTP, respuestas de UI, recuperación, IndexedDB, Web Locks, observador offline y ambos contextos `vm` del service worker.

El [mapa de módulos](../../../tests/helpers/source-contracts.ts) vincula **97 rutas** a los exports reales. [source-exports.ts](../../../tests/helpers/source-exports.ts) comprueba sus claves y clases de valor al cruzar `vm`. La función pública `sourceLoader` conserva sus contratos originales; `fixtureSourceLoader` comparte exactamente su evaluación, caché, aislamiento de entorno y comprobación de exports con los dobles mínimos tipados de [integration-fixtures.ts](../../../tests/helpers/integration-fixtures.ts). El adaptador conserva los metadatos Next, como `maxDuration`, con su tipo real y adapta exclusivamente métodos HTTP; el mapa de handlers excluye esos metadatos. Las rutas dinámicas y las lecturas JSON nativas devuelven `unknown`.

Los adaptadores distinguen respuestas mínimas con `.body`/`.status`, respuestas nativas y JSON sin envoltorio. Mantienen objetos, orden de claves, metadatos y campos omitidos; no presentan esos dobles como NextResponse. Las funciones de dominio conservan sus parámetros y resultados reales. Las proyecciones históricas se tipan por dominio y `Sparse` preserva ahora también las firmas de callbacks. Los formatos deliberadamente inválidos pasan por `uncheckedFixture` sin validarlos, completarlos ni normalizarlos antes de la operación probada.

`withFixtureDb` sustituye únicamente la persistencia: los argumentos restantes y el resultado se derivan de la función real. Los interceptores existentes de [financial-persistence.ts](../../../tests/helpers/financial-persistence.ts) conservan el fallo anterior o posterior a la escritura y el reenvío de opciones de cada escenario. Transacciones, consultas, bloqueos, restricciones y rollback siguen ejecutándose en PostgreSQL real. El contenedor de una transacción existente no añade transacciones anidadas.

[notice-fixture.ts](../../../tests/helpers/notice-fixture.ts) modela las colecciones y consultas mínimas de avisos sin inventar un PrismaClient completo. Los proveedores Google/OAuth continúan simulados; el trabajador mantiene sus pruebas de reloj, esperas y finalización. Los eventos `fetch`/`activate` del service worker y sus promesas se comprueban como callbacks de prueba, sin modificar `public/sw.js`.

[boundaries.json](boundaries.json) inventaría 36 usos de fronteras de fixture y **cuatro conversiones locales** nuevas: dos retornos de `Reflect.apply` y las claves/retorno del mapa de delegates de avisos. No hay `any`, supresiones ejecutables, dobles conversiones ni declaraciones comodín en el lote. Los **once casos negativos nuevos** viven exclusivamente en [tests/types/integration-fixtures.ts](../../../tests/types/integration-fixtures.ts): exports, rutas dinámicas, Android v1, credenciales, callbacks, mocks de Auth/parsers/fetch y separación del contenedor transaccional frente a PrismaClient.

## Verificación

[collect.py](collect.py) preparó una copia sin `.env`, `.env.local`, `.next` ni dependencias previas; instaló con lockfile y PostgreSQL desechable publicado exclusivamente en `127.0.0.1`, con imagen fijada por digest. Sus recursos se eliminaron al terminar.

| Control | Resultado | Duración |
| --- | --- | --- |
| Instalación con lockfile | Correcta | 2.966 s |
| Migraciones | 42 aplicadas | 2.521 s |
| `pnpm typecheck` | Correcto | 11.79 s |
| `pnpm typecheck:tests` | Correcto | 13.941 s |
| `pnpm test:types` | Correcto | 8.236 s |
| `pnpm lint` | Sin errores; tres advertencias preexistentes | 42.57 s |
| `pnpm test` | 867 correctas, sin omisiones | 49.98 s |
| `pnpm build` | Correcto, incluida comprobación TS | 18.925 s |
| `pnpm db:verify` | Reconstrucción, actualización y 867 regresiones correctas | 71.265 s |
| Observación con reporteros | Mismos 867 escenarios, en orden | 49.482 s |

[reference/execution.json](reference/execution.json) conserva comandos, versiones y resultados: Node 22.23.2, pnpm 10.33.0, TypeScript 6.0.3, tsx 4.23.15, Prisma 7.10.1 y PostgreSQL 16.15. La reconstrucción desde vacío y actualización desde las trece migraciones históricas verificaron **42 migraciones y 45 tablas con RLS**, equivalencia del catálogo, checksums y conservación de registros.

[reference/scenarios.json](reference/scenarios.json) compara archivo, jerarquía, nombre y repetición, normalizando exclusivamente CJS/TS. Se conservan **los 854 escenarios de fase 0, los 863 de fase 2 y los 866 de fase 3**, en su orden original. La regresión nueva de metadatos suma **867 escenarios**: 568 pruebas de primer nivel y 299 subtests. La suite normal, la observación y las regresiones de `db:verify` coinciden, sin fallos, omisiones, cancelaciones ni TODO.

[reference/discovery.json](reference/discovery.json) observa **108 TS y cero CJS**, sin duplicados. El ejecutor conserva compatibilidad mixta hasta fase 6. [reference/type-inclusion.json](reference/type-inclusion.json) confirma los **120 módulos TS** activos de pruebas/helpers/ejecutor, las tres declaraciones operativas específicas y ESLint estricto. Los doce archivos de contratos permanecen en su programa separado; los siete helpers CJS no se cuentan como tipados. La configuración web sigue con `allowJs: false`; el puente exclusivo de pruebas continúa hasta convertir esos helpers.

[reference/hash-comparison.json](reference/hash-comparison.json) confirma que siguen intactos los **394 archivos protegidos**, los **672 artefactos históricos** y los **160 archivos de evidencias de fases anteriores de pruebas**. [implementation-hashes.json](implementation-hashes.json) identifica los archivos finales de implementación y documentación. No cambian fuentes de producto, esquema, SQL, fixtures JSON, service worker, Android, dependencias, servicios remotos ni despliegue.

## Incidencias y límites

[development/](development/) conserva el resumen de la comprobación inicial y los intentos de ejecución. El primer lote de clientes tuvo dos errores de adaptación, corregidos al conservar la lectura nativa de IndexedDB y el listener del service worker. La primera suite completa ejecutó los 866 escenarios con 863 éxitos y tres resultados fallidos —dos casos y su prueba contenedora— por comprobar como objetos un valor nulo y como array un mensaje de error. Se corrigieron los lectores de prueba; los **25 escenarios dirigidos** posteriores pasaron y el cierre limpio inicial quedó correcto. No se cambiaron expectativas financieras ni resultados esperados.

[initial-validation/](initial-validation/) conserva el primer cierre limpio, con 866 escenarios correctos en todos los controles. La revisión posterior encontró que el adaptador de rutas trataba también los metadatos como handlers. Se corrigió la selección de métodos y se añadió una comprobación estática positiva y una regresión de ejecución que comprueba `maxDuration`, el mapa de handlers y el rechazo HTTP sin autorización. El cierre definitivo en `reference/` verifica los 867 escenarios, preservando los 866 anteriores.

Persisten las tres advertencias previas de lint y el aviso de concurrencia de `pg`. No se conectaron Google, Supabase Auth ni dispositivos reales. Las pruebas conservan el contrato Android v1 y el formato IndexedDB v1; no hace falta actualizar APK por esta conversión. Servidores de navegador, seeds y recorridos completos de dos pestañas en navegador corresponden a fase 5; esta fase conserva sus escenarios Node de pérdida de respuesta, cambio de cuenta, duplicados, reintentos, serialización y transformación ESM.

## Reproducción

Con las dependencias instaladas y Podman disponible, usar un destino nuevo:

```bash
python3 artifacts/typescript-tests-migration/phase-4/collect.py /tmp/afp-tests-ts4-evidence-new
```

El recolector no sobrescribe evidencias, usa únicamente PostgreSQL local desechable y elimina sus recursos. README, plan, bitácora y comandos Android reflejan esta fase. Los ejecutores históricos conservan sus logs y snapshots y se reproducen en sus commits de cierre:

| Ejecutores | Commit |
| --- | --- |
| Fase 0 de pruebas | `700afcc842a0d7694972eb28dde04acf8779c8d5` |
| Fase 1 de pruebas | `c0a0a3798a92fc2c0b23281bb95b1a77e32c994f` |
| Fase 2 de pruebas | `dd81d4f80d6f52a32f5189f4412dfe2fdd9abcd1` |
| Fase 3 de pruebas | `429d747d75bd1a7fa7c99bbda5b096800f8f6c93` |
| Ejecutores web que importan/copían helpers CJS retirados | `6aad1ab` |

El recolector vigente es el de fase 4. Las fases 5–6 siguen pendientes.
