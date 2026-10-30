# Mi dinero · cuentas en tabla de escritorio

Cambio local solicitado el 29 de octubre de 2026. Se leyó el README y se aplicaron las guías de Impeccable y shadcn al sistema Mira existente.

## Implementación

- `MoneyAccountsTable.tsx` reutiliza Table, Badge, Button y Collapsible locales, con Hugeicons.
- Tabla desde 768 px: Cuenta, Saldo actual, Disponible tras tu reserva, Rendimiento y Acciones. Importes alineados a la derecha y números tabulares; textos largos ajustables.
- Se conservan las condiciones de rendimiento, cálculo incluido, pendiente de abono y estado automático. Las últimas cinco conciliaciones están disponibles al desplegar cada cuenta.
- Los botones reutilizan los handlers originales. Las cards de móvil conservan contenido y acciones.
- Caption accesible, encabezados de columna/fila con scope, nombres accesibles por cuenta y acciones de 44 px. La tabla es enfocable y admite desplazamiento horizontal interno.

No cambia API, persistencia ni reglas financieras. Pendiente de publicación.

## Verificación del repositorio

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm typecheck:tests` | Correcto |
| `pnpm test:types` | Correcto |
| `pnpm lint` | Sin errores; dos advertencias previas |
| `AFP_TEST_DATABASE_URL=… pnpm test` | 1025 correctas, 0 fallos, 0 omitidas |
| `pnpm build` | Correcto, Turbopack |
| Impeccable detect sobre ambos TSX | `[]` |
| `git diff --check` | Correcto |

Las advertencias de lint son `loadSubscriptions` sin uso en GastosContent y la incompatibilidad de memoización de TanStack Table en ui/data-table. Ninguna pertenece a los archivos modificados. Los logs se conservan en esta carpeta.

## Navegador

Agent-browser con Chrome, fixture Next de desarrollo, autenticación ficticia y PostgreSQL local desechable (`afp_test_accounts_ui`). Cuatro cuentas ficticias cubren efectivo sin rendimiento, tasa anual, importe diario y tasas por tramos; seis conciliaciones permiten comprobar el límite visible de cinco. No se utilizaron datos personales ni servicios de producción.

| Ancho | Resultado |
| --- | --- |
| [1440 px](desktop-1440.png) | Cinco columnas, cuatro cuentas y cero cards visibles |
| [1280 px](desktop-1280.png) | Tabla completa, nombres y condiciones con ajuste de líneas |
| [1024 px](desktop-1024.png) | Tabla de 768 px dentro de un contenedor de 734 px; scroll interno y documento de 1024 px |
| [390 px](mobile-390.png) | Cuatro cards, ninguna tabla visible; sin desbordamiento del documento |
| [320 px](mobile-320.png) | Cuatro cards, ninguna tabla visible; documento de 320 px |

[Historial desplegado](desktop-history.png): muestra cinco de las seis conciliaciones, con fecha, saldo anterior, saldo bancario y motivo. Se comprobó que los ocho saldos de la tabla coinciden con la respuesta HTTP 200 de `/api/money`. Los botones de conciliar Banco ficticio y editar Cajita ficticia abren el formulario correcto; Cancelar devuelve el foco al botón de origen. El registro de errores JavaScript del navegador quedó vacío.

Las capturas son del fixture de desarrollo y pueden incluir el indicador de Next. No acreditan producción ni una instalación Android. La revisión independiente del código y las seis capturas no encontró regresiones materiales.
