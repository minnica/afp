# Fase 7 — Cierre de la transición

Implementada sobre `5b48132`, el 28 de octubre de 2026. La migración del código activo web queda completada localmente: **275 módulos TS/TSX** incluidos en el programa estricto, sin JavaScript propio ni archivos vacíos en `src/`.

## Implementación

- `tsconfig.json` desactiva `allowJs` y retira las inclusiones JS/JSX y `checkJs`. Conserva `strict`, `noUncheckedIndexedAccess`, tipos de Next y `prisma.config.ts`; los contratos negativos heredan las mismas opciones. El build mantiene su comprobación TypeScript, sin `ignoreBuildErrors`.
- Mi dinero importa directamente los componentes compartidos tipados. Se retiró `ui.ts`, que sobrescribía sus contratos mediante conversiones; el tooltip ahora recibe los tipos reales de etiqueta y nombre de Recharts. No se alteró el diseño.
- Se retiraron `MoneyTransferEditor.tsx` y su segunda validación del comando: el editor compartido ya valida la misma transferencia y conserva el recibo. La prueba existente ahora recorre el envío real del formulario común, conserva el UUID tras una respuesta perdida, crea otro al cambiar el importe y rechaza cuentas iguales o datos de reversión. El contrato negativo del callback comprueba la interfaz actual de `MoneyEditor`.
- Se eliminó `financialClient.ts`, puente de las pantallas JSX sin consumidores tras fase 6. Se conservan los esquemas y sus pruebas, el cliente de interfaz vigente y la compatibilidad de los JSON persistidos. Se retiraron las conversiones redundantes de Prisma en `/api/money` y un comentario desactualizado del observador offline.
- El cargador exige el archivo exacto si se declara extensión: `archivo.js` inexistente ya no se sustituye por `archivo.ts`. Las rutas sin extensión conservan la resolución inequívoca, índices, mocks prioritarios, caché y aislamiento de credenciales. Se actualizaron la referencia dinámica del helper histórico y el ejecutor de las respuestas de fase 0; sus resultados esperados permanecen iguales. JS/JSX siguen admitidos para los fixtures mixtos del propio cargador.
- Los [14 archivos vacíos](removed-empty-files.json), sin consumidores ni implementación, se eliminaron. No se cuentan como módulos convertidos.
- ESLint rechaza dobles conversiones mediante `no-restricted-syntax`, además de sus reglas previas contra `any`, accesos inseguros y supresiones sin explicación.

## Revisión de tipos y fronteras

La [auditoría reproducible](audit.cjs) inspecciona el programa real y el AST de sus fuentes. [Resultado](audit.json): 275 módulos, todos incluidos; cero archivos JS/JSX, vacíos, `any` explícitos, supresiones TypeScript, dobles conversiones o módulos ambientales. `strict` impide `any` implícito; lint aplica las reglas de uso inseguro. No hay declaraciones globales propias que oculten módulos sin migrar.

El inventario registra **58 conversiones locales**, excluyendo `as const`, revisadas con estas condiciones:

| Frontera | Justificación y comprobación |
| --- | --- |
| JSON y HTTP (`captureJson`, `uiClient`, `financialResponses`, `offlineExpenseContracts`, `MoneyContent`) | Los esquemas/controles validan antes de la conversión. Los clientes devuelven el cuerpo original para conservar importes, metadatos, orden y huellas. Contratos negativos, pruebas de respuesta incompleta e integraciones comprueban esa frontera. |
| Captura y métodos de pago | Los grupos provienen de regex concretas y los métodos se comprueban antes de escribir. Se conservan los fallbacks de capturas opcionales y las validaciones de UUID, período y total. Parsers, conciliación y API mantienen sus escenarios de integración. |
| Claves de objetos y estados derivados | Las claves vienen de los mapas/objetos recorridos o de estados previamente discriminados; no se convierten objetos externos en modelos completos. Cálculos de cortes, consumo mínimo y contratos de formularios verifican los valores. |
| DOM, React y bibliotecas | Propiedades CSS personalizadas, tema Sonner, valores de Input, errores de React Hook Form y proxy de evento numérico mantienen contratos locales comprobables; no declaran módulos globales. Contratos negativos de props/refs y el formulario en navegador cubren los consumidores. |
| Borradores, recuperación y singleton | Borradores restauran solo claves conocidas del mismo tipo primitivo; recuperación conserva el tipo de la promesa en su cierre; el singleton de Prisma usa una propiedad local tipada de `globalThis`. |
| Arrays iniciales y datos IndexedDB | Tipos de arrays vacíos o acotación a `unknown[]`; cada registro de la cola pasa después por su lector validado, sin alterar su representación. Pruebas offline y de cambio de cuenta conservadas. |

