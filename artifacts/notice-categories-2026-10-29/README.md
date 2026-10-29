# Identificación visual de avisos · 2026-10-29

El ajuste posterior de [fondos sólidos](../notice-solid-backgrounds-2026-10-29/README.md) sustituye el tinte inicial al 5%. Estas capturas y mediciones conservan la versión anterior de los fondos.

## Resultado

Antes, el color y el icono dependían del vencimiento: todas las categorías próximas compartían la campana y el fondo ámbar. Ahora el tipo tiene una identidad estable y la urgencia se indica aparte.

| Tipo | Color | Icono |
| --- | --- | --- |
| Pago de tarjeta | Azul | Tarjeta |
| Cuenta por pagar | Rosa | Envío de dinero |
| Cobro programado | Verde | Recepción de dinero |
| Suscripción, en efectivo o con tarjeta | Violeta | Repetición |
| Corte de tarjeta | Ámbar | Tijeras |

Cada aviso tiene una etiqueta textual con su icono y un tinte suave de categoría en fondo y borde. Vencido, Hoy y Próximo tienen una etiqueta independiente con icono de alerta o reloj, para conservar la urgencia incluso sin percibir los colores. Los tipos desconocidos tienen la etiqueta neutra Aviso.

Se utiliza la misma etiqueta en los avisos ocultos y en el diálogo de confirmación. Títulos, descripciones, importes, fechas, orden de prioridad, enlaces, ocultaciones y cálculos financieros permanecen intactos. Implementación local, sin cambios de datos, dependencias, migraciones ni despliegue.

## Implementación

- `NoticeCategory.tsx` centraliza los cinco tipos visuales, sus iconos Hugeicons y las etiquetas de categoría y urgencia.
- Alert y Badge incorporan variantes optativas para avisos; sus variantes y usos existentes se conservan.
- Los tokens de categoría se definen en `globals.css`, con valores propios para claro y oscuro. La urgencia reutiliza los colores semánticos de advertencia y error, con texto de alto contraste.
- `DashboardPanels.tsx` conserva el componente compartido para escritorio y diálogo móvil. `ImportantNotices.tsx` reutiliza la identificación en ocultos y confirmaciones.

## Verificación

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| `pnpm typecheck` | Correcto | [Log](typecheck.log) |
| `pnpm typecheck:tests` | Correcto | [Log](typecheck-tests.log) |
| `pnpm test:types` | Correcto | [Log](test-types.log) |
| `pnpm lint` | 0 errores; dos advertencias previas | [Log](lint.log) |
| `pnpm test` con PostgreSQL local desechable | 999 correctas, 0 fallos, 0 omisiones | [Log](test.log) |
| `pnpm build` | Correcto | [Log](build.log) |
| Detector Impeccable sobre los seis archivos de UI modificados | Sin hallazgos | [Resultado](impeccable.json) |

Las advertencias de lint existentes corresponden a `loadSubscriptions` sin usar en Gastos y a TanStack Table con React Compiler. No se añadieron pruebas que repliquen las clases CSS; el cambio de presentación se comprobó en el navegador.

### Navegador y contraste

Fixture Next compilado para producción, autenticación ficticia y PostgreSQL local mediante `tests/helpers/money-browser-server.ts`. La semilla contiene nueve avisos ficticios que cubren las cinco categorías y los estados vencido, hoy y próximo. Los registros y capturas no contienen datos financieros del usuario.

- [Escritorio a 1440 px](desktop.png): se reconocen las cinco categorías, incluida la repetición de cuentas por pagar con una misma identidad.
- [Escritorio a 1024 px](desktop-1024.json): nueve avisos, cinco categorías y sin desbordamiento horizontal.
- [Móvil a 390 × 844 px](mobile.png): etiquetas de categoría y urgencia, títulos largos y acceso a opciones. [Mediciones](mobile-layout.json).
- [Móvil a 320 × 740 px](mobile-320.json): el diálogo y sus nueve avisos caben sin desbordamiento horizontal.
- [Confirmación de ocultación](hide-confirmation.png): conserva la categoría y la confirmación adicional requerida para ocultar un pago de tarjeta. Se comprobó abrirla y cancelarla, sin modificar movimientos.
- El enlace de cobro programado conserva `/ingresos` y la navegación a esa ruta. Los destinos de tarjetas, suscripciones y cuentas por pagar se conservan en las mediciones del DOM.
- [Errores de página](browser-errors.json): ninguno.

Se midieron los colores computados, componiendo sus transparencias con los fondos de sus ancestros y calculando luminancia sRGB sobre muestras Canvas. Todas las etiquetas, títulos y descripciones superan 4.5:1; los iconos superan 3:1. Mínimos observados:

| Tema | Texto | Iconos | Evidencia |
| --- | --- | --- | --- |
| Oscuro | 6.66:1 | 4.97:1 | [Mediciones](contrast-dark.json) |
| Claro | 4.96:1 | 3.69:1 | [Mediciones](contrast-light.json) |

Las preferencias de ocultación están simuladas por el fixture de navegador; no se acredita aquí su persistencia real ni una sesión de producción. Las pruebas automatizadas existentes cubren sus claves y API. El contraste del tema claro se comprueba aplicando sus tokens en el navegador; AFP mantiene su experiencia habitual oscura.
