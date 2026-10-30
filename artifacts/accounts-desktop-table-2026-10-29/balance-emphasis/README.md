# Footer móvil · saldo centrado y verde

El importe de saldo actual se centra debajo de su etiqueta, usa el verde semántico existente `text-success` y aumenta de 14 a 20 px. Se conservan los importes, los rendimientos y el footer de escritorio.

Se renderizó el fragmento JSX real del footer y su nota con los componentes existentes, datos ficticios y el CSS de producción. Vistas comprobadas en [390 px](mobile-390.png) y [320 px](mobile-320.png), sin desbordamiento. [Medición](metrics.json): alineación centrada, tamaño 20 px, color correspondiente al token verde y desviación del centro menor de 0.01 px.

Lint del archivo modificado, `pnpm build` y `git diff --check` correctos; detector `[]`. No se repitió la suite financiera para este ajuste de clases. Esta vista del fragmento no representa una sesión de la aplicación ni producción. Pendiente de publicación.
