# Fase 3: Mi dinero en TypeScript

Implementada sobre `0c115375ba0f7da3ba7710180de010f3742cd351`, **27 de octubre de 2026** (America/Mexico_City). Completa la fase 3 del [plan](../../../docs/plan-migracion-typescript.md). No hubo publicación ni acceso a Supabase personal. Esquema, las 42 migraciones y lockfile conservan los hashes registrados en fase 2.

## Alcance

Los tres lotes del plan se implementaron secuencialmente y se verificaron juntos al integrar sus consumidores:

1. **Cuentas y conciliaciones:** `data.ts` infiere la instantánea desde las consultas Prisma y devuelve sus 15 propiedades explícitas. Conserva propietario, relaciones, orden de consultas, conexión e aislamiento existentes. `service.ts` tipa entradas desconocidas, validaciones, escrituras y recibos. `transfers.ts` reutiliza cuentas y transferencias de la instantánea: elimina una consulta al transferir y dos al revertir.
2. **Rutas y planes:** `commands.ts` modela las acciones y respuestas; `editorContracts.ts` vincula acción, esquema, valores y nombres de campos. `MoneyEditor.tsx` distingue entradas y salidas de Zod, conserva borrador de días, errores, foco y UUID. `MoneyContent.tsx`, el cliente y el handler comprueban las fronteras JSON. Un abono puede estar sin confirmar en el formulario, pero el comando requiere `additional: true`.
3. **Fuentes y presentación:** todos los módulos de `src/lib/money/` y `src/components/mi-dinero/` están en TS/TSX. Se tiparon presupuestos, rendimientos, nómina, proyección, desgloses, estados y mínimos mensuales. `latestRequest.ts` se adelantó como dependencia compartida para comprobar deduplicación/cancelación de lecturas sin cambiar su comportamiento.

`persisted.ts` valida `baseline`, `paymentMix`, reglas/historial de rendimiento y snapshots al consumirlos. Admite campos heredados omitidos, nulos, importes numéricos/textuales y metadatos adicionales; conserva la reconstrucción desde conciliaciones y el filtrado previo de entradas de historial sin fecha/regla. Las lecturas no reescriben esos JSON. Una edición sin cambio de tasa conserva incluso las entradas heredadas ignoradas por los cálculos; los recibos repetidos conservan metadatos JSON adicionales. Los tipos de cálculo derivan de Prisma y admiten Decimal, texto/número y Date/fecha según la frontera; los contratos HTTP distinguen sus representaciones serializadas.

## Compatibilidad y fronteras pendientes

- La huella conserva el cuerpo original antes de validar/coaccionar. El cliente no normaliza el comando al enviarlo. Se conserva la transacción con bloqueo por propietario, los recibos, las restricciones de versión/conciliación y las respuestas previas de operaciones repetidas.
- `MoneyContent`, `MoneyEditor`, el handler y el servicio ya están comprobados. La implementación de autorización, recuperación HTTP, Supabase y `runDebtAccountOperation` sigue en JS; no se cuenta como migrada. La identidad recibida y el retorno de la coordinación se validan; el callback transaccional recibe `Prisma.TransactionClient`.
- `legacyCalculations.ts` delimita los cálculos de deudas, cortes y suscripciones pendientes de fase 4. Valida las salidas que consume Mi dinero y acota sus entradas. Retirar esta frontera cuando esos módulos expongan sus propios contratos.
- `ui.ts` declara **solo para Mi dinero** las props de los componentes JSX existentes a partir de sus elementos DOM/Radix y opciones locales. Las aserciones locales documentan esa frontera; no afirman comprobar sus interiores. Retirarlas al migrar los componentes en fase 6. No hay declaraciones globales de módulos, dobles conversiones, `any`, `@ts-ignore`, `@ts-nocheck` ni reglas relajadas.
- Las aserciones de presencia en cálculos corresponden a índices recorridos, referencias añadidas al mapa, resultados de una cuenta o ramas que previamente comprobaron existencia. No sustituyen validaciones de datos externos. Los únicos `@ts-expect-error` nuevos son los 13 casos negativos de contratos.
- Se actualizaron las rutas literales en pruebas. El descubridor de autorización ahora incluye `route.js` **y** `route.ts`; el resolvedor genérico carga la ruta sin fijar extensión. No se perdió el caso de autorización de Mi dinero.

## Verificación

[execution.json](execution.json) registra comandos, códigos de salida, tiempos, versiones y hashes. [collect.py](collect.py) copia exclusivamente archivos versionables a un directorio temporal, sin `.env`, instala con lockfile congelado y usa PostgreSQL local desechable.

