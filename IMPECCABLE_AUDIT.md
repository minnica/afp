# Auditoría técnica de interfaz — AFP

Fecha: 2026-09-28. Alcance: `src/app`, módulos de `src/components`, componentes compartidos y rutas de datos que afectan a la interfaz.

Revisión de código y comprobaciones locales; sin validación visual ni certificación WCAG. No se modificó código de aplicación. La crítica heurística independiente solicitada queda pendiente de la autorización de subagentes requerida por `impeccable/reference/critique.md`; este documento no la sustituye.

## Veredicto de antipatrones

Hay dos patrones concretos que conviene corregir: franjas laterales de 4 px en pagos y contenedores decorativos dentro de tarjetas. No hay evidencia suficiente para concluir visualmente que la aplicación «parece generada por IA». Geist, el tema oscuro y una navegación convencional son apropiados para una herramienta; no son defectos por sí solos.

## Salud técnica provisional

| Dimensión | Puntos / 4 | Evidencia principal |
|---|---:|---|
| Accesibilidad | 1 | Etiquetas sin asociación y ordenación dependiente del ratón |
| Rendimiento | 2 | Filtrado con carreras y consultas de historial sin límite |
| Responsive | 2 | Controles compactos de 24–28 px; geometría pendiente de navegador |
| Temas | 3 | Tokens compartidos; gráficos con valores fijos y toast desacoplado |
| Antipatrones | 2 | Franjas laterales y contenedores anidados |
| Total | **10/20** | Aceptable según escala del skill; requiere trabajo significativo |

La puntuación caracteriza la implementación revisada, no mediciones de Core Web Vitals ni una prueba completa de accesibilidad. Hallazgos confirmados: **13 familias — 0 P0, 3 P1, 10 P2, 0 P3**. Las hipótesis de la sección final no están incluidas en estos totales.

## Hallazgos

### A01 · P1 · Formularios y acciones sin identificación programática

- Categoría: accesibilidad.
- Ubicación: `src/components/ingresos/IngresosContent.jsx:474`, `src/components/configuracion/SettingsContent.jsx:327` y `:371`; también compras a meses, cuentas por cobrar/pagar, suscripciones y tarjetas.
- Evidencia: 90 declaraciones de `Label` sin `htmlFor` en esos siete módulos. En ejemplos inspeccionados el control es hermano de la etiqueta y carece de `id` y nombre ARIA. El botón de eliminar en configuración contiene solo `Trash2`, sin nombre accesible. Es un conteo de declaraciones fuente, no de elementos simultáneos en DOM. Gastos sí asocia sus 23 etiquetas.
- Impacto: los lectores de pantalla no reciben de forma consistente el propósito del campo o la acción; pulsar la etiqueta no enfoca el control.
- Estándar: WCAG 1.3.1 y 4.1.2. La mera presencia de texto visible no establece la asociación.
- Recomendación: identificadores únicos y `htmlFor`, nombres explícitos para botones de icono y asociación de ayudas/errores. Replicar el patrón ya existente en Gastos.
- Comando: `$impeccable harden src/components`.

### A02 · P1 · La ordenación de tablas no funciona por teclado

- Categoría: accesibilidad.
- Ubicación: `src/components/ui/data-table.jsx:142`, `src/components/ui/table.jsx:72`.
- Evidencia: `onClick` en un `th` sin botón interno, foco o manejador de teclado; tampoco se informa `aria-sort`.
- Impacto: un usuario que navega con Tab no puede activar la misma ordenación disponible con ratón.
- Estándar: [WCAG 2.1.1, teclado](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html).
- Recomendación: botón dentro del encabezado y `aria-sort` en la columna ordenada; conservar indicadores visuales.
- Comando: `$impeccable harden src/components/ui/data-table.jsx`.

### A03 · P1 · Los resultados pueden corresponder a un filtro anterior

