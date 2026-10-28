# Fase 4 — Núcleo financiero y API compartida

Implementada sobre `099c438`, 27 de octubre de 2026. Sin publicación ni cambios en esquema, SQL, dependencias o formatos persistidos.

## Alcance

Se convirtieron **43 módulos JS a TS** y se añadieron seis módulos de contratos/lectura JSON:

- Los ocho módulos con contenido de `src/lib/calculations/`: cortes, créditos, pagos parciales, consumo mínimo, MSI, suscripciones y deudas. Tipos de dinero/fechas y relaciones derivados de Prisma, con referencias bancarias verificadas por campo. Los archivos vacíos `dashboard.js`, `installments.js` y `receivables.js` siguen inventariados y no cuentan como migrados.
- Los 14 handlers de tarjetas/ciclos, MSI, suscripciones/cobros, cuentas por cobrar/pagar, ingresos, gastos/bootstrap, Dashboard, avisos, catálogos y preparación del usuario. `/api/money` ya estaba migrado. Las consultas mantienen sus filtros por propietario, selección, orden y transacciones.
- Autorización, Prisma, Supabase, operaciones de gastos, coordinación/bloqueo de deudas, servicios de gastos/suscripciones, seguimiento de crédito, presentación financiera y recuperación HTTP.
- Variantes de gasto `CASH`/`CARD`/`DEBIT`, contratos de deuda/cobro, estados derivados de pago y contratos JSON de lecturas y escrituras. El servicio de gastos usa el comando discriminado después de sus validaciones existentes.
- `financialFetch` valida respuestas dentro de `apiFetch`, antes de entregarlas a los consumidores JSX; conserva cancelación, borrador, cuenta esperada y recuperación. `loadFinancial` ofrece resultados tipados por recurso. Los cambios en las pantallas son sus imports, sin rediseño.
- Mi dinero importa directamente el núcleo financiero; se retiró `legacyCalculations.ts`. Se actualizaron rutas literales de pruebas y herramientas de BD, y los resolvedores dinámicos financieros ya no fijan `.js`.

## Compatibilidad y fronteras

Se conservan acumulados frente a abonos individuales, previsión frente a gasto confirmado y aportación personal frente al cargo bancario completo. El cero bancario confirmado sigue siendo diferente de un estado de cuenta ausente. Los JSON históricos de MSI, conciliación de consumo y seguimiento de crédito se inspeccionan sin reescribirlos. El hash de Gastos conserva el cuerpo original: la lectura de campos no coacciona importes ni elimina metadatos; la canonicalización sigue ordenando las claves. Los recibos serializan Decimal y Date como antes. El contrato de respuesta admite recibos anteriores a débito/aportaciones, conservando sus campos omitidos y metadatos.

No hay `any` explícito/implícito nuevo, declaraciones globales para ocultar módulos, `@ts-ignore`, `@ts-nocheck` ni relajación de reglas. Las aserciones locales cubren índices recorridos/presencia comprobada, representación de enums tras validar y el resultado de un esquema seleccionado por recurso. La recuperación conserva en una misma entrada su callback y su promesa genérica.

El interior de las pantallas/hooks JSX, las props de UI compartida y la cola offline continúan pendientes de fases 5/6. El adaptador cliente valida sus respuestas; no acredita el tipado de esos interiores. Captura y Calendar permanecen en JS: sus llamadas compartidas siguen cubiertas por las integraciones, sin afirmar que sus implementaciones estén migradas. Los tres archivos vacíos de cálculos se resolverán al cierre de fase 7.

## Verificación reproducible

[execution.json](execution.json) registra commit, hashes de esquema/SQL/lockfile, versiones, comandos, tiempos y resultados. [collect.py](collect.py) copia archivos versionables a un directorio temporal **sin `.env`**, instala con lockfile congelado y solo admite PostgreSQL local `afp_test…`.