- Instalación, `pnpm typecheck`, `pnpm test:types`, `pnpm lint`, `pnpm test` y `pnpm build`: correctos; tiempos en el registro.
- Suite final con PostgreSQL: **845 pruebas correctas, 0 fallos, 0 omisiones**. Se conservan los 840 escenarios de fase 2 y se agregan cinco: JSON heredados, orden de instantánea, transferencias sin lecturas adicionales, cuerpo/recibo del cliente y rechazo de consultas incompletas. El contrato HTTP se comprueba además sobre las respuestas reales de la integración existente.
- **13 casos negativos nuevos** de tipos: entradas/salidas monetarias, campos obligatorios, variantes de comandos, nombres de campos, relaciones Prisma, representación HTTP y respuestas por operación.
- [Referencia del piloto](transfer-reference.log): **12 respuestas idénticas** a fase 0, con saldos, importes, fechas, nulos y campos omitidos conservados.
- Las regresiones existentes cubren presupuestos/consumo diario, historial de pagos, calendario bancario, nómina, rendimientos, abonos reales, conciliaciones y proyección sin escrituras. Las pruebas de persistencia usan PostgreSQL real local; Auth y Google son simulados.
- Persisten las advertencias anteriores de TanStack Table en lint y de consultas concurrentes de `pg`. No se silencian. Los errores deliberados de rollback en logs son parte de las pruebas.

La primera comprobación de lint rechazó invocaciones deliberadamente inválidas en dos pruebas negativas; se cambiaron por accesos a propiedades que prueban el mismo contrato: [log inicial](initial-lint.log). Los primeros tests nuevos necesitaron normalizar objetos al compararlos entre el contexto VM del cargador y Node; no se modificó el comportamiento probado. La primera suite completa dio 842 casos: la comparación de nombres con fase 2 detectó el caso omitido por descubrimiento `.js`; [log previo](tests-before-route-discovery.log). Corregido el descubridor pasó con 843; [log previo a completar respuestas](tests-before-response-contracts.log). Los dos últimos casos del cliente dan el total final de 845.

No se repitió `db:verify`: no cambiaron esquema, SQL, herramientas de reconstrucción ni las garantías transaccionales. Se aplicó el historial completo a una base vacía local y se ejecutaron las integraciones. La evidencia de reconstrucción/RLS de fases 0/1 sigue siendo histórica, no una ejecución nueva de esta fase.

## Navegador → API → PostgreSQL → interfaz

Se usó el [fixture existente](../../../tests/helpers/money-browser-server.cjs), compilado con Webpack en un directorio aislado, con Auth ficticia y PostgreSQL local. Verificación con `agent-browser`, revisión de React y `vercel:verification`. El [servidor](browser-server.log) confirmó el arranque; [peticiones y comprobaciones](browser-checks.json) y [persistencia posterior](browser-persistence.json) acreditan:

| Flujo | Resultado |
| --- | --- |
| Alta de cuenta | Saldo 1000.25, reserva 100, tasa 36.5; importe enviado como número y saldo reflejado |
| Conciliación | Saldo 1100.25, versión 2 e historial de una conciliación; devuelve foco al botón |
| Formulario inválido | Importe cero y borrador `15, 31,` conservados, sin POST adicional |
| Nómina | Plan de 500, días 15/31 y adelanto bancario; fecha del 31 proyectada al 30 de octubre |
| Escenario | Consulta GET, sin mutación; no crea ingresos ni gastos |
| Respuesta perdida | Edición a 550.25 confirmada en BD y respuesta descartada en el navegador; aviso de resultado incierto, conserva borrador/UUID y reenvía el mismo cuerpo |
| Reenvío | Mismo recibo, una sola actualización, plan versión 2 |
| Asignación | `default:income` persiste la cuenta elegida |
| Teclado/foco | Título enfocado al abrir, selección con teclas y foco restaurado al cerrar |
| Escritorio/móvil | 1280 px y 390 × 844; no hay desbordamiento horizontal de documento; la navegación conserva su scroll propio |
| BD final | Una cuenta, una conciliación, un plan, una regla y cinco recibos para seis POST; cero ingresos y gastos |

Capturas inspeccionadas: [planes en escritorio](plans-desktop.png), [proyección móvil](projection-mobile.png) y [edición móvil tras respuesta perdida](plan-mobile-retry.png). [Sin excepciones de aplicación](browser-errors.log). Se comprobaron formularios representativos; pagos, presupuestos mixtos, transferencias y otros escenarios se cubren además con la suite de integración, no con una nueva prueba manual de cada variante. No se acredita Supabase Auth ni proveedores externos reales.

## Reproducir

Crear una base PostgreSQL vacía desechable siguiendo el README, aplicar las migraciones y ejecutar:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55443/afp_test_phase3 \
  python3 artifacts/typescript-migration/phase-3/collect.py

AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55443/afp_test_phase3 \
  AFP_CAPTURE_TEST_PRODUCTION=1 node tests/helpers/money-browser-server.cjs
```

El fixture sirve `http://127.0.0.1:4216`; admite credenciales ficticias desde `/login`. El recolector no automatiza el recorrido manual documentado arriba. Detener fixture y base desechable al terminar. La siguiente fase es el núcleo financiero y API compartida; no hay publicación pendiente implícita en esta entrega.
