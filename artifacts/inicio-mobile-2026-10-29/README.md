# Inicio móvil y apertura manual de formularios · 29 de octubre de 2026

Implementación local de la entrada móvil en Gastos y de los formularios cerrados al entrar en cada sección.

- `/` consulta el mismo breakpoint que la navegación: abre `/gastos` por debajo de 768 px y `/dashboard` desde 768 px. El login entra por `/`.
- `CreateRecordSurface` comienza cerrado. Gastos, Compras a meses, Suscripciones, Ingresos y Cuentas por cobrar/pagar muestran primero sus listados; sus botones abren los formularios. Los formularios integrados de escritorio conservan su presentación.
- La PWA usa `/` como `start_url`, conserva `/dashboard` como identificador y actualiza el shell a `afp-shell-v5` para retirar la entrada almacenada anteriormente.
- Android configura `/gastos` como URL de apertura. Se comprobó el recurso generado con `:app:processDebugResources`; no se generó ni instaló una nueva APK.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Tipos web, pruebas y contratos | Correctos: [web](typecheck.log), [pruebas finales](typecheck-tests-final.log), [contratos](test-types.log). |
| Lint | Cero errores; conserva dos advertencias anteriores de `loadSubscriptions` y TanStack/React Compiler. [Proyecto](lint.log), [prueba actualizada](lint-test-final.log). |
| Suite completa con PostgreSQL local | **965 correctos, cero fallos y cero omisiones**. [Resultado final](test-final.log). |
| Service worker y autorización | Cinco escenarios correctos. [Resultado](service-worker-tests.log). |
| Build | `pnpm build` correcto con Turbopack y TypeScript. [Log](build.log). |
| Android | Recursos debug generados con `web_url=https://finanzas.garatachia.com/gastos`. [Log](android-resources.log). |

[Comandos, códigos de salida y duraciones](checks.json). La primera suite tuvo 964 correctos y un fallo porque la prueba de limpieza aún esperaba conservar `afp-shell-v4`. Se actualizó el caso existente para comprobar que retira v3/v4 y conserva v5; se repitieron sus tipos, lint y la suite completa. [Primera ejecución](test.log).

## Navegador

Chromium 155 mediante agent-browser, viewport emulado, build de producción, Auth ficticia y PostgreSQL local desechable. [Resultados](browser-acceptance.json).

- Login móvil a `/gastos` y login de escritorio a `/dashboard`.
- Entrada `/` comprobada en 390 y 767 px hacia Gastos, y 768 px hacia Dashboard. Se navegó también la URL declarada por el manifest.
- Los seis formularios comienzan cerrados; cada botón abre uno y «Cerrar» devuelve el foco al botón correspondiente. Dashboard y Tarjetas siguen accesibles desde el menú móvil.
- Un borrador de gasto permanece al cambiar de sección y regresar. Un formulario abierto permanece abierto al pasar de 390×844 a 844×390.
- Recargar Gastos conserva el formulario cerrado. Con el shell y el respaldo cargados previamente, abrir `/` sin conexión llega a Gastos y permite abrir el formulario manualmente.
- Sin desbordamiento horizontal en los tamaños revisados ni excepciones de página registradas.

Capturas: [Gastos al entrar](gastos-mobile.png), [formulario tras pulsar el botón](nuevo-gasto-mobile.png), [Suscripciones al entrar](suscripciones-mobile.png). [Recorrido de formularios](browser-actions.log).

El primer intento automatizado de pulsar «Nuevo gasto» offline encontró un elemento superpuesto durante la navegación. Se repitió esperando a que el botón pudiera recibir el clic y pasó, sin modificar código de producto: [primer intento](browser-entry-actions.log), [recorrido offline final](browser-offline-actions.log).

## Alcance

Las verificaciones usan datos ficticios en dos bases locales separadas, una para la suite y otra para la interfaz. No incluyen Supabase Auth real, dispositivos físicos, Safari, instalación de PWA ni actualización de una APK existente. La web y la configuración Android quedan preparadas localmente; esta tarea no publica ni instala cambios.
