# Registrar ingresos desde avisos de cobro

Implementación local del 14 de noviembre de 2026. No publicada. Datos ficticios, Supabase Auth simulado y API/Prisma/PostgreSQL locales reales; sin cambios de datos personales, migraciones, APK ni dependencias del proyecto.

## Comportamiento

El aviso web de una cuenta por cobrar lleva su identificador explícito y fecha bancaria a `/ingresos`. La pantalla consulta de nuevo las cuentas del propietario y abre «Registrar cobro» con fecha programada, «Pago recibido» si existe en el catálogo, persona, concepto, cuenta relacionada e importe esperado hasta el saldo pendiente. No utiliza nombres ni cantidades de la URL. Si falta el importe esperado o el tipo, se completan personalmente.

El formulario reutiliza los campos y la API de ingresos. Sus valores son independientes del borrador manual; cerrar o guardar devuelve el foco al formulario normal o a «Nuevo ingreso». La URL se consume al preparar el cobro y una visita normal no abre el diálogo. Funciona desde Dashboard y desde el diálogo de avisos móvil, también en la propia página de Ingresos.

Abrir, cancelar y volver a cargar no escriben ingresos. Guardar realiza el POST existente, recalcula la deuda y recarga historial, cuentas y avisos. Conserva la distinción entre guardado fallido y guardado confirmado cuya recarga falla. La preparación rechaza fechas inválidas, cuentas ajenas/eliminadas/canceladas/liquidadas, programación cambiada y avisos con un ingreso registrado en su período.

## Verificación

| Control | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm typecheck:tests` | Correcto |
| `pnpm test:types` | Correcto |
| `pnpm lint` | Sin errores; tres advertencias existentes de React/TanStack fuera del cambio |
| `pnpm test` con PostgreSQL local desechable | 1,179 pruebas correctas; cero fallos u omisiones |
| Regresiones específicas | Siete pruebas de URL, datos vigentes, centavos, fechas, estado, calendario, propietario y abonos existentes |
| `pnpm build` | Correcto; Ingresos conserva prerender con Suspense para la consulta del enlace |
| Detector de interfaz | Sin hallazgos en los archivos modificados |

Las siete pruebas específicas se repitieron después del ajuste final de mensajes. Los logs guardados acompañan este documento. Se usaron dos bases `afp_test_*` separadas: una para la suite y otra para el navegador, en un contenedor PostgreSQL 16 local desechable.

Comprobaciones de navegador con Agent Browser y Chrome, contra `tests/helpers/money-browser-server.ts`:

- Escritorio: el aviso abre un formulario con fecha bancaria y tipo correcto. Un cobro esperado de $500.00 propone $350.25 porque es el saldo restante. Guardarlo produce exactamente un ingreso de $350.25 y la cuenta pasa a `PAID_OFF`; comprobado en PostgreSQL.
- Móvil de 390 × 844: desde la cabecera de Ingresos se abre el cobro con $300.00 esperados. Cerrar conserva un borrador manual de fuente y concepto, no crea un ingreso y devuelve el foco a «Nuevo ingreso».
- Al volver a abrir el aviso se modifica el importe a $125.50 y se guarda una nota. PostgreSQL conserva un solo abono de $125.50 y saldo restante de $1,074.50; la cuenta sigue `ACTIVE`. Los avisos visibles bajan de cuatro a tres.
- Un enlace antiguo a la cuenta liquidada muestra el mensaje correspondiente y no abre el diálogo ni crea otro ingreso.
- La navegación ordinaria mantiene el diálogo cerrado; la URL preparada queda sin parámetros. El historial muestra el ingreso con su cuenta vinculada.
- Inspección visual de escritorio y móvil: campos y controles de guardado utilizables, con desplazamiento interno en ventanas bajas. Consola sin errores JavaScript en el recorrido.

Capturas con datos ficticios: [escritorio](desktop-prefill.png) y [móvil](mobile-prefill.png).

## Reproducción y límites

Ejecutar las migraciones en una base desechable usando el procedimiento del README principal; `tests/helpers/seed-ui.ts` prepara el usuario ficticio. Agregar el tipo «Pago recibido» y una cuenta activa con un día de cobro igual al día actual de México, fecha de origen anterior e importe esperado. Arrancar el fixture con `AFP_UI_TEST_REAL_SETTINGS=1` y `AFP_CAPTURE_TEST_REAL_DASHBOARD=1`. Iniciar sesión como `money-qa@example.test` con una contraseña ficticia de seis o más caracteres. Pulsar el aviso y cotejar el ingreso y el estado de la cuenta.

El cambio no añade confirmaciones de ocurrencias ni idempotencia a `/api/incomes`: conserva el criterio existente de avisos según fechas de los abonos y la transacción de la deuda. La comprobación al abrir no bloquea escrituras concurrentes desde otra pestaña. No modifica notificaciones nativas Android ni los destinos de otros tipos de aviso. La prueba local no acredita un despliegue ni servicios autenticados de producción.
