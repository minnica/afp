# Fondos sólidos de avisos · 2026-10-29

Se sustituye el fondo de categoría al 5% por colores opacos definidos en OKLCH para azul, rosa, verde, violeta y ámbar. Cada tema tiene sus propios tonos: fondos profundos y más saturados en oscuro y fondos claros coloreados en claro. La apariencia no depende del fondo situado detrás del aviso.

El ajuste afecta a `globals.css` y a la variante `notice` de Alert. Se conservan iconos, etiquetas, urgencia, contenido, bordes, interacción y cálculos financieros. La categoría desconocida utiliza el fondo opaco de Card como respaldo.

Implementación local, sin cambios de dependencias, datos reales, migraciones nuevas ni publicación.

## Verificación

Los seis controles terminaron correctamente: [typecheck](typecheck.log), [typecheck:tests](typecheck-tests.log), [test:types](test-types.log), [lint](lint.log), [pruebas](test.log) y [build](build.log). La suite conserva 999 escenarios correctos, sin fallos ni omisiones, con PostgreSQL local desechable. Lint conserva las dos advertencias previas de Gastos y TanStack Table.

En el fixture Next de producción, con autenticación y datos ficticios:

- [Escritorio a 1440 px](desktop.png) y [móvil a 390 px](mobile.png) muestran las cinco categorías con fondos sólidos. Se conservan las etiquetas y la distribución.
- Las cinco superficies tienen alfa igual a 1, tanto en [claro](opaque-backgrounds.json) como en [oscuro y móvil](mobile-layout.json). No hay desbordamiento de los avisos móviles.
- Todas las etiquetas, títulos y descripciones superan 4.5:1, y los iconos superan 3:1. Los mínimos de texto son 5.23:1 en oscuro y 4.64:1 en claro. [Mediciones de oscuro](contrast-dark.json), [mediciones de claro](contrast-light.json).
- La comprobación adicional con un pago vencido y una cuenta que vence hoy conserva esos mínimos de texto y supera 3:1 en los iconos de urgencia: 3.92:1 en oscuro y 3.44:1 en claro. [Oscuro](contrast-urgencies-dark.json), [claro](contrast-urgencies-light.json).
- [Sin errores de página](browser-errors.json) ni [hallazgos del detector Impeccable](impeccable.json).

El contraste se calcula desde los colores computados y muestras Canvas sRGB, componiendo los fondos de los ancestros para las etiquetas que conservan transparencias. El fondo principal del aviso es opaco y no requiere esa composición.