El [recorrido de imports cliente](client-boundaries.json) abarca **104 entradas y 167 módulos propios alcanzables**, sin imports de ejecución de Prisma, Node o handlers del servidor. El descenso de entradas respecto a fase 6 corresponde a los dos wrappers cliente eliminados.

## Verificaciones desde instalación limpia

[verify.py](verify.py) copia los archivos vigentes a un directorio temporal nuevo, sin `.env`, `node_modules`, `.next` ni caché de TypeScript, instala el lockfile y usa exclusivamente PostgreSQL local desechable y variables públicas ficticias. El directorio se elimina al terminar. [execution.json](execution.json) registra los comandos y sus tiempos; el hash de las fuentes identifica la copia comprobada.

| Control | Resultado |
| --- | --- |
| [Instalación con `--frozen-lockfile`](1-1-pnpm-install.log) | Correcta, incluido `postinstall`/Prisma; sin cambios de dependencias |
| [Migración local de la base desechable](1-2-pnpm-exec.log) | 42 migraciones aplicadas |
| [`pnpm typecheck`](1-3-pnpm-typecheck.log) | Correcto sin `.next` previa |
| [`pnpm test:types`](1-4-pnpm-test-types.log) | Contratos positivos y negativos correctos |
| [`pnpm lint`](1-5-pnpm-lint.log) | Cero errores; tres advertencias preexistentes |
| [`pnpm test`](1-6-pnpm-test.log) | **854 pruebas correctas**, cero fallos y cero omisiones |
| [`pnpm build`](1-7-pnpm-build.log) | Compilación y comprobación TypeScript correctas |
| [`pnpm db:verify`](1-8-pnpm-db-verify.log) | Reconstrucción y actualización desde las 13 migraciones históricas: 42 migraciones, **45 tablas con RLS** y 854 regresiones correctas |
| [Referencia del piloto](1-9-node-artifacts-typescript-migration-phase-0-transfers.cjs.log) | Las **12 respuestas** coinciden con fase 0 |

Se repitió [lint en el workspace final](final-lint.log) después de añadir los verificadores y las evidencias: cero errores y las mismas tres advertencias. `git diff --check` y la revisión de enlaces de la documentación también pasaron; el hash de `src/` coincide con el de la instalación limpia.

Los [89 archivos protegidos](invariants.json) conservan SHA-256: esquema, SQL/historial de migraciones, dependencias/lockfile, política de instalación, service worker y fuentes Kotlin. No se cambió ningún checksum de migración ni se aplicó SQL remoto.

## Navegador y datos

`agent-browser` con Chromium, Auth ficticia, API real y PostgreSQL local, usando el fixture compilado aislado de Mi dinero. Se verificó el flujo formulario → `POST /api/money` → transferencia/recibo en BD → refresco de cuentas/proyección:

1. Escritorio **1440 × 1000**: selección de la cuenta de origen mediante teclado, transferencia de **125.50** de Banco ficticio a Efectivo ficticio, respuesta 200 y foco devuelto a «Transferir». El diálogo recibió foco en su título. [Solicitud y respuesta](browser-desktop.json), [formulario](transfer-desktop.png) y [proyección](projection-desktop.png).
2. Móvil **390 × 844**: selectores responsivos, transferencia de **38.75** en sentido contrario, respuesta 200 y foco devuelto al mismo botón. [Solicitudes y respuesta](browser-mobile.json), [formulario](transfer-mobile.png).
3. El [cotejo de PostgreSQL](browser-data.json) confirma exactamente dos transferencias y dos recibos, con los mismos IDs/UUID, importes y cuentas que las solicitudes. El efecto de las transferencias conserva los **1 000 000 centavos** de referencias iniciales entre cuentas; este cotejo aísla ese efecto, no sustituye el saldo disponible que también descuenta el gasto ficticio. [Verificador](verify-browser-data.cjs).
4. Proyección, resumen mensual y tooltip móvil visibles: **«29 oct 2026 / Saldo previsto: $9,950.00»**, sin error de tipos en los callbacks. [Dato DOM](projection-tooltip.json), [captura](projection-mobile.png). Sin alertas inesperadas, desbordamiento horizontal ni [errores de página](browser-errors.json).

Los recorridos generales de las otras pantallas están en fase 6; aquí se volvió a comprobar el flujo afectado por la retirada de wrappers. No se repitió la aceptación contra Google/Supabase reales ni un teléfono físico.

## Incidencias y excepciones finales

La primera comprobación de desarrollo, antes de la validación limpia, detectó que el adaptador de UI estrechaba incorrectamente los tipos de los callbacks del tooltip. Se resolvió acotando la etiqueta a texto y dejando inferir el nombre desde el componente real; se verificó el contenido en navegador. No fue necesario cambiar fórmulas, formatos ni protocolos.

Lint conserva los avisos por `loadSubscriptions`, `activeReceivables` y TanStack/React Compiler; no se desactivaron reglas para ocultarlos. El fixture conserva el aviso de `pg` conocido de las fases anteriores. Los datos ficticios no completan todas las previsiones y mantienen sus avisos de información pendiente.

Excepciones de lenguaje previstas, **fuera del código activo web**: pruebas/helpers y scripts `.cjs`, configuraciones y generadores `.mjs`, recursos JavaScript servidos como `public/sw.js`, y Android Kotlin. Esbuild conserva JS/JSX para sus fixtures mixtos y transforma TS/TSX sin comprobarlos; `tsc` sigue siendo obligatorio. No queda una excepción JS dentro de `src/` ni un módulo propio pendiente oculto por declaraciones.

Sin publicación, automatizaciones activadas, cambios de esquema ni datos remotos. Los recursos temporales de verificación se detuvieron al terminar.

## Reproducir

Preparar PostgreSQL desechable con los requisitos del README principal. El verificador rechaza bases remotas, nombres que no comiencen por `afp_test` y parámetros adicionales:

```bash
export AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55447/afp_test_phase7
python3 artifacts/typescript-migration/phase-7/verify.py
node artifacts/typescript-migration/phase-7/audit.cjs
node artifacts/typescript-migration/phase-7/check-client-boundaries.cjs
```

Para el navegador, después de migrar la base local:

```bash
node tests/helpers/seed-ui.cjs
AFP_UI_TEST_PORT=4227 AFP_UI_TEST_REAL_SETTINGS=1 \
  AFP_CAPTURE_TEST_REAL_DASHBOARD=1 AFP_CAPTURE_TEST_PRODUCTION=1 \
  node tests/helpers/money-browser-server.cjs
```

En `http://127.0.0.1:4227/login`, usar `money-qa@example.test` y una contraseña ficticia. Repetir las dos transferencias desde Cuentas y revisar Proyección en ambos tamaños. `verify-browser-data.cjs` coteja las solicitudes registradas en los JSON con la misma BD de la ejecución documentada; para repetirlo con nuevos IDs hay que capturar las solicitudes y actualizar `browser-seed.json`/`browser-mobile.json` de esa nueva ejecución. No ejecutar el seed en una base personal. Cerrar navegador, fixture y contenedor al terminar.
