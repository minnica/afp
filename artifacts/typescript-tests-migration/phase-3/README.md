# Fase 3 — Pruebas del núcleo financiero

Cierre local del **28 de octubre de 2026**, sobre `dd81d4f80d6f52a32f5189f4412dfe2fdd9abcd1`. Se convirtieron **52 pruebas y dos helpers CJS**: 5 570 líneas originales, sin cambios en producto, esquema, SQL, fixtures JSON, service worker, Android, dependencias ni despliegue. Las fases 4–6 siguen pendientes.

## Implementación

[inventory.json](inventory.json) identifica cada renombre y sus líneas. El alcance comprende tarjetas, MSI y presentación; suscripciones y gastos; deudas e ingresos; Mi dinero, rendimientos, presupuestos y proyección; autorización/contratos financieros y pruebas de scripts y fuentes Android. Las 52 pruebas originales se conservan, con los mismos nombres de escenarios y aserciones financieras. Se añaden tres escenarios para la infraestructura de pruebas.

[legacy-route-context.ts](../../../tests/helpers/legacy-route-context.ts) conserva un cargador/caché por contexto, los exports públicos y la lista cerrada de funciones privadas por ruta. Mantiene tanto las respuestas JSON históricas sin envoltorio como los dobles con `.body`. [debt-fixture.ts](../../../tests/helpers/debt-fixture.ts) distingue registros, consultas y transacciones: conserva bloqueo advisory, serialización, rollback, errores simulados y tombstones sin ID. No se presenta como PrismaClient.

El mapa del cargador vincula **54 módulos** a sus exports reales. [source-exports.ts](../../../tests/helpers/source-exports.ts) exige todas sus claves y deriva el tipo de valor: función/constructor, objeto o constante. La frontera `vm` comprueba presencia y clase de valor, incluidos objetos no nulos; las rutas dinámicas continúan devolviendo `unknown`. Esto no demuestra toda la semántica del código ejecutado en `vm`.

[financial-fixtures.ts](../../../tests/helpers/financial-fixtures.ts) concentra los adaptadores para proyecciones parciales, JSON y solicitudes/respuestas de prueba. `Sparse` conserva omisiones, escalares y resultados derivados del código real; excluye las firmas de persistencia. `uncheckedFixture` permite las entradas internas deliberadamente inválidas o históricas sin normalizarlas. No completa fixtures ni permite que el consumidor elija un contrato de módulo. Los mapas numéricos de meses se inspeccionan como mapas, conservando su diferencia frente a los arrays.

[financial-persistence.ts](../../../tests/helpers/financial-persistence.ts) intercepta fallos de clientes y transacciones **reales**. PostgreSQL conserva escrituras, aislamiento, locks, restricciones y rollback. Los scripts operativos permanecen en CJS, con tres declaraciones específicas adyacentes: historial de migraciones, Digital Asset Links y configuración de respaldo bancario. Sus pruebas verifican llamadas válidas y rechazos; el configurador usa exclusivamente los adaptadores locales de cron/net/Vault.

[boundaries.json](boundaries.json) registra los límites, conversiones locales y llamadas de inyección. Los casts se concentran en clonación JSON, adaptación de cálculos puros, discriminación de resultados, retorno de inyección y exports privados comprobados. No se añadieron `any`, supresiones ejecutables, dobles conversiones, declaraciones comodín ni mocks convertidos a PrismaClient completo.

## Verificación

[collect.py](collect.py) creó una copia sin `.env`, `.env.local`, `.next` ni dependencias previas. Instaló con lockfile y la política vigente; PostgreSQL se publicó solo en `127.0.0.1`, con imagen fijada por digest. Todos los recursos de esa ejecución se eliminaron al terminar.

| Control | Resultado | Duración |
| --- | --- | --- |
| Instalación con lockfile | Correcta | 2.995 s |
| Migraciones | 42 aplicadas | 2.529 s |
| `pnpm typecheck` | Correcto | 11.762 s |
| `pnpm typecheck:tests` | Correcto | 10.685 s |
| `pnpm test:types` | Correcto | 7.728 s |
| `pnpm lint` | Sin errores; tres advertencias preexistentes | 35.525 s |
| `pnpm test` | 866 correctas, sin omisiones | 49.606 s |
| `pnpm build` | Correcto, incluida comprobación TS | 19.098 s |
| `pnpm db:verify` | Reconstrucción, actualización y 866 regresiones correctas | 68.383 s |
| Observación con reporteros | Mismos 866 escenarios, en orden | 50.684 s |

[reference/execution.json](reference/execution.json) conserva comandos, versiones y resultados. Node 22.23.2, pnpm 10.33.0, TypeScript 6.0.3, tsx 4.23.15, Prisma 7.10.1 y PostgreSQL 16.15. `db:verify` verificó 42 migraciones y 45 tablas con RLS, checksums, equivalencia de catálogo y conservación de registros en reconstrucción y actualización desde las trece migraciones históricas.

