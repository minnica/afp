# Android 0.8.1 · apertura en Gastos

Actualización autorizada e instalada por USB el 29 de octubre de 2026 en el S24 Ultra personal. La APK anterior, 0.8.0 / versionCode 11, incorporaba `/dashboard`, aunque el código web y la configuración Android ya tenían preparado el inicio móvil en Gastos. Se aumentó la versión a **0.8.1 / 12**, se compiló con la misma firma y se instaló sobre la existente mediante `adb install -r`.

## Comprobaciones

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| APK firmada | Paquete `com.garatachia.afp`, 0.8.1 / 12, `web_url=https://finanzas.garatachia.com/gastos` | [Metadatos y huellas](apk-check.json) |
| Firma | Certificado original; el dominio publica la identidad esperada | [Digital Asset Links](assetlinks-check.log) |
| Compilación Android | `:app:testDebugUnitTest :app:lint :app:assembleRelease`, correcta con Temurin 21.0.13+9 | [Log](android-checks.log) |
| JVM | 25 correctas, cero fallos y una integración HTTPS local opcional omitida por no iniciar su fixture | [Totales](apk-check.json) |
| Lint | Cero errores y once advertencias: objetivo de API, versiones de herramientas/dependencias y seis sugerencias UseKtx | [Resumen](lint-summary.json) |
| Instalación | `Success`; el SHA-256 del APK instalado coincide con el archivo verificado | [Instalación](install.log), [huella](apk-check.json) |
| Conservación | Misma fecha inicial, teléfono autorizado, permiso de notificaciones, lector presente, batería exenta y dominio verificado | [Antes](device-before.json), [Después](device-after.json) |
| Cola local | 0 pendientes, 0 por revisar y los mismos 960 entregados | [Antes](device-before.json), [Después](device-after.json) |
| Apertura tras actualizar | Encabezado Gastos y acción Nuevo gasto; sin barra del navegador | [Primera apertura](navigation-first-open.json) |
| Volver desde la pantalla nativa | Gastos conserva la apertura correcta con la TWA anterior existente | [Reapertura](navigation-reopen.json) |

La integración omitida es `CaptureDeliveryJvmTest.httpsPairingDeliveryPauseAndRevocationAgainstLocalServer`. El primer intento de Gradle seleccionó `testReleaseUnitTest`, que no existe en este proyecto; se utilizaron las tareas documentadas. [Selección inicial](android-task-selection.log).

## Alcance

Se respaldaron los archivos de firma y la APK instalada anterior en almacenamiento privado, fuera de Git. La actualización conservó los datos existentes y la vinculación; no se desinstaló la aplicación ni se borró su almacenamiento. La primera instalación sigue fechada el 20 de octubre de 2026; la actualización figura el 29 de octubre a las 14:27:27, hora del teléfono.

La verificación usó la pantalla real y sus elementos de accesibilidad. Los XML temporales se eliminaron y los artefactos conservan solo metadatos y etiquetas de navegación, sin capturas financieras, textos bancarios, credenciales ni identificador USB. Se dejó el teléfono mostrando Gastos.

El icono de la APK conserva la pantalla nativa de captura; «Abrir AFP» abre la interfaz financiera en Gastos. No se modificó ese flujo nativo, no se ejecutaron operaciones financieras de prueba y no se publicaron cambios web ni migraciones.
