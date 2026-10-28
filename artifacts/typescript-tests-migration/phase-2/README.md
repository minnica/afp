# Fase 2 — Cargador tipado y piloto financiero

Implementada el **28 de octubre de 2026**, sobre `c0a0a3798a92fc2c0b23281bb95b1a77e32c994f`. Completa la fase 2 del [plan](../../../docs/plan-migracion-tests-typescript.md); las fases 3–6 siguen pendientes.

## Implementación

- Se convierten `load-source`, `browser-module`, `source-loader.test`, `money-transfer-client.test` y `money-transfer-integration.test` de CJS a TS. Los consumidores activos usan las rutas nuevas. La auditoría de los **98 consumidores CJS modificados** confirma cambios exclusivamente de imports o arranque, sin alterar sus expectativas.
- [source-contracts.ts](../../../tests/helpers/source-contracts.ts) vincula **siete rutas** a `typeof import(...)`: cliente de transferencias, cliente de Mi dinero, fechas, recuperación, configuración del editor, editor y handler de Mi dinero. La sobrecarga del cargador y su comprobación de exports concentran la frontera de `vm`; no demuestran la semántica de cada función. Las rutas dinámicas y funciones privadas sin contrato devuelven **`unknown`**. No existe `load<T>` para inventar resultados.
- Los dobles mínimos tipan HTTP, Auth, Prisma, hooks, formulario y globals. El piloto usa `Request`/`Response` reales; `JsonReply` es una envoltura explícita después de leer JSON como `unknown`. El editor comprueba la forma del árbol JSX antes de acceder a hijos/callbacks. Los valores inválidos y los metadatos llegan al código probado sin normalización previa.
- Se conservan entorno ficticio, prioridad de mocks incluso falsy, resolución exacta, ambigüedad, JSX/TSX, caché, ciclos y limpieza tras errores. El piloto conserva cuerpo, UUID, propietario, conflictos, concurrencia, centavos, rollback después de insertar el recibo, fechas y reversión. Los datos y consultas Prisma mantienen la inferencia del cliente real.
- Se mantienen los **ocho escenarios originales del cargador** y los **catorce financieros**. Se añade un escenario de contratos públicos del cargador. [tests/types/source-loader.ts](../../../tests/types/source-loader.ts) añade **20 casos negativos** para argumentos, exports, resultados, rutas dinámicas, privados, mocks y globals, fuera del descubrimiento de ejecución.
- `db:verify` mantiene soporte TS explícito y actualiza su import. Se añade `--import tsx` al proceso hijo de avisos por pagar y al comando del servidor offline. Los servidores Next y los tres seeds no importan estos helpers y conservan sus entradas/orden de inicialización CJS.

## Verificación

[reference/execution.json](reference/execution.json) conserva versiones, comandos, tiempos, hashes de entrada y limpieza. Se creó una copia sin `.env`, `.next`, cachés TypeScript ni dependencias; se instaló con `pnpm install --frozen-lockfile`. Cada comprobación de tipos generó sus prerrequisitos desde cero. Se usó exclusivamente PostgreSQL local desechable, con imagen fijada por digest y puerto publicado en `127.0.0.1`.

| Control | Resultado | Duración |
| --- | --- | --- |
| Instalación limpia | Lockfile/postinstall correctos | 2.966 s |
| Migraciones | 42 migraciones | 2.482 s |
| `pnpm typecheck:tests` | Programa estricto correcto | 8.019 s |
| `pnpm typecheck` | Web correcta | 11.743 s |
| `pnpm test:types` | Incluye 20 casos negativos nuevos | 7.170 s |
| `pnpm lint` | Cero errores; tres advertencias preexistentes | 31.023 s |
| Piloto con PostgreSQL | 23 correctas; ocho originales del cargador y catorce financieros conservados, más un escenario nuevo | 1.823 s |
| `pnpm test` | 863 correctas, cero omisiones | 48.031 s |
| Observación con reporteros | Mismos 863 escenarios en orden | 49.436 s |
| `pnpm build` | Correcto, con comprobación TS | 18.976 s |
| `pnpm db:verify` | 863 regresiones; reconstrucción/actualización, 42 migraciones y 45 tablas con RLS | 67.122 s |
| Configuración fixture Next | Sin `.env` ni programas de pruebas | 0.256 s |
| Tipos del fixture Next | Correctos | 10.151 s |
| Fixture offline en Chrome | Entrada CJS, ESM de cola/observador y cero errores | 9.298 s |

Node 22.23.2, pnpm 10.33.0, TypeScript 6.0.3, tsx 4.23.15, esbuild 0.28.2, Prisma 7.10.1 y PostgreSQL 16.15. Chrome se controló con agent-browser 0.27.0, sin añadir dependencias al proyecto. [offline-fixture.log](reference/offline-fixture.log) confirma importación de los cinco exports de cola y del observador, disponibilidad de IndexedDB/Web Locks y cero errores de página. No se recorrió la matriz completa de dos pestañas/cambio de cuenta/respuesta perdida de fase 5.

[contract-follow-up.json](reference/contract-follow-up.json) conserva una comprobación posterior de `test:types` y ESLint: se quitaron dos anotaciones `unknown` redundantes en los casos negativos para comprobar el retorno **inferido** del cargador. No cambió ningún módulo ejecutado; por eso no se repitió la suite financiera. Esta evidencia incluye el hash final del contrato estático.

## Escenarios, inclusión y conservación

[scenarios.json](reference/scenarios.json) compara identidades, jerarquía, repetición y orden, normalizando únicamente la extensión CJS/TS. Se conservan los **854 escenarios de fase 0** y los **862 de fase 1**, y se añade uno: **863** en total, 564 de primer nivel y 299 subtests. `pnpm test`, la observación y las regresiones de `db:verify` coinciden en la secuencia completa, sin fallos, cancelaciones, omisiones ni TODO. El [descubrimiento](reference/discovery.json) observa los mismos 107 archivos: 102 CJS y cinco TS, sin duplicados.

