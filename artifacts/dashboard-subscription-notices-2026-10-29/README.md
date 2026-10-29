# Avisos de suscripciones y borde de nómina · 2026-10-29

## Alcance

- Suscripciones activas en efectivo y con tarjeta en Avisos importantes, desde dos días antes del cobro, según America/Mexico_City. Incluye el cambio de mes/año y los días 29–31 en meses cortos; conserva la recurrencia, el inicio y la desactivación.
- Los gastos vinculados, las confirmaciones por período, las omisiones y los comprobantes bancarios válidos resuelven únicamente su ocurrencia. Borrar el gasto confirmado permite recuperar el aviso. La consulta de Dashboard/resumen retiene los gastos del mes siguiente cuando hay aviso anticipado y los contabilizados fuera de ventana con vínculo al período.
- El nuevo tipo CARD_SUBSCRIPTION permite navegar a Gastos y ocultar/restaurar la ocurrencia durante el mes, igual que efectivo. Los identificadores existentes de efectivo se conservan. Android comparte generador, destino y preferencias; no se requiere cambiar la APK.
- El borde Q15/Q30 del dashboard de escritorio se aplica a la primera celda de cada pago. Evita que la regla de TableBody que borra los bordes de la última fila retire el indicador de BBVA. No cambia el componente Table compartido ni el cálculo de nómina.

Implementación local. Sin cambios de dependencias, migraciones, datos reales ni despliegue.

## Verificación automatizada

Todos los comandos finalizaron con código 0:

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| `pnpm typecheck` | Correcto | [Log](typecheck.log) |
| `pnpm typecheck:tests` | Correcto | [Log](typecheck-tests.log) |
| `pnpm test:types` | Correcto | [Log](test-types.log) |
| `pnpm lint` | 0 errores; dos advertencias previas | [Log](lint.log) |
| `pnpm test` con PostgreSQL local desechable | 999 correctas; 0 fallos; 0 omisiones | [Log](test.log) |
| `pnpm build` | Compilación de producción correcta | [Log](build.log) |

Diez regresiones nuevas: ocho casos del generador de suscripciones, un caso de paridad/aislamiento/ocultación entre Dashboard, resumen y Android, y un caso de integración real sobre avisos al cambiar de mes, gastos anticipados y confirmaciones contabilizadas fuera de ventana. Las pruebas existentes incluyen las comprobaciones financieras bajo UTC, México, Tokio y Kiritimati.

Las advertencias previas de lint corresponden a `loadSubscriptions` sin usar en Gastos y a la memoización de TanStack Table en el componente compartido. La [inspección mecánica de UI](impeccable.json) señala únicamente los dos bordes laterales de 4 px existentes para nómina: se conservan intencionalmente porque son el indicador que el usuario pidió corregir.

## Verificación en navegador

Fixture Next compilado para producción, autenticación ficticia y API/PostgreSQL locales reales, mediante `tests/helpers/money-browser-server.ts`. Tres tarjetas ficticias y tres suscripciones (efectivo, tarjeta y una desactivada); ninguna fila corresponde a datos personales reales.

| Frontera | Comprobación |
| --- | --- |
| Página → API → PostgreSQL | Dashboard y resumen responden 200, `private, no-store`, y los mismos cinco avisos: tres tarjetas y dos suscripciones activas. [Resultado](browser-desktop.json) |
| API → escritorio | A 1440 px aparecen ambas suscripciones y los tres indicadores de nómina de 4 px. BBVA queda al final y conserva el color Q15; la tarjeta Q30 conserva el rosa. Sin desbordamiento horizontal. [Captura](desktop.png) |
| Escritorio intermedio | A 1024 px, BBVA conserva 4 px de borde y no hay desbordamiento horizontal. |
| API → móvil | A 390 × 844 px, el diálogo incluye efectivo y tarjeta; ambos avisos tienen opciones y destino `/gastos`. Las tres tarjetas conservan su borde. [Resultado](browser-mobile.json), [avisos](mobile-notices.png), [pagos](mobile-payments.png) |
| Navegación | Pulsar el aviso de tarjeta en escritorio abre `/gastos`. |
| JavaScript | Navegador limpio sobre el fixture de producción: ningún error de página. [Resultado](browser-errors.json) |

La prueba de persistencia de ocultaciones está en los casos automatizados; el fixture de navegador simula ese endpoint. El [log del servidor](browser-server.log) conserva una advertencia de deprecación de `pg` sobre consultas concurrentes, sin fallo de las peticiones. No se validó una sesión ni una instalación Android de producción.

## Reproducción

Usar una base desechable local con nombre `afp_test*`, aplicar las migraciones existentes y ejecutar los seis comandos del README, proporcionando `AFP_TEST_DATABASE_URL` a las pruebas. Para los escenarios nuevos por separado:

```bash
pnpm test subscription-notices.test.ts android-notices.test.ts history-window-integration.test.ts
```

El caso de PostgreSQL necesita esa variable; sin ella se omite. Las verificaciones aquí registradas sí utilizaron PostgreSQL y no tuvieron omisiones.
