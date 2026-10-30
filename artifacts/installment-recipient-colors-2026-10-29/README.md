# Colores de destinatario en Compras a meses

Las compras propias usan un badge azul y las realizadas para otras personas uno violeta. La misma composición se utiliza en la tabla de escritorio y en las tarjetas móviles, conservando los nombres, los iconos y el ajuste de línea.

Se añadieron dos variantes optativas de Badge y pares semánticos de fondo y texto en `globals.css`, con valores independientes para claro y oscuro. Los fondos son opacos. Las demás variantes de Badge conservan sus estilos.

## Comprobaciones técnicas

Los seis controles del README son correctos: tipos web y pruebas, contratos de tipos, lint, suite con PostgreSQL local desechable y compilación. La suite conserva **1,007 escenarios correctos, sin fallos ni omisiones**. Lint mantiene sus dos advertencias previas. No se añadieron pruebas para este cambio de presentación.

El detector mecánico sobre los tres archivos de interfaz no encontró incidencias. El cálculo numérico de los cuatro pares de tokens supera 4.5:1: **5.22:1 y 5.54:1** en claro; **6.81:1 y 6.69:1** en oscuro. Los valores y el método están en `contrast.json`; este cálculo no acredita el render.

Por instrucción del propietario, no se abrió un navegador, no se validó visualmente la interfaz ni se tomaron capturas. La revisión visual queda pendiente de su comprobación manual. Cambio local, sin publicación ni escrituras en datos reales.
