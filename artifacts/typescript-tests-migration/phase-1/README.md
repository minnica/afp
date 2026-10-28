# Fase 1 — Ejecución mixta y tipos de pruebas

Implementada el **28 de octubre de 2026**, partiendo de `700afcc842a0d7694972eb28dde04acf8779c8d5`. Completa la fase 1 del [plan](../../../docs/plan-migracion-tests-typescript.md). Las fases 2–6 siguen pendientes; los helpers CJS todavía no cuentan como tipados.

## Cambios

- `tsx` **4.23.15** fijado exactamente como dependencia de desarrollo, reutilizando esbuild **0.28.2**. Se conserva `pnpm@10.33.0`, el modelo de módulos y la política `allowBuilds`, sin habilitar scripts adicionales.
- [tests/run-tests.ts](../../../tests/run-tests.ts) comparte descubrimiento y ejecución entre `pnpm test` y las regresiones de `db:verify`. Descubre solo `.test.cjs`/`.test.ts` del primer nivel, ordenados; rechaza nombres base duplicados, selección ajena/repetida y ausencia de pruebas. `--list` lista sin ejecutar. Los cierres usan la suite completa sin selección.
- Ambos procesos registran explícitamente `--import tsx`, incluido el proceso principal CJS de `db:verify`; las regresiones conservan `--experimental-test-isolation=none`, entorno explícito y códigos de salida. Se comprueban errores de arranque y terminaciones por señal. No se usa `NODE_OPTIONS`.
- [tsconfig.tests.json](../../../tsconfig.tests.json) hereda `strict`, `noUncheckedIndexedAccess`, `noEmit`, Node/DOM y JSX; permite imports `.ts`. `typecheck:tests` genera Prisma y tipos Next. Solo este programa usa temporalmente `allowJs: true`/`checkJs: false` para los helpers CJS. La configuración web conserva `allowJs: false`.
- ESLint comprueba todos los TS/TSX de pruebas con las reglas de tipos existentes. Las supresiones no se admiten en pruebas ejecutables; los casos negativos explicados permanecen en `tests/types/`, fuera del programa y descubrimiento de ejecución.
- `latest-request.test.cjs` pasa a `.test.ts` con sus tres escenarios originales. Importa directamente `latestRequest.ts`, que no tiene imports, lecturas de entorno ni inicialización externa. Los módulos con mocks siguen usando el cargador CJS.
- Ocho escenarios nuevos en `test-runner.test.ts` cubren descubrimiento/exclusiones, selección, duplicados, suite vacía/arranque, CJS↔TS/imports dinámicos/orden/entorno, fallos/códigos/señales, entorno ficticio de `sourceLoader` y CLI. Los fixtures temporales comprueban sintaxis TS que requiere transformación. Se añaden tres casos negativos de tipos para selección, entorno y retorno.
- `next-fixture.cjs` copia solo `tsconfig.json`, declaraciones y configuración web necesarias. No copia programas que referencian pruebas ausentes. Se verificaron copia sin `.env` ni tipos generados, `next typegen` y comprobación estricta de todas las fuentes copiadas.

## Verificación

[reference/execution.json](reference/execution.json) contiene comandos, versiones, timestamps, duración, estado inicial, hashes de entrada y limpieza. El recolector creó una copia sin `.env`, `.next`, caché TypeScript ni `node_modules`; ejecutó **`pnpm install --frozen-lockfile`**, usando el almacén compartido de pnpm. No copió dependencias instaladas. Las tres comprobaciones de tipos se ejecutaron cada una después de retirar `.next` y cachés, con variables ficticias y PostgreSQL local desechable.

| Control | Resultado | Duración |
| --- | --- | --- |
| Instalación limpia | Lockfile y postinstall correctos | 3,022 s |
| Migraciones PostgreSQL | 42 migraciones aplicadas | 2,515 s |
| `pnpm typecheck:tests` | Correcto | 2,641 s |
| `pnpm typecheck` | Correcto | 11,603 s |
| `pnpm test:types` | Correcto, incluidos tres casos negativos nuevos | 7,015 s |
| `pnpm lint` | Cero errores; tres advertencias preexistentes | 27,989 s |
| `pnpm test` | 862 correctas, cero fallos u omisiones | 47,750 s |
| Observación con reporteros | Misma secuencia de 862 escenarios | 49,025 s |
| `pnpm build` | Correcto, incluida comprobación TypeScript | 18,395 s |
| `pnpm db:verify` | 862 regresiones; reconstrucción y actualización correctas | 66,314 s |
| Configuración fixture Next | Copia y regeneración correctas | 0,265 s |
| Tipos del fixture Next | Correctos | 10,280 s |

