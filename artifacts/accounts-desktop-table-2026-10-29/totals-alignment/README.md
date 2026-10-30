# Totales móviles · alineación compacta

Se centra la composición completa del footer: título, etiqueta del saldo, importe verde de 20 px y los tres rendimientos. Se reduce el gap principal de 16 a 12 px y el de etiqueta/importe de 8 a 4 px. La nota pasa a 12 px y se centra en móvil; conserva 14 px y alineación izquierda en escritorio. No se modifican copy, cifras ni cálculos.

UI/UX Pro Max aportó las guías aplicables de reflujo de texto y gaps consistentes. Se renderizó el fragmento JSX real del footer y su nota, con los componentes actuales, CSS de producción y datos ficticios.

- [390 px](mobile-390.png): footer de 153 px de alto, columnas de aproximadamente 111.3 px y alineación centrada. [Mediciones](metrics-390.json).
- [320 px](mobile-320.png): tres columnas de 88 px, nota completa y documento sin desbordamiento. [Mediciones](metrics-320.json).

Lint del archivo modificado, `pnpm build` y `git diff --check` correctos; detector `[]`. No se repitió la suite financiera para este ajuste de presentación. Las capturas corresponden al fragmento y no a una sesión de la aplicación ni producción. Pendiente de publicación.