| Verificación | Resultado |
| --- | --- |
| Instalación limpia | Correcta, lockfile congelado |
| `pnpm typecheck` | Correcto |
| `pnpm test:types` | Correcto; 11 casos negativos nuevos |
| `pnpm lint` | Sin errores; advertencia previa de TanStack Table |
| `pnpm test` con PostgreSQL | **846 correctas, 0 fallos, 0 omisiones** |
| `pnpm db:verify` | Reconstrucción y actualización correctas; 42 migraciones, 45 tablas con RLS |
| Comparación de fase 0 | **12 respuestas idénticas** |
| `pnpm build` | Correcto, con comprobación TypeScript |

La suite conserva los 845 escenarios anteriores y añade una integración que valida los contratos serializados de todos los recursos financieros sobre sus handlers reales y PostgreSQL. Comprueba métodos de gasto, repetición de UUID con recibo histórico sin campos nuevos y con metadatos, cero confirmado, abono parcial y rechazo de respuesta truncada. Las regresiones existentes conservan autorización, relaciones atómicas, concurrencia/rollback, suscripciones, deudas, devoluciones, consumo mínimo, MSI y proyección. Los 11 casos de compilación rechazan métodos sin referencia, deudas/cobros incompletos, JSON sin acotar, estados/fechas/importe mal usados y apertura de transacción desde un cliente transaccional.

Persisten las advertencias previas de consultas concurrentes de `pg`. Los logs de errores deliberados en pruebas verifican rollback. Una primera comprobación detectó el acceso a un campo de selección Prisma genérica; se acotó el resultado a `unknown` antes de inspeccionarlo, sin añadir consultas. Los primeros ensayos de contratos corrigieron la opcionalidad de campos `unknown` y la preparación del fixture; los resultados de esta tabla corresponden al estado corregido.

## Navegador → API → PostgreSQL → interfaz

Se usó el fixture existente de Mi dinero con **Dashboard real**, Auth ficticia y base local. Se compiló con Webpack en una carpeta aislada. `agent-browser` verificó:

- Gastos: bootstrap real, captura en efectivo por **37.25**, envío del formulario, un recibo y un gasto persistido; la tabla muestra importe y concepto y el formulario se limpia. Se usó `requestSubmit()` para enviar el formulario después de que los clics automatizados no lo activaran; no se atribuye esa limitación de automatización a la migración.
- Tarjetas: alta desde el formulario; preparación de 12 ciclos y estado de cuenta **100.25** mediante API. El editor de pago se abrió y guardó con teclado: acumulado **30.10**, pendiente **70.15**, estado `PARTIALLY_PAID` y diálogo cerrado.
- Dashboard: lectura real refleja gasto mensual **37.25** y cero ingresos.
- Móvil **390 × 844**: pendiente y etiqueta de pago parcial visibles; ancho del documento **390**, sin desbordamiento horizontal. Se inspeccionaron las capturas de móvil y Gastos en escritorio.

Evidencias: [comprobaciones](browser-checks.json), [persistencia PostgreSQL](browser-persistence.json), [móvil](browser-mobile.json), [snapshot de tarjetas](tarjetas-snapshot.txt), [Gastos escritorio](gastos-desktop.png), [Tarjetas escritorio](tarjetas-desktop.png), [Tarjetas móvil](tarjetas-mobile.png), [servidor](browser-server.log), [excepciones de navegador](browser-errors.log) (vacío).

No se ejecutó cada formulario manualmente; los demás contratos se verifican con la integración nueva y sus suites existentes. La recuperación, borradores, abortos y cambio de cuenta tienen pruebas de comportamiento existentes. No se verificaron proveedores externos reales ni restauración de foco de cada formulario.

## Reproducir

Crear PostgreSQL local desechable como indica el README y ejecutar:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55444/afp_test_phase4 \
  python3 artifacts/typescript-migration/phase-4/collect.py

AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55444/afp_test_phase4 \
  AFP_CAPTURE_TEST_REAL_DASHBOARD=1 AFP_CAPTURE_TEST_PRODUCTION=1 \
  node tests/helpers/money-browser-server.cjs
```

El fixture sirve `http://127.0.0.1:4216`, con sesión ficticia desde `/login`. El recorrido manual necesita una categoría ficticia para su usuario, porque el fixture omite el setup real de catálogos. El recolector automatiza las verificaciones de la tabla; no el recorrido de navegador. Detener fixture y contenedor al terminar. La siguiente fase es Captura, Calendar y offline.