Node **22.23.2**, pnpm **10.33.0**, TypeScript **6.0.3**, Next **16.3.8**, Prisma **7.10.1** y PostgreSQL **16.15**. La imagen de PostgreSQL está fijada por digest, publicada exclusivamente en `127.0.0.1`; conexiones y datos son ficticios. `db:verify` confirmó actualización desde 13 migraciones históricas, 42 migraciones finales y 45 tablas con RLS. La copia, el fixture y el contenedor se eliminaron al finalizar.

## Escenarios, inclusión y hashes

[discovery.json](reference/discovery.json) registra **107 archivos**: 105 CJS y dos TS, sin duplicados y todos observados. [scenarios.json](reference/scenarios.json) conserva archivo, ubicación, identidad, jerarquía, repetición y resultado de **862 escenarios**: 563 de primer nivel y 299 subtests. Los **854 originales coinciden en identidad, repetición y orden** con fase 0; los ocho añadidos pertenecen exclusivamente al ejecutor. `pnpm test`, la observación y `db:verify` coinciden en la secuencia completa, con cero fallos, cancelaciones, omisiones y TODO. Los [eventos originales](reference/scenario-events.ndjson) permiten revisar el cotejo; las posiciones TS proceden del código transformado que observa Node, no se presentan como posiciones AST originales.

[type-inclusion.json](reference/type-inclusion.json) comprueba inclusión de los tres módulos TS ejecutables —prueba convertida, prueba del ejecutor y ejecutor—, separación de los nueve archivos de contratos y aplicación de las reglas ESLint. Los 11 helpers CJS incluidos como puente no se presentan como comprobados. No se añaden `any`, conversiones dobles, declaraciones comodín ni adaptadores de tipos del cargador; esa frontera corresponde a fase 2.

[hash-comparison.json](reference/hash-comparison.json) confirma **394 archivos protegidos y 672 artefactos históricos sin cambios**. Fuentes web, esquema, SQL, service worker, Android y fixtures conservan sus hashes. Cambian cuatro configuraciones/herramientas de las 11 inventariadas: `package.json`, `pnpm-lock.yaml`, `eslint.config.mjs` y `scripts/verify-database-reproduction.cjs`. Se añaden la configuración y el ejecutor de pruebas, y se ajusta el helper CJS del fixture Next; las pruebas y la documentación cambian según el alcance anterior.

## Incidencias y límites

[baseline/](baseline/) conserva el primer intento, detenido en `test:types`: el contrato nuevo construía un `ProcessEnv` sin `NODE_ENV`, obligatorio por la ampliación de Next. Se corrigió el caso positivo y el negativo para partir de `process.env`, manteniendo la comprobación de valores numéricos inválidos, y se repitió con salida nueva. No se cambiaron firmas de producción ni expectativas financieras. Durante las pruebas dirigidas se ajustó la sonda de señal a `SIGKILL` para garantizar su entrega antes de la salida natural del proceso.

Se mantienen las tres advertencias de lint registradas en fase 0 y el aviso de concurrencia de `pg`. No se ejecutaron recorridos de navegador, servidores/seeds completos, servicios reales, auditorías de dependencias, APK ni despliegues. La compatibilidad afectada de fixtures se verificó mediante configuración, tipos Next y las ocho pruebas existentes del cargador, incluida generación ESM offline. Los recorridos completos corresponden a sus fases posteriores.

## Reproducción

Con Node/pnpm del proyecto, Podman y la imagen PostgreSQL fijada disponibles:

```bash
python3 artifacts/typescript-tests-migration/phase-1/collect.py /tmp/afp-tests-ts1-evidence-new
```

El destino debe ser nuevo. El recolector reutiliza los lectores TAP/reportero inmutables de fase 0, instala con lockfile, compara identidades y hashes, audita inclusión de tipos/ESLint y limpia recursos incluso ante fallos. No requiere conexiones ni archivos de entorno reales.