El [seguimiento posterior](follow-up/execution.json) acota únicamente tipos: estados/datos del fixture de deudas, transacciones por callback del interceptor y exclusión de persistencia en `SparseModule`. Se comprobaron nuevamente tipos de pruebas, contratos y lint; **25 pruebas de persistencia con PostgreSQL** pasaron sin omisiones. [final-contracts.json](follow-up/final-contracts.json) registra la comprobación estricta final de ambos programas tras el último caso negativo. Hay **18 casos negativos nuevos**, exclusivamente en [tests/types/financial-fixtures.ts](../../../tests/types/financial-fixtures.ts). Estas precisiones no cambian instrucciones de las pruebas ejecutables.

## Conservación y pendientes

[reference/scenarios.json](reference/scenarios.json) compara identidad por archivo, jerarquía, nombre y repetición, normalizando solo CJS/TS. Se conservan **los 854 escenarios de fase 0 y los 863 de fase 2, en su orden original**. Los tres nuevos suman **866**: 567 de primer nivel y 299 subtests. La suite normal, la observación y las regresiones de `db:verify` coinciden sin fallos, cancelaciones, omisiones ni TODO.

[reference/discovery.json](reference/discovery.json) observa 108 archivos, sin duplicados: **58 TS y 50 CJS**. [reference/type-inclusion.json](reference/type-inclusion.json) comprueba los **68 módulos TS** activos de pruebas/helpers/ejecutor y tres declaraciones externas, con ESLint estricto; once archivos de contratos permanecen en su programa separado. Los siete helpers CJS de navegador/seeds/Next siguen pendientes y no se cuentan como tipados. Se conserva el puente `allowJs` exclusivo del programa de pruebas.

[reference/hash-comparison.json](reference/hash-comparison.json) confirma que no cambió ninguno de los **394 archivos protegidos** ni los **672 artefactos históricos**. [implementation-hashes.json](implementation-hashes.json) identifica los archivos finales, incluido el seguimiento de tipos. Se actualizaron README, plan, bitácora, enlaces y comandos vigentes de Android. El plan de migración web mantiene su cierre.

Persisten las advertencias previas de lint y concurrencia de `pg`. Los mocks de Auth continúan siendo ficticios; no se conectaron proveedores reales. Los fixtures completos de navegador, seeds, recorridos offline de dos pestañas y pruebas de Captura/Calendar/HTTP pendientes corresponden a las fases 4–5. No se modificaron sus helpers ni comandos de arranque; la suite conserva los casos del cargador y su transformación ESM offline.

## Incidencias y reproducción

[development/](development/) conserva las primeras ejecuciones: se corrigieron comprobaciones de forma introducidas durante la conversión, incluidas la ausencia de ID en tombstones y la diferencia entre mapas mensuales y arrays. No se alteraron expectativas financieras. El primer cierre PostgreSQL tuvo 865 éxitos y un fallo en la lectura del mapa; la corrección dirigida y el cierre completo posterior pasaron.

[initial-validation/](initial-validation/) conserva un primer recolector: tipos, lint y 866 pruebas correctos; el build falló porque el symlink de `node_modules` salía de la raíz permitida por Turbopack. Se corrigió el **recolector**, instalando las dependencias dentro de la copia nueva. El cierre en `reference/` pasó íntegro. El primer seguimiento de tipos conservado detectó el ensanchamiento del literal `ACTIVE`; se acotó con `as const` y se repitieron sus controles.

Con las dependencias del proyecto instaladas y Podman disponible, usar un destino nuevo:

```bash
python3 artifacts/typescript-tests-migration/phase-3/collect.py /tmp/afp-tests-ts3-evidence-new
```

El recolector no sobrescribe evidencias existentes, instala con lockfile en su copia, prepara y valida PostgreSQL local, ejecuta todos los controles y compara escenarios/hashes. No publica ni utiliza conexiones remotas configuradas en archivos de entorno.

Los recolectores de fases cerradas se conservan como evidencia y se reproducen en sus commits de cierre:

| Ejecutores | Commit |
| --- | --- |
| Fase 0 de pruebas | `700afcc842a0d7694972eb28dde04acf8779c8d5` |
| Fase 1 de pruebas | `c0a0a3798a92fc2c0b23281bb95b1a77e32c994f` |
| Fase 2 de pruebas | `dd81d4f80d6f52a32f5189f4412dfe2fdd9abcd1` |
| Ejecutores web que importan/copían helpers CJS retirados | `6aad1ab` |

El recolector vigente es el de fase 3; los logs y snapshots anteriores permanecen intactos.