[type-inclusion.json](reference/type-inclusion.json) comprueba los **diez archivos TS** de pruebas/helpers/ejecutor y diez archivos de contratos en su programa separado, con reglas ESLint estrictas. Los nueve helpers CJS restantes no se presentan como tipados. No se añaden `any`, supresiones fuera de los casos negativos, dobles conversiones ni declaraciones comodín.

[hash-comparison.json](reference/hash-comparison.json) conserva los **394 archivos protegidos** y **672 artefactos históricos**. No cambian código de producto, esquema, SQL, fixtures, service worker, Android, dependencias ni política de instalación. Respecto de fase 0 siguen difiriendo las cuatro configuraciones/herramientas que ya cambió fase 1; en este lote solo se ajusta el import de `scripts/verify-database-reproduction.cjs`. README, producto, planes y bitácora reflejan el cierre local.

## Fronteras y esfuerzo medido

[boundaries.json](boundaries.json) inventaría rutas registradas, consumidores, fronteras dinámicas, comandos y excepciones. [dynamic-values.ts](../../../tests/helpers/dynamic-values.ts) comprueba records, arrays y funciones en módulos temporales, JSX y JSON, devolviendo `unknown` cuando corresponde. Los especificadores de mocks ajenos al piloto permanecen abiertos como `unknown` hasta migrar sus consumidores. Las funciones privadas de `legacy-route-context` siguen pendientes de contratos por ruta en fase 3.

Hay **dos adaptadores locales de compatibilidad** con una conversión cada uno:

1. La transacción **real** del cliente Prisma extendido se acota a `Prisma.TransactionClient`: sus sobrecargas generadas difieren, aunque mantiene delegates y transacción. No se afirma que un mock parcial sea un `PrismaClient`. Retirarlo cuando Prisma haga compatibles esos tipos o exista un contrato transaccional de producción apropiado.
2. El doble genérico de `useState` acota el inicializador tras comprobar `typeof === 'function'`. Retirarlo al sustituir el simulador manual por un harness de renderizado real, sin adelantar esa migración en este lote.

[metrics.json](metrics.json) registra cinco módulos originales (435 líneas), dos helpers tipados nuevos, siete contratos de ruta, 20 casos negativos y 98 consumidores CJS adaptados. El intervalo observado entre la primera edición registrada y el cierre de comprobaciones fue **15.6 minutos**; es tiempo de pared, incluye verificaciones/repetición y no mide tiempo activo ni toda la conversación. `typecheck:tests` pasó de 2,641 s en fase 1 a **8.019 s** en esta copia limpia: ahora alcanza también la API, Prisma, editor y dependencias del piloto. Es una medición local, no una estimación de las fases restantes.

Se mantienen las decisiones de ejecución: tsx para entradas/procesos y esbuild/vm para fuentes con mocks. Ampliar el mapa y los dobles por lote junto con sus consumidores; mantener `unknown` en rutas no registradas. Los contratos detectan incompatibilidades sin ampliar los servicios simulados ni modificar firmas de producción.

## Incidencias y límites

[baseline/](baseline/) conserva el primer cierre: instalación, tipos, lint y piloto correctos; la suite completa detectó un proceso `node -e` sin registro TS en la prueba de zonas horarias de avisos por pagar. La copia de ese intento se había creado antes de corregir el proceso hijo. Se añadió `--import tsx` y se repitió en una copia nueva, sin cambiar expectativas. La [comprobación dirigida posterior](reference/payable-notices.log) conserva las cinco pruebas de avisos.

Persisten las tres advertencias preexistentes de lint y el aviso de concurrencia de `pg`. Los contratos mínimos de los mocks no sustituyen las bibliotecas completas. No se ejecutaron proveedores reales, seeds/servidores Next completos, auditorías de dependencias, APK ni despliegues. La copia, PostgreSQL, servidor offline y sesión de Chrome se cerraron/eliminaron al finalizar.

## Reproducción y ejecutores históricos

Con las versiones del proyecto, Podman, imagen PostgreSQL fijada, Google Chrome y acceso a agent-browser 0.27.0:

```bash
python3 artifacts/typescript-tests-migration/phase-2/collect.py /tmp/afp-tests-ts2-evidence-new
```

El destino debe ser nuevo. El recolector instala con lockfile, usa entorno ficticio, compara escenarios/hashes y limpia sus recursos. Reutiliza el reportero y los lectores de fase 0 sin modificarlos. El contrato estático final ya está incluido al repetir este comando en HEAD.

Los ejecutores de fases cerradas que importan/copían `load-source.cjs` quedan conservados como evidencia y **no se soportan en HEAD**. Sus referencias se resuelven en un checkout aislado de estos commits de cierre; no ejecutar sus recolectores sobre las evidencias actuales:

| Ejecutores históricos | Commit de reproducción |
| --- | --- |
| `typescript-tests-migration/phase-0/inventory.cjs` y `collect.py` | `700afcc842a0d7694972eb28dde04acf8779c8d5` |
| `typescript-tests-migration/phase-1/collect.py` | `c0a0a3798a92fc2c0b23281bb95b1a77e32c994f` |
| `typescript-migration/phase-0/transfers.cjs`, `phase-5/compare-contracts.cjs` y recolectores de la web que los invocan | `6aad1ab` |

El comando vigente es el recolector de fase 2. Esta resolución explícita mantiene intactos logs, snapshots y código histórico; los consumidores activos del proyecto usan las nuevas rutas TS.