- Categoría: rendimiento / corrección de actualización de interfaz.
- Ubicación: `src/components/gastos/GastosContent.jsx:298` y `:502`.
- Evidencia: el debounce cancela únicamente el temporizador; `loadExpenses` no cancela solicitudes en vuelo ni verifica su vigencia antes de actualizar estado. Reproducción local ejecutando la función extraída del archivo con dos respuestas controladas: llega primero la consulta nueva y luego la anterior; el resultado final es el anterior.
- Impacto: los controles muestran un filtro mientras tabla y totales pueden mostrar otro conjunto de gastos. También el indicador de carga puede finalizar prematuramente.
- Recomendación: cancelar la solicitud anterior y/o usar un identificador monotónico; actualizar datos, error y carga solo para la solicitud vigente.
- Comando: `$impeccable harden src/components/gastos/GastosContent.jsx`.

### A04 · P2 · El estado vacío elimina el selector necesario para salir de él

- Categoría: interacción / robustez.
- Ubicación: `src/components/dashboard/DashboardContent.jsx:932`; patrón similar condicionado a datos ausentes en `:551`.
- Evidencia: si un mes no tiene elementos de consumo mínimo, `CardUsageWaiverProgress` devuelve `null`, incluido su selector de mes. El estado seleccionado permanece dentro del componente.
- Impacto: al elegir un mes sin datos se pierde el control para volver al mes anterior; recargar restablece la selección. En comparación semanal, un objeto de datos ausente elimina también sus filtros.
- Recomendación: conservar encabezado y selectores y sustituir únicamente el contenido por un estado vacío con acción de recuperación. Probar meses sin tarjetas y categorías sin comparación disponible.
- Comando: `$impeccable harden src/components/dashboard/DashboardContent.jsx`.

### A05 · P2 · Controles demasiado compactos para uso táctil cómodo

