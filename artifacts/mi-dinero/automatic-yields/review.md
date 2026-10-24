disposition: fix

No se entregaron comp ni tarjeta QUALITY BAR; el referente es el incumbente descrito en `.impeccable/surfaces/my-money.md` y `PRODUCT.md`, para una extensión ordinaria Operate. Sin navegador; las pruebas de interacción del paquete son evidencia reportada, no repetida por este reviewer.

## persistence

Pass. `PRODUCT.md` y el contrato de superficie existen y describen el mundo construido: Geist, superficies oscuras neutras, Mira local, números tabulares y controles principales de 44 px. No hay sustitución de identidad que exija un nuevo DESIGN.md, una ronda de comps ni un concept roll.

Las seis capturas requeridas existen, tienen contenido válido y corresponden a sus nombres: cuentas 1440×1115 y 390×1810; formulario desplegado con scroll 390×844 y 320×740; proyección 1440×2296 y 390×2877. Los diálogos están capturados en posiciones de scroll anunciadas; los archivos de página muestran su comienzo. El botón N se considera chrome de la fixture local. No se leyeron estados de cuenta privados.

El detector entregado contiene `[]`. Axe: cuentas y formulario tienen cero infracciones; el archivo de proyección contiene una infracción `region` con 13 nodos del sidebar compartido. Debe reportarse como hallazgo del shell fuera del alcance, sin afirmar cero infracciones globales. Permanecen comprobaciones manuales incompletas de axe; no se convierten en aprobaciones automáticas.

## fidelity

| Elemento o promesa | Estado | Evidencia |
|---|---|---|
| TYPE | match | Texto de 12–14 px, títulos y saldos jerarquizados, importes tabulares; carácter y peso coherentes con el incumbente. |
| MATERIAL | match | Superficies y controles digitales neutros; ningún material físico simulado ni nuevo recurso ornamental. |
| GROUND | match | Fondo negro neutro y paneles grises oscuros, consistentes con el mundo oscuro fijado en el contrato. |
| Cuentas y dinero a la vista | match | Saldo domina cada cuenta; reserva y disponible quedan explicados debajo. `A la vista`, conciliación y edición permanecen visibles. |
| Origen de rendimientos | match | Las cuentas indican el importe incluido como cálculo AFP y el pendiente de abono; el formulario llama estimaciones a estos importes. La fuente etiqueta los movimientos históricos calculados y la tabla futura usa `Estimado`. |
| Formulario móvil | adaptation | El scroll interno y el pie fijo conservan Guardar/Cancelar a 390 y 320 px; la sección desplegable y los campos condicionales obedecen el contrato de superficie y la necesidad móvil. Sin recorte horizontal de etiquetas o controles en las capturas. |
| Proyección móvil | adaptation | Indicadores y filtros apilados, tabla horizontal con instrucción explícita; adaptación móvil prevista por el contrato. |
| Calendario bancario en la explicación | contradicted | El encabezado de la gráfica afirma «los rendimientos se abonan diariamente». En estas mismas capturas, DiDi y Mercado anuncian abonos en días hábiles, y la tabla agrupa el lunes los rendimientos. La descripción confunde generación diaria con fecha de abono. |
| Datos de demostración | match | Cuentas nombradas `de prueba`, conciliación marcada ficticia y paquete explícitamente ficticio; no se infieren condiciones reales de NU a partir de esta fixture. |

## ceiling

reached para la extensión del sistema vigente: jerarquía funcional, densidad contenida y controles conocidos. No procede añadir ornamentación, un hero ni motion nuevo a este flujo Operate. La ausencia de tarjeta QUALITY BAR limita la comparación a ese incumbente.

## material_fixes

1. Corregir `src/components/mi-dinero/MoneyProjection.jsx:38` para separar cálculo diario y calendario de abono, por ejemplo: «Los rendimientos se calculan por día y se reflejan según el calendario configurado en cada cuenta». Check Truth / principio PRODUCT de explicar el origen y fecha de cada importe; recapturar los mismos archivos de proyección para el verdict pass.

## keep

Conservar los saldos a la vista, la distinción entre cálculo AFP, estimación futura y pendiente de abono, las condiciones por cuenta, el pie fijo del formulario móvil y los componentes/tokens existentes.