- Categoría: responsive.
- Ubicación: `src/components/ui/button.jsx:25`, `src/components/ui/input.jsx:15`, `src/components/ui/select.jsx:42`.
- Evidencia: controles predeterminados `h-7` / `size-7` (28 px con escala normal), variantes pequeñas de 24 px, sin ampliación específica para puntero grueso.
- Impacto: seleccionar campos y acciones requiere precisión innecesaria en móvil, especialmente durante captura de gastos.
- Estándar: 44×44 px es el objetivo de comodidad del skill y el criterio mejorado AAA; **estar por debajo de 44 px no prueba incumplimiento AA**. WCAG 2.2 AA exige 24×24 o excepciones de separación, que requieren comprobar la geometría real. [W3C 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Recomendación: controles táctiles de al menos 44 px de altura y separación suficiente, conservando densidad de escritorio cuando corresponda.
- Comando: `$impeccable adapt src/components/ui`.

### A06 · P2 · Landmarks duplicados y títulos sin semántica de encabezado

- Categoría: accesibilidad.
- Ubicación: `src/components/ui/sidebar.jsx:279`, `src/components/layout/AppShell.jsx:30`, `src/components/ui/card.jsx:40`.
- Evidencia: `SidebarInset` genera `main` y las pantallas insertan otro `main` dentro. `CardTitle` genera `div`; los títulos de secciones no constituyen encabezados navegables. En login, el título visible también es `CardTitle`.
- Impacto: la navegación por regiones y encabezados pierde estructura útil.
- Recomendación: un único `main` y encabezados h1/h2/h3 adecuados, sin cambiar su apariencia.
- Comando: `$impeccable harden src/components/layout`.

### A07 · P2 · Las altas no usan formularios HTML

- Categoría: accesibilidad / interacción.
- Ubicación: `src/components/ingresos/IngresosContent.jsx:472` y `:565`; mismo patrón en otros módulos de captura, incluido Gastos.
- Evidencia: campos en `div` y guardado mediante `Button type="button"` con `onClick`. Ninguno de los ocho módulos de captura/configuración inspeccionados declara `form`; login sí lo hace.
- Impacto: Enter no envía de manera convencional y las restricciones `min`/`step` no activan la validación nativa de envío. Las validaciones del servidor siguen existiendo: no se afirma que se acepten datos inválidos.
- Recomendación: `form onSubmit`, botón submit, validación local y errores asociados a cada campo; conservar la validación de servidor.
- Comando: `$impeccable harden src/components`.

### A08 · P2 · Los errores globales carecen de anuncio y recuperación contextual

- Categoría: accesibilidad / estados.
- Ubicación: `src/components/configuracion/SettingsContent.jsx:181`, `src/components/dashboard/DashboardContent.jsx:406`, `src/app/login/page.js:108`.
- Evidencia: mensajes condicionales en `div` o `p`, sin región viva o gestión explícita del foco. Los módulos inspeccionados no asocian errores con `aria-describedby`. Login expone directamente `err.message` y menciona Supabase en la confirmación de registro.
- Impacto: el lector de pantalla puede no anunciar el fallo; el usuario debe buscar qué corregir o cómo reintentar.
- Recomendación: errores por campo, resumen anunciado cuando corresponda y acción concreta de recuperación. Traducir mensajes de autenticación y describir la confirmación de correo en lenguaje de usuario.
- Comandos: `$impeccable harden src/components` y `$impeccable clarify src/app/login/page.js`.

### A09 · P2 · Falta alternativa local de movimiento reducido

- Categoría: accesibilidad / movimiento.
- Ubicación: `src/components/ui/skeleton.jsx:10`, `src/components/ui/sidebar.jsx:192`, `src/components/ui/dialog.jsx:62`, `src/components/dashboard/DashboardContent.jsx:981`.
- Evidencia: pulso, desplazamientos y transición de ancho sin `motion-reduce` ni regla global de reducción en código de aplicación. Sonner sí incluye su propia protección; no se atribuye a todos los proveedores esta ausencia.
- Impacto: la preferencia del sistema no se respeta de forma consistente.
- Recomendación: cancelar animaciones no esenciales bajo `prefers-reduced-motion`, mantener el estado final y revisar animaciones de gráficos. No equivale por sí solo a afirmar una infracción AA de todas estas animaciones.
- Comando: `$impeccable animate src/components`.

### A10 · P2 · Los gráficos y notificaciones no comparten plenamente el tema

- Categoría: theming.
- Ubicación: `src/components/dashboard/DashboardContent.jsx:472`, `src/components/ui/sonner.jsx:13`, `src/app/layout.js:34`.
- Evidencia: paleta/tooltip/ejes con hexadecimales en lugar de tokens. La raíz fuerza `.dark` y Sonner usa `useTheme()` sin un `ThemeProvider`, con fallback `system`.
- Impacto: las notificaciones pueden elegir esquema del sistema distinto al de la aplicación; los gráficos no siguen cambios de tokens. La existencia de tokens claros no implica que haya un selector claro/oscuro disponible.
- Recomendación: una fuente común para el tema de app y notificaciones; tokens semánticos para gráficos. Mantener oscuro fijo es válido si es una decisión del producto.
- Comando: `$impeccable extract src/components/dashboard`.

### A11 · P2 · La paginación visual no limita el trabajo de datos

- Categoría: rendimiento.
- Ubicación: `src/app/api/expenses/route.js:183`, `src/components/ui/data-table.jsx:67`, `src/app/api/dashboard/route.js:1136`.
- Evidencia: gastos consulta resultados sin `take`/cursor y además todas las fechas del usuario para construir meses disponibles; la tabla pagina en cliente. Dashboard consulta historiales completos y calcula agregaciones.
- Impacto: al crecer el historial aumenta el trabajo de red/servidor/cliente, aunque solo se vean diez filas. Es un riesgo de escalabilidad comprobable por implementación, no una medición de lentitud actual.
- Recomendación: paginación y totales en servidor, consulta de meses agregada y alcance temporal explícito para dashboard. Medir antes de optimizar otras partes.
- Comando: `$impeccable optimize src/components/gastos`.

### A12 · P2 · Contenedores anidados y franjas laterales

- Categoría: antipatrones.
- Ubicación: `src/components/dashboard/DashboardContent.jsx:146`, `:605`; `src/components/configuracion/SettingsContent.jsx:352`.
- Evidencia: acentos `border-l-4` para quincenas; cifras y filas rodeadas por bordes/fondos dentro de tarjetas ya delimitadas.
- Impacto: repetición de contornos compite con jerarquía de tareas y datos.
- Recomendación: quincenas con etiqueta explícita, filas/separadores para listas y bloques de cifras sin una segunda tarjeta. Preservar etiquetas de estado y señales financieras útiles.
- Comando: `$impeccable distill src/components/dashboard`.

### A13 · P2 · Cuentas por pagar aparece como «AFP» en el encabezado

- Categoría: navegación / consistencia.
- Ubicación: `src/components/layout/AppShell.jsx:11`.
- Evidencia: `/cuentas-por-pagar` existe en navegación, pero falta en `pageTitles`; se usa el fallback `AFP`.
- Impacto: la ubicación actual pierde su nombre, especialmente con sidebar oculta.
- Recomendación: añadir la ruta y compartir los metadatos de navegación con los títulos para evitar divergencias.
- Comando: `$impeccable clarify src/components/layout`.

## Patrones sistémicos

- La accesibilidad varía por módulo: Gastos resuelve etiquetas y acciones de icono que otros módulos no resuelven.
- Los componentes base concentran tanto fortalezas (foco, portales, tokens) como problemas (densidad táctil, semántica). Corregirlos tiene alcance transversal.
- Los estados vacíos, errores y carga necesitan conservar los controles con los que el usuario se recupera.
- Dos confirmaciones de borrado coexisten: `AlertDialog` con contexto en Gastos frente a `window.confirm` genérico en Ingresos/Configuración. Ambos confirman; el problema es consistencia, no falta total de confirmación.

## Qué conservar

- Tokens OKLCH coherentes, idioma del documento `es` y formato monetario `es-MX`/MXN.
- Controles Radix con portales, estilos de foco y diálogos de edición con altura máxima y scroll en varios módulos.
- Shell visible durante carga, skeletons por tipo de pantalla, bootstrap de Gastos y detalle de ciclos bajo demanda. El antiguo plan de rendimiento ya no describe un shell globalmente bloqueado en la versión actual.
- Captura offline con estados pendientes, reintento y conservación de errores; revisar confiabilidad completa en una prueba aparte.
- Revelación de opciones secundarias en Gastos y confirmación de borrado con concepto e importe.

## Comprobaciones y límites

- `npm run lint`: código de salida 0, ningún error y una advertencia `react-hooks/incompatible-library` en `data-table.jsx:57`. No se interpreta como un fallo observado ni como prueba de lentitud.
- Reproducción controlada de A03: confirmada utilizando la función fuente y respuestas simuladas; sin llamadas a datos reales.
- Contraste calculado de tokens acromáticos: `muted` oscuro sobre `card` ≈6.91:1; texto principal oscuro sobre `card` ≈17.16:1. No hay fallo en esas parejas. En tokens claros, `muted-foreground` sobre `muted` opaco ≈4.34:1; **riesgo latente**, no fallo contado de la UI actual, que fuerza oscuro. No se midió todo el contraste compuesto/renderizado.
- Servidor de desarrollo arrancó en 127.0.0.1:3000. Tanto curl como fetch local fallaron por restricciones de entorno (`Operation not permitted` / `EPERM`). Se detuvo la sesión con Ctrl-C y salida 0.
- Sin navegador conectado, screenshots, mediciones de viewport, zoom, lector de pantalla ni métricas de rendimiento actuales. `agent-browser` no está en PATH. No se intentó autenticar ni modificar información financiera.
- No se ejecutó build: no se cambió implementación y el alcance fue auditoría de interfaz; lint no sustituye el build.
- El detector de critique no se ejecutó para evitar contaminar la evaluación independiente A antes de autorizar y completar su proceso.

### Riesgos por verificar visualmente, fuera del conteo

En `DashboardContent.jsx:961`, consumo mínimo mantiene columnas `190px 1fr 160px auto` desde `md`, mientras su contenedor pasa a media página desde `lg`. Existe riesgo concreto de desbordamiento/recorte con sidebar abierta cerca de 1024–1280 px. Verificar a 320, 390, 768, 1024 y 1280 px y con zoom al 200%; no se afirma que se haya reproducido en navegador.

## Orden sugerido

1. `$impeccable harden`: A01–A04 y A06–A08; priorizar etiquetas, teclado y coherencia de filtros.
2. `$impeccable adapt`: controles táctiles y verificación de la cuadrícula de consumo mínimo.
3. `$impeccable optimize`: paginación y alcance de consultas, con mediciones.
4. `$impeccable extract`, `$impeccable clarify`, `$impeccable animate` y `$impeccable distill`: resolver los hallazgos restantes según alcance elegido.
5. `$impeccable polish`: comprobación final de integración. Después, repetir `$impeccable audit`.
