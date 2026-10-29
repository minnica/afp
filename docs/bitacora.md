# Bitácora del proyecto

Historial resumido de decisiones, cambios, migraciones e incidencias que ayudan a mantener AFP. El funcionamiento vigente y los procedimientos están en el [README](../README.md); los resultados detallados permanecen en [artifacts/](../artifacts/).

Consolidado el **27 de octubre de 2026** a partir del README del commit `4562aa0cec0a46d8b482fdfef96116d1d3040282` y sus evidencias. «Publicado», «aplicado» y «pendiente» describen lo documentado en cada fecha; esta consolidación no incluye una comprobación remota nueva. Se conservan las fechas de los registros originales, que pueden usar hora local o UTC. El nombre de una migración identifica su versión, no demuestra cuándo se aplicó.

## 2026-10-29

### Identificación visual de los tipos de aviso

Avisos importantes distingue pagos de tarjeta, cuentas por pagar, cobros programados, suscripciones y cortes mediante una etiqueta con icono y un color estable por tipo. A petición del propietario, el tinte inicial al 5% se sustituye por fondos opacos con mayor presencia de color y tonos propios para claro y oscuro; las etiquetas Vencido, Hoy y Próximo comunican la urgencia por separado. Se conservan títulos, importes, fechas, orden, enlaces y preferencias de ocultación. La misma identificación se utiliza en móvil, en los avisos ocultos y en la confirmación de ocultación. [Verificación de los fondos sólidos](../artifacts/notice-solid-backgrounds-2026-10-29/README.md).

Se reutilizan Alert y Badge de shadcn con variantes optativas y tokens para ambos temas; los iconos pertenecen a Hugeicons, la biblioteca configurada del proyecto. Cambio de presentación local, sin cambios financieros, migraciones ni publicación. [Verificaciones y capturas](../artifacts/notice-categories-2026-10-29/README.md).

### Avisos de suscripciones activas y borde de nómina en Dashboard

Avisos importantes incluye las suscripciones activas en efectivo y con tarjeta desde dos días antes de su cobro, incluso al cambiar de mes o año, con el día financiero de México. Respeta recurrencia e inicio y retira los cobros confirmados, omitidos o acreditados con comprobantes bancarios válidos. Conserva las claves de ocultación existentes de efectivo e incorpora las de tarjeta, con acceso a Gastos y paridad entre Dashboard, resumen móvil y Android. La consulta acotada recupera también los gastos que resuelven las ocurrencias anticipadas del mes siguiente.

En Pagos de tarjetas de escritorio, el borde de nómina se aplica a la primera celda. La regla compartida que elimina los bordes de la última fila ya no borra el indicador de BBVA; conserva los colores Q15 y Q30 del dashboard.

Pasan los seis controles del README y **999 escenarios sin fallos ni omisiones con PostgreSQL local**; lint conserva sus dos advertencias previas. Implementación local, sin migraciones ni publicación. [Evidencia y alcance](../artifacts/dashboard-subscription-notices-2026-10-29/README.md).

### Pagos de tarjeta identificados desde cargos BBVA por pendiente y vencimiento

Se añade prioridad de pago a la regla automática de cargos genéricos BBVA. Busca estados capturados del propietario, con pendiente positivo, diferencia de hasta $1.00 y vencimiento en ±1 día respecto al día del aviso en México. Una coincidencia registra un abono con la cuenta de salida y el importe real, sin crear gasto; varias coincidencias permanecen por revisar. No se confunde la inferencia con una confirmación bancaria del destinatario. El pendiente incorpora pagos parciales y devoluciones aplicadas; un faltante permanece pendiente y el excedente permitido conserva su importe.

Se añaden dieciséis escenarios de integración, con PostgreSQL local y datos ficticios, sobre fechas, margen monetario, ambigüedad, aislamiento, concurrencia, duplicados, reversión y rollback. La suite completa pasa con **989 escenarios sin fallos ni omisiones** y los seis controles del README son correctos; lint conserva dos advertencias previas. Implementación local, sin migraciones ni APK nueva; publicación pendiente y sin reinterpretación automática del historial. [Evidencia y alcance](../artifacts/bbva-card-payment-match-2026-10-29/README.md).

### APK 0.8.1 instalada: apertura de la interfaz financiera en Gastos

Con autorización explícita, se compiló e instaló por USB **0.8.1 / versionCode 12** con la firma existente. La APK anterior, 0.8.0 / 11 del 26 de octubre, aún incorporaba `/dashboard`; la nueva incorpora `/gastos`. El cambio web de inicio móvil no actualizaba ese recurso de la instalación nativa.

Pruebas JVM: 25 correctas y una integración HTTPS local opcional omitida; lint sin errores, con once advertencias; release compilada y firma contrastada contra el dominio. La instalación conservó la fecha inicial, la vinculación, el acceso a notificaciones, el lector conectado, la exención de batería y el dominio verificado. La cola mantiene 0 pendientes, 0 por revisar y 960 entregados. Dos aperturas reales con «Abrir AFP» muestran Gastos y su acción Nuevo gasto, sin barra del navegador. Se respaldaron las firmas y la APK anterior en almacenamiento privado; no se desinstaló ni se borraron datos. Sin despliegue web ni migraciones. [Evidencias y límites](../artifacts/android-gastos-start-2026-10-29/README.md).

### Compras diarias del mismo importe y revisión de duplicados

Se sustituye la búsqueda automática de compras con la misma tarjeta e importe en ±3 días por el mismo día financiero. Las compras habituales de días distintos pueden registrarse por separado. Se conserva la revisión entre propuestas de días contiguos si sus horas conocidas distan hasta 15 minutos; banco y Wallet mantienen una excepción de un día cuando una fuente ya creó el gasto. Las coincidencias del mismo día siguen requiriendo decisión.

Siete escenarios nuevos de integración cubren compras diarias, límites del día, medianoche, borrados, orden banco/Wallet y avisos sin hora bancaria de operación. La suite detectó una regresión del banco tardío Santander y la prueba diaria completa exigió distinguir el orden temporal: las excepciones entre canales conservan la protección de compras ya registradas sin frenar una operación bancaria nueva posterior al aviso Wallet anterior. Pasan las 81 pruebas enfocadas finales y **972 escenarios de la suite completa, sin fallos ni omisiones con PostgreSQL local**. Los seis controles del README pasan; lint conserva dos advertencias previas. Implementación local, pendiente de publicación, sin migraciones ni APK nueva. Los avisos históricos mantienen su estado. [Evidencia, resultados y límites](../artifacts/capture-daily-purchases-2026-10-29/README.md).

### Inicio móvil en Gastos y formularios por acción explícita

La entrada `/` y el acceso después del login llevan a Gastos con ancho menor de 768 px y a Dashboard en escritorio. La PWA usa esa entrada, conserva su identificador anterior y renueva la caché del shell. La configuración de la APK abre `/gastos`; requiere una APK actualizada para aplicar esa ruta.

Los seis formularios de creación que usan diálogo comienzan cerrados y se abren con su botón. Se verificaron navegación, cierre con retorno de foco, conservación del borrador y cambio de orientación. Pasaron los seis controles del README y **965 escenarios sin fallos ni omisiones**; se actualizó la expectativa existente de limpieza de caché a la versión nueva. Chromium con viewport móvil emulado, Auth ficticia y PostgreSQL local; recursos Android debug generados correctamente. Implementación local, pendiente de publicación e instalación. [Evidencias y límites](../artifacts/inicio-mobile-2026-10-29/README.md).

### Revisión posterior a A14: publicación y pendientes vigentes

Vercel confirma el commit `834b2f75805da8e406538d898914970647516cb3` de `master` en producción, despliegue `dpl_B1T1UmSsmF9CryKibZ8if5fYhf7g`, **READY** desde las 18:42:44 UTC / 12:42:44 México y asociado a `finanzas.garatachia.com`. Coincide con HEAD y `master` remoto e incluye A12/A13/A14. El informe queda en **13 hallazgos cubiertos y A10 parcial**; las menciones de publicación pendiente en los cierres anteriores son históricas.

Las auditorías repetidas mantienen cero avisos de producción y uno bajo de desarrollo en deepmerge, aún sin parche. HTTP anónimo confirma el login actualizado y tres API protegidas con 401 y cabeceras privadas. Coinciden las 46 huellas de código/pruebas más recientes de A12/A13/A14; se conservan los seis controles y 965 casos correctos del cierre A14, sin repetirlos en esta revisión documental.

Restan la aceptación con dos cuentas reales, dispositivos físicos, carga de producción y fases Android parciales. Se añade el seguimiento del fallo intermitente de Captura registrado durante A14, cuya causa sigue sin establecerse; contraseña, CI, observabilidad y funciones propuestas conservan alcance adicional. Solo se actualizaron documentación y evidencias, sin publicar ni modificar datos remotos. [Informe vigente](../artifacts/auditoria-2026-10-15/informe.md) · [Resumen verificable](../artifacts/auditoria-2026-10-15/revision-posterior-a14-2026-10-29/summary.json).

### A14: controles táctiles y legibilidad del login

**Implementación local verificada.** Acceso y registro usan campos y botones con altura mínima de 48 px, incluidos envío y cambio de modo. Los campos mantienen texto de 16 px y declaran teclado/autocompletado de correo y contraseña según la operación. Input y Button incorporan opciones explícitas; sus tamaños predeterminados se conservan. El formulario permite desplazamiento en pantallas bajas y reacomoda el pie y los botones al ampliar el texto.

Navegador Chromium con Auth ficticia: medidas en móvil/escritorio, teclado, toque sintetizado, carga/error/confirmación, viewport bajo y ampliación. Los seis controles del README pasan; la suite final conserva los 965 escenarios sin omisiones con PostgreSQL local. La primera ejecución falló en una aserción previa de Captura; se conserva ese resultado junto con las repeticiones correctas, sin modificar la prueba ni atribuirle una causa no comprobada.

README e informe actualizados: A14 queda implementada localmente. Sin migraciones, cambios de dependencias ni publicación. Restan la publicación y la aceptación con Auth real y teléfonos físicos, incluidos teclado virtual y gestor de contraseñas. [Mediciones, capturas, reproducción y límites](../artifacts/auditoria-2026-10-15/a14-2026-10-29/README.md).

### A13: consultas acotadas y resumen de cabecera

**Implementación local verificada**, sin publicación, migraciones ni cambios de dependencias. Dashboard y Análisis leen el año elegido y sus bordes; otras secciones móviles consultan un resumen sin matrices anuales. Gastos y su bootstrap comparten páginas, meses agrupados y totales SQL del filtro completo en `RepeatableRead`. Ciclos pagina por año y carga un detalle por ID, con sus advertencias y desglose bajo demanda. Se conservan pendientes históricos, el batch de pago, anclas MSI, ocurrencias contabilizadas fuera de mes y referencias de Turbo. Ingresos del mes y abonos de deudas se suman en SQL.

La interfaz conserva la carga compartida, el respaldo y los pendientes offline. Cambiar página, filtros, orden, tamaño o año invalida y recarga la selección vigente. La aceptación de navegador detectó y corrigió una dependencia ausente en la recarga paginada. Se verifican **965 escenarios sin fallos ni omisiones** con PostgreSQL local, tipos, contratos, lint y build predeterminado. Las mediciones comparan el código anterior y el nuevo con 1,000, 10,000 y 100,000 gastos sintéticos; registran consultas, bytes, p95 y memoria. No son un SLO ni una medición de producción.

README e informe de auditoría actualizados. [Evidencias, reproducción y límites A13](../artifacts/auditoria-2026-10-15/a13-2026-10-29/README.md). Resta publicar y aceptar con Supabase Auth real.

### A12: política de datos locales y pendientes al cerrar sesión

**Implementación local verificada**, sin publicación, migraciones ni cambios de dependencias. Escritorio y móvil comparten la salida: elimina el respaldo sincronizado de Gastos y los borradores financieros del propietario, y retira respuestas API de cachés antiguas. Conserva el shell público y las preferencias. Una generación por usuario impide que respuestas anteriores vuelvan a persistir datos después de salir; los listeners de Auth permiten terminar la limpieza antes de redirigir.

La cola solo se elimina después de sincronizar o exportar una copia actual y verificar la descarga. Conservar pendientes exige declarar que el dispositivo es de confianza en cada salida. Gastos puede restaurar el JSON con la misma cuenta, manteniendo UUID, cuerpos y marcadores de migración. Los fallos y cambios concurrentes conservan recuperabilidad; las sesiones terminadas externamente no borran pendientes sin decisión expresa. Las copias dañadas se rescatan literalmente y sus entradas inválidas requieren revisión manual. Se documenta que los datos locales y exportados no tienen cifrado propio de AFP y que la identidad nativa Android se revoca por separado.

README, Privacidad e informe reflejan la política y distinguen el cierre local de una publicación. [Resultados, pruebas y reproducción A12](../artifacts/auditoria-2026-10-15/a12-2026-10-29/README.md).

### Publicación confirmada de A04/A07/A08/A09 y la actualización A10

**Cotejo remoto de solo lectura.** Vercel confirma el commit `08aee7c1de08533fc19124e3842c454f59cf743f` de `master`, idéntico a HEAD y `origin/master` al consultar, en el despliegue de producción `dpl_DMUG88ufc6cqJheyt8khaRwVUvxM`. Estado **READY**, dominio `finanzas.garatachia.com` asignado y sin error de alias; listo el 29/10 a las **09:33:52 UTC / 03:33:52 México**. Incluye los commits de A04, A07, A08, A09 y A10, además de la migración web a TypeScript.

El informe pasa A04/A07/A08/A09 de «implementada localmente» a **CUBIERTA, publicación confirmada**. A10 conserva su estado parcial por el aviso bajo de desarrollo de la última auditoría, pero deja de tener publicación pendiente. Las aceptaciones con sesión Supabase real y los pendientes A12/A13/A14 no cambian. Las entradas siguientes y sus artefactos conservan el alcance histórico de los cierres locales, que no realizaron el despliegue.

Se cotejaron metadatos de Vercel, historial Git y respuestas HTTP anónimas; no se ejecutaron registros financieros, nuevas migraciones, pruebas de aceptación ni auditorías de dependencias en producción. README e informe actualizados con su evidencia y límites. [Publicación verificada](../artifacts/auditoria-2026-10-15/publicacion-2026-10-29/README.md).

### A10: actualización de dependencias y diagnóstico vigente

**Actualización local verificada** sobre `ca53e80`. Next.js y `eslint-config-next` pasan de 16.3.8 a **16.4.3**; el lockfile actualiza fast-uri a **3.1.9**, body-parser a **2.4.0** y systeminformation a **5.33.18**, dentro de los rangos compatibles. Se conservan React, Prisma, Sharp, shadcn en desarrollo y la política de scripts. Se retira una supresión ESLint de Gastos que las reglas nuevas consideran innecesaria. No se añaden overrides ni se ocultan avisos.

Las auditorías nuevas confirman inicialmente siete avisos de producción y diez en el árbol completo. Después quedan **cero de producción y uno bajo de desarrollo**, en deepmerge 4.3.1 bajo shadcn. El registro consultado no publica parche; A10 conserva ese seguimiento abierto y el uso de configuraciones/registros revisados. El cero histórico de octubre no se usa como diagnóstico vigente.

Instalación limpia con lockfile, los seis controles obligatorios y **934 escenarios con PostgreSQL local sin omisiones**, correctos. El build predeterminado pasa con **Turbopack** y TypeScript sobre Next.js 16.4.3; lint conserva dos advertencias previas. El login móvil/escritorio y las respuestas privadas 401 de 49 métodos en 19 rutas se comprueban contra ese build. El fixture de producción con Auth ficticia verifica crear un gasto, su persistencia con un único recibo y el total actualizado en pantalla. README e informe actualizados; sin migraciones nuevas ni publicación. [Auditorías, verificaciones y límites](../artifacts/auditoria-2026-10-15/a10-2026-10-29/README.md).

### A09: lecturas de Gastos limitadas a la selección vigente

**Implementación local completada** sobre `be59643`. Un lector con AbortController e identidad por generación protege filas, meses disponibles, errores y carga. Cambiar filtros invalida inmediatamente la consulta anterior, antes del debounce; las respuestas y errores tardíos se descartan incluso cuando el transporte ignora la cancelación. Las recargas tras mutaciones y sincronización consultan la selección vigente. La carga inicial, incluido el respaldo offline, no sustituye una lectura posterior; salir de la pantalla cancela también su petición.

**934 escenarios correctos, cero fallos y cero omisiones** con PostgreSQL desechable: 923 anteriores y once A09. Tipos web/pruebas, contratos negativos y lint correctos; permanecen dos advertencias previas. Navegador con Auth ficticia y API/PostgreSQL reales: escritorio con respuestas/errores inversos y carga pendiente; móvil con períodos inversos y estado vacío. Webpack correcto; Turbopack conserva la restricción de puertos incluso fuera del sandbox. README e informe actualizados; sin migraciones nuevas ni publicación. [Evidencias y reproducción](../artifacts/auditoria-2026-10-15/a09-2026-10-29/README.md).

### A08: validación semántica compartida en entradas manuales

**Implementación local completada** sobre `5d4683c`. Las fechas bancarias deben existir y conservar su día al interpretarse; los importes admiten hasta dos decimales y valor absoluto máximo de $9,999,999,999.99; nombre, concepto y fuente deben tener contenido tras `trim`. El contrato financiero aplica estas reglas a altas y ediciones manuales; Mi dinero, saldos y revisión/conciliación de Captura reutilizan las mismas comprobaciones básicas. Se conservan los campos opcionales, el cero y los signos permitidos por cada operación, y el instante ISO de desactivación de suscripciones.

El cuerpo validado conserva valores, campos adicionales y orden para los recibos; recortar el texto para guardarlo ocurre después. Las entradas inválidas devuelven 400 sin modificar registros; el cotejo de Captura revierte su transacción. No se normalizan fechas imposibles ni se redondean importes inválidos para aceptarlos.

**923 escenarios correctos, cero fallos y cero omisiones** con PostgreSQL desechable: los 891 anteriores y 32 A08, incluidos 17 subcasos POST/PATCH y nueve de persistencia. Tipos web/pruebas, contratos negativos y lint correctos, con las dos advertencias previas. Turbopack vuelve a encontrar la restricción de apertura de puertos incluso fuera del sandbox. Webpack compila correctamente fuera del sandbox, tras un primer fallo al leer la salida del subproceso de TypeScript. README e informe actualizados; sin migración nueva ni publicación. [Evidencias, reproducción y límites](../artifacts/auditoria-2026-10-15/a08-2026-10-29/README.md).

### A07: historial completo de ingresos y agregados por filtro

**Implementación local completada** sobre `eead77a`. La API de ingresos añade paginación, búsqueda, tipo, fechas inclusivas y orden de servidor. Conserva `incomes`/`total` y añade conteo y metadatos de página; la suma Decimal y las filas comparten filtros, propietario y una instantánea `RepeatableRead`. El orden incluye desempate por ID. Las páginas fuera de rango se ajustan a la última existente.

La pantalla usa esos agregados en resumen y pie, también en móvil; conserva sus formularios y borradores. Cambiar filtros, orden o tamaño vuelve a la primera página. Las lecturas sustituidas se cancelan y sus respuestas/errores se descartan; las mutaciones recargan la consulta vigente y corrigen la página si desaparece su última fila. `DataTable` incorpora un modo de servidor opcional; los otros módulos conservan el modo local.

**891 escenarios correctos, cero fallos y cero omisiones** en PostgreSQL local: 882 anteriores y nueve nuevos. Tipos web/pruebas, contratos negativos, lint y build Webpack correctos. Permanecen dos advertencias previas de lint. El build Turbopack encuentra la restricción de puertos del entorno incluso fuera del sandbox. Navegador con Auth ficticia y PostgreSQL real: escritorio/móvil, ingreso 101, total $1,010 entre páginas, búsqueda/estado vacío, respuestas y errores antiguos, y borrado de la última página. [Evidencias, reproducción y límites](../artifacts/auditoria-2026-10-15/a07-2026-10-29/README.md).

README e informe de auditoría actualizados. Sin migraciones nuevas ni publicación; quedan pendientes el despliegue y la aceptación con Supabase Auth real. A08 y la carrera de Gastos A09 conservan su alcance independiente.

### A04: día financiero compartido de México

**Implementación local completada** sobre `ec11d0f`. Los vencimientos conservan el día bancario UTC registrado y comparan el instante actual con `America/Mexico_City`. Tarjetas, Dashboard, estado guardado, avisos, mes de ocultación, consumo vigente y textos de presentación comparten la política. Mi dinero y Calendar reutilizan el helper. El navegador envía `clientDate` como día México válido y actualiza a medianoche de esa zona; Android conserva el instante real y la zona del teléfono no desplaza vencimientos.

La suite completa pasa con **882 escenarios, cero fallos y cero omisiones** en PostgreSQL desechable: 871 anteriores y once nuevos. La matriz ejecuta los mismos instantes UTC en UTC, México, Tokio y UTC+14, incluida la integración PATCH → PostgreSQL → Tarjetas → Dashboard. Se verifican todo el día límite, cambios de mes/año, parciales, cero, liquidaciones y las reglas históricas de horario de verano. Tipos de web/pruebas, contratos negativos y lint correctos; se conservan las tres advertencias previas. El build Turbopack encuentra una restricción de permisos del entorno al abrir un puerto; la alternativa Webpack termina correctamente y los logs están en el [cierre A04](../artifacts/auditoria-2026-10-15/a04-2026-10-29/README.md).

README, guía Android e informe de auditoría reflejan la política y el cierre local. Sin nueva migración ni cambios remotos o publicación; la aceptación autenticada del entorno publicado permanece pendiente.

## 2026-10-28

### Cierre de la migración de pruebas y helpers a TypeScript

**Fase 6 completada localmente** sobre `05c553a`. Los 117 archivos CJS originales tienen su conversión comprobada; los 131 módulos activos de pruebas, helpers y ejecutor usan TypeScript estricto con `allowJs: false`. Se retiran `checkJs`, la inclusión CJS y el descubrimiento mixto. El ejecutor acepta solo `.test.ts` y rechaza entradas JS pendientes incluso al seleccionar otra prueba.

La auditoría revisa los 97 contratos públicos del cargador, 462 conversiones `as const` y catorce conversiones locales justificadas. No hay `any`, supresiones ejecutables, conversiones dobles, declaraciones comodín ni archivos activos fuera del programa o ESLint. Los trece archivos de contratos negativos conservan 125 casos explicados. Permanecen las fronteras explícitas con tres scripts CJS externos, el ejecutor operativo de BD y el código JS generado para compatibilidad.

Pasaron instalación limpia con lockfile, los seis controles, suite PostgreSQL, reconstrucción/actualización, tres seeds y recorridos de navegador para transferencia, revisión de Captura y cola offline en dos pestañas. La suite final tiene 871 escenarios correctos sin omisiones: conserva los 854 originales y los 870 de fase 5, con correspondencia revisable de dos títulos del ejecutor. Los hashes de producto, esquema, SQL, fixtures, worker, Android y evidencias anteriores se conservan. Se mantienen las tres advertencias de lint y el aviso previo de `pg`.

README, convenciones, producto, planes y guía Android reflejan el cierre; el plan de la web sigue completado. No hubo publicación ni cambios en servicios remotos. Comandos, duraciones, auditoría, límites y reproducción: [fase 6 de pruebas](../artifacts/typescript-tests-migration/phase-6/README.md).

### Servidores de navegador y seeds en TypeScript

**Fase 5 de pruebas completada localmente** sobre `f7c76b9`. Se convirtieron los siete helpers restantes: preparación Next, tres servidores y tres seeds. La conexión PostgreSQL desechable se valida antes de importar clientes; Next y Prisma se cargan tras preparar el entorno ficticio. Se comparte el cierre de servidores, conexiones y directorios temporales, y la copia de configuración excluye `.env`, configuraciones de pruebas y tipos Next de otra compilación. Los datos ficticios y sus relaciones se conservan; la credencial de receptores permite un archivo temporal propio con permisos `0600`.

Instalación aislada, tipos, contratos, lint, suite PostgreSQL y build verificados. Los 867 escenarios anteriores se conservan en orden y jerarquía; tres regresiones nuevas suman 870 sin omisiones y se añaden seis casos negativos. Los recorridos de navegador comprueban transferencia y revisión de Captura contra la BD real local, y dos pestañas offline con respuesta perdida, cambio de cuenta y un único envío concurrente. Los tres servidores y los recursos de verificación se cierran al finalizar.

README, producto, planes y guía Android usan los comandos TS. Las evidencias históricas conservan sus commits de reproducción. Todos los helpers activos son TS; `allowJs` temporal y el descubrimiento mixto quedan para fase 6. Sin cambios de producto, esquema, SQL, fixtures JSON, service worker, APK, dependencias ni publicación. Resultados e incidencias: [fase 5 de pruebas](../artifacts/typescript-tests-migration/phase-5/README.md).

### Integraciones, recuperación y persistencia offline con pruebas TypeScript

**Fase 4 de pruebas completada localmente** sobre `429d747`. Se convirtieron las 50 pruebas CJS restantes: parsers, protocolo Android v1, políticas, revisión, conciliación, automatización y recibos de Captura; OAuth, eventos, locks y reintentos de Calendar; Auth/HTTP, contratos de UI, recuperación y cola/observador offline. Los dos contextos `vm` del service worker usan eventos y callbacks tipados. Se preservan fixtures parciales, formatos inválidos, JSON original, duplicados, cambio de cuenta y respuestas perdidas.

Las 108 pruebas ejecutables son TS. Los 866 escenarios de fase 3 se conservan en identidad, orden y jerarquía, sin omisiones; una regresión nueva conserva los metadatos de rutas, con 867 escenarios en total. Hay 97 módulos vinculados a exports reales y once contratos negativos nuevos. Pasaron instalación limpia, tipos, contratos, lint, suite PostgreSQL, build, reconstrucción/actualización y comparación de hashes. Los 394 archivos protegidos, 672 artefactos históricos y 160 archivos de evidencias de fases anteriores permanecen intactos.

README, plan y comandos Android se actualizaron. Los siete helpers CJS de navegador/seeds/Next y los puentes de configuración continúan en fases 5–6. Sin cambios de producto, esquema, SQL, fixtures JSON, dependencias, APK, proveedores reales ni publicación. Resultados, límites de adaptadores, incidencias y reproducción: [fase 4 de pruebas](../artifacts/typescript-tests-migration/phase-4/README.md).

### Pruebas financieras y persistencia en TypeScript

**Fase 3 de pruebas completada localmente** sobre `dd81d4f`. Se convirtieron 52 pruebas de tarjetas/MSI, presentación, suscripciones, gastos, deudas, ingresos y Mi dinero, junto con los helpers de contexto de rutas y persistencia de deudas. Los mocks distinguen consultas, escrituras, bloqueo y rollback; las integraciones conservan PostgreSQL real. Las proyecciones parciales y entradas inválidas pasan por fronteras de prueba explícitas sin completar los datos históricos ni modificar firmas de producción. Tres scripts operativos CJS tienen declaraciones específicas adyacentes.

Se conservan en orden y jerarquía todos los escenarios de fases 0 y 2 y se añaden tres para los adaptadores. Instalación aislada, controles de tipos, lint, suite PostgreSQL sin omisiones, build y reconstrucción/actualización de la base verificados; las fuentes protegidas y evidencias anteriores conservan sus hashes. README, plan y comandos Android reflejan la ejecución mixta vigente. Las fases 4–6, incluidos los siete helpers CJS de navegador y seeds, continúan pendientes. Sin cambios de producto, esquema, SQL, dependencias, servicios remotos ni publicación. Resultados, incidencias del recolector y reproducción: [fase 3 de pruebas](../artifacts/typescript-tests-migration/phase-3/README.md).

### Cargador de pruebas tipado y piloto de transferencias

**Fase 2 completada localmente** sobre `c0a0a37`. Se convirtieron los cargadores de fuentes/ESM y las pruebas del cargador y transferencias. Siete rutas obtienen sus exports del módulo real; las rutas dinámicas y funciones privadas sin contrato conservan `unknown`. Se tiparon los dobles mínimos y globals, con veinte casos negativos separados de la ejecución. Los consumidores CJS activos actualizan imports y registro TS, incluido un proceso hijo por zona horaria y el servidor offline.

La instalación limpia, los tres controles de tipos, lint, build, suite PostgreSQL y `db:verify` pasaron. Se conservaron en identidad, jerarquía y orden todos los escenarios de fases 0 y 1, con un escenario adicional del cargador, sin omisiones. La reconstrucción y actualización mantuvieron migraciones, checksums y RLS. También se verificaron configuración/tipos del fixture Next y carga ESM de cola/observador en Chrome sin errores. Se conservan las fuentes protegidas, fixtures y evidencia histórica por hash; siguen los avisos preexistentes.

El primer cierre detectó el proceso hijo sin `--import tsx`; se corrigió sin modificar expectativas y se conserva ese intento. La evidencia inventaría dos adaptadores locales, los tiempos medidos y los commits para reproducir los ejecutores históricos CJS fuera de HEAD. README, producto y planes reflejan fases 0–2 completadas y fases 3–6 pendientes. No hubo cambios de producto, esquema, dependencias, servicios remotos ni publicación. Resultados y reproducción: [fase 2 de pruebas](../artifacts/typescript-tests-migration/phase-2/README.md).

### Ejecución mixta y comprobación estricta de pruebas

**Fase 1 completada localmente** sobre `700afcc`. Se fijó tsx 4.23.15 en desarrollo, manteniendo `node:test`, esbuild, aislamiento y política de instalación. `pnpm test` y las regresiones de `db:verify` comparten descubrimiento/ejecución de CJS y TS, rechazan duplicados y selecciones inválidas, y registran soporte TS explícitamente en los procesos necesarios.

Se añadió `typecheck:tests` con configuración estricta y ESLint para todas las pruebas migradas; los contratos negativos conservan su programa separado. `latest-request.test.ts` mantiene los tres escenarios del módulo puro. Ocho escenarios de infraestructura verifican selección, exclusiones, módulos mixtos, imports dinámicos, orden, entorno, fallos y señales; tres casos negativos comprueban el contrato del ejecutor. Los helpers CJS continúan pendientes de tipado. El fixture Next deja de copiar configuraciones exclusivas de pruebas.

Pasaron instalación limpia con lockfile, los tres controles de tipos sin `.next` previa, lint, build, suite PostgreSQL y `db:verify`. Los 854 escenarios originales se conservan en orden y jerarquía; los ocho nuevos elevan la suite a 862, sin fallos ni omisiones. Reconstrucción y actualización verificaron 42 migraciones y 45 tablas con RLS. También pasaron copia/regeneración y tipos del fixture Next. Se conservan hashes de producto, esquema, fixtures y evidencia histórica, así como los avisos preexistentes.

El primer intento detectó un contrato estático de entorno incompleto por `NODE_ENV`; se corrigió y se conservó su evidencia antes de repetir. README, producto y plan reflejan la fase 1 completada y las fases 2–6 pendientes. Sin cambios de servicios remotos ni publicación. Resultados, límites y reproducción: [fase 1 de pruebas](../artifacts/typescript-tests-migration/phase-1/README.md).

### Referencia para migrar pruebas y helpers a TypeScript

**Fase 0 completada localmente** sobre `6c1b626`. Se inventariaron 106 pruebas y 11 helpers CJS, ocho archivos de contratos estáticos, 21 fixtures JSON y sus dependencias, rutas dinámicas y consumidores, incluidos documentación y ejecutores de `artifacts/`. El manifiesto identifica los 854 escenarios reales: 555 de primer nivel y 299 subtests; conserva archivo, posición, nombres y jerarquía para comparar la migración sin depender solo del total.

Pasaron `typecheck`, `test:types`, lint, suite completa con PostgreSQL local y build. `db:verify` confirmó reconstrucción y actualización desde las 13 migraciones históricas, 42 migraciones finales, 45 tablas con RLS y la misma secuencia de 854 regresiones. Cero fallos u omisiones en las pruebas. Se conservan las tres advertencias de lint y el aviso de `pg`. El primer intento falló únicamente al cotejar las columnas de `t.test` en el recolector nuevo; quedó registrado y se corrigió antes de repetirlo con salida nueva.

El recolector crea una copia sin `.env`, `.next` ni caché TypeScript, usa dependencias ya instaladas y PostgreSQL desechable, y elimina sus recursos al terminar. Se fijaron hashes de 394 archivos protegidos, 672 artefactos históricos y 11 configuraciones/herramientas; no hubo cambios en fuentes de producto, pruebas, esquema, SQL, fixtures, dependencias ni servicios remotos. README y plan reflejan la fase 0 completada; las fases 1–6 siguen pendientes. Evidencia, exclusiones y reproducción: [fase 0 de pruebas](../artifacts/typescript-tests-migration/phase-0/README.md).

### Plan de migración de pruebas y helpers a TypeScript

Se preparó el [plan independiente](plan-migracion-tests-typescript.md) sobre `6aad1ab`: 106 archivos de pruebas y 11 helpers CJS. Define referencia, ejecución mixta con `node:test`, contratos del cargador y mocks, piloto de transferencias, conversión por módulos, fixtures de navegador y cierre con PostgreSQL y `db:verify`. La implementación está pendiente; no modifica el cierre de la migración web ni incorpora cambios de código, dependencias o despliegue.

### Cierre de la migración web a TypeScript

**Fase 7 completada localmente.** Los 275 módulos TS/TSX de `src/` están incluidos en el programa estricto con `allowJs: false`. Se retiraron los adaptadores de UI de Mi dinero, el wrapper del piloto de transferencias y el cliente financiero temporal sin consumidores. Los 14 archivos vacíos se eliminaron sin contarlos como módulos migrados. El cargador de pruebas exige el archivo exacto cuando la ruta declara una extensión; se actualizaron las referencias históricas que aún lo necesitaban.

Se revisaron las interfaces y entradas externas, las 58 conversiones locales y los límites cliente/servidor, sin `any`, supresiones TypeScript, dobles conversiones ni declaraciones que oculten módulos pendientes. ESLint impide encadenar conversiones. Mi dinero usa los contratos reales de los componentes compartidos, incluido el tooltip de proyección; el formulario común conserva el UUID en reintentos y lo renueva cuando cambia el contenido.

La instalación limpia, tipos, contratos negativos, lint, 854 pruebas con PostgreSQL sin omisiones, build y `db:verify` pasaron. Se verificaron las 42 migraciones, 45 tablas con RLS y las 12 respuestas del piloto contra fase 0. En navegador se guardaron transferencias de $125.50 en escritorio y $38.75 en móvil, con un recibo por operación, centavos y total conservados; selector por teclado, foco del diálogo, retorno al botón y tooltip correctos, sin errores de página ni desbordamiento.

README, producto y plan reflejan el cierre y las excepciones previstas: pruebas/scripts JS/CJS, configuraciones `.mjs`, `public/sw.js` y Android Kotlin fuera del programa web. Sin cambios de esquema, SQL, dependencias, APK ni publicación. Resultados, revisión de conversiones y reproducción: [fase 7](../artifacts/typescript-migration/phase-7/README.md).

### Interfaz, hooks y páginas en TypeScript

**Fase 6 completada localmente.** Se convirtieron 135 módulos con contenido: páginas/layout restantes, seis hooks, pantallas y componentes compartidos. Props, refs, eventos, tablas y gráficas usan los tipos de sus bibliotecas. Los clientes validan las respuestas dentro de la recuperación HTTP y conservan el JSON original, incluidos metadatos, claves omitidas y orden usado por Captura. El cálculo de importes de pago se separó del estado de calendario para consumir detalles sin fechas.

Pasaron tipos, contratos negativos, lint, build y 854 pruebas con PostgreSQL local, sin fallos ni omisiones. Se verificaron reconstrucción y actualización de BD, límites cliente/servidor y 26 recorridos de navegador entre móvil y escritorio. Las comprobaciones incluyen centavos, teclado/foco, borrador restaurado, gasto offline sincronizado una vez con el mismo UUID, correcciones sucesivas y recuperación de una respuesta incompleta.

`components.json` habilita TSX. Se actualizaron README, producto, plan y referencias de UI. La fase 7 conserva la retirada de adaptadores/fallbacks, `allowJs` y los 14 archivos vacíos inventariados. Sin cambios de esquema, SQL, dependencias, APK ni publicación. Resultados, advertencias y reproducción: [fase 6](../artifacts/typescript-migration/phase-6/README.md).

### Captura Android, Calendar y offline en TypeScript

**Fase 5 completada localmente.** Se migraron protocolo, parsers, reglas, revisión, conciliación, avisos Android, comprobantes y todos los endpoints de Captura; OAuth, agenda, sincronización y tareas de Calendar; y la cola offline con su observador de cambios. Los comandos distinguen resoluciones y las lecturas de JSON preservan las propuestas parciales, notas históricas y el orden usado por los controles de concurrencia.

Las verificaciones se ejecutaron por lote con PostgreSQL desechable. Las interpretaciones de 19 fixtures coinciden con el JavaScript anterior; el cifrado Calendar v1 sigue siendo legible en ambas direcciones. En navegador, una cola creada antes de convertirla conserva UUID, se recupera tras una respuesta perdida y confirma entre pestañas con un solo envío bajo Web Locks. IndexedDB mantiene nombre, almacenes y versión 1, y el service worker conserva su exclusión de API privadas.

El interior de las pantallas/hooks JSX queda para fase 6. No se cambió esquema, SQL, lockfile ni APK, ni se publicó o activaron reglas. Los resultados, tiempos, incidencias de preparación y límites están en la [fase 5](../artifacts/typescript-migration/phase-5/README.md).

## 2026-10-27

### Núcleo financiero y API compartida en TypeScript

**Fase 4 completada localmente.** Se tiparon cálculos de tarjetas/MSI, suscripciones, deudas, gastos, ingresos, bootstrap, Dashboard y análisis, junto con autorización, operaciones transaccionales, Prisma, Supabase y recuperación HTTP. Las consultas conservan inferencia de relaciones Prisma; los JSON externos se validan o acotan. Gastos distingue efectivo, tarjeta y débito, y se conservan saldos parciales y el cero bancario confirmado.

Los consumidores JSX pasan por una frontera de validación de respuestas dentro de la recuperación compartida. Mi dinero usa directamente el núcleo tipado y se retiró su adaptador temporal de cálculos. La instalación limpia, las pruebas con PostgreSQL, la reconstrucción de BD y las comprobaciones de navegador se documentan en la [fase 4](../artifacts/typescript-migration/phase-4/README.md). Captura, Calendar, offline y el interior de las pantallas restantes siguen en sus fases previstas. Sin cambios de esquema, migraciones, lockfile ni despliegue.

### Mi dinero completo en TypeScript

**Fase 3 completada localmente.** Se migraron cuentas/conciliaciones, rutas/planes, presupuestos, rendimientos, fuentes y proyección, junto con `/api/money`, los formularios y la presentación mensual. La instantánea de Prisma tiene propiedades explícitas y conserva sus 15 consultas secuenciales; las transferencias reutilizan sus cuentas y movimientos sin lecturas duplicadas. Se validan JSON históricos y respuestas sin cambiar formatos persistidos, fórmulas ni huellas de operación.

La comprobación estricta incluye entrada/salida de Zod, comandos por acción y 13 casos negativos nuevos. Se conservó el descubrimiento de pruebas de autorización al convertir `route.js` a `route.ts`. La instalación limpia pasó tipos, lint, pruebas con PostgreSQL y build; las 12 respuestas de referencia permanecen idénticas. El navegador verificó cuentas con rendimientos, conciliación, nómina, asignación, escenarios sin escrituras, foco, borradores y reenvío del mismo UUID tras perder una respuesta.

Persisten fronteras locales con componentes JSX compartidos y cálculos financieros de fases posteriores. Sin cambios de esquema, SQL, lockfile ni despliegue. Resultados, tiempos, advertencias y límites: [fase 3](../artifacts/typescript-migration/phase-3/README.md).

### Piloto de transferencias en TypeScript

**Fase 2 completada localmente.** Se tiparon los contratos de `TRANSFER`/`REVERSE_TRANSFER`, su persistencia con `Prisma.TransactionClient`, el cliente con validación de respuesta y el adaptador del formulario compartido. La huella sigue usando el cuerpo original; bloqueo, escritura y recibo permanecen en una sola transacción. Las otras acciones, el handler y el interior del editor continúan en JavaScript.

Pasaron typecheck, ocho nuevos casos negativos de tipos, lint, build y **840 pruebas con PostgreSQL local, sin fallos ni omisiones**. Las 12 respuestas del piloto coinciden con la fase 0. El navegador verificó teclado/foco, móvil/escritorio, centavos, reversión, respuesta perdida con el mismo UUID y recarga fallida después de guardar. Se conservan la advertencia de lint de TanStack Table y la de `pg`.

Sin cambios de esquema, migraciones, lockfile ni despliegue. Se acotaron tres lotes para completar Mi dinero y se documentaron los adaptadores temporales y consultas duplicadas. Evidencias y reproducción: [fase 2](../artifacts/typescript-migration/phase-2/README.md).

### Herramientas para la migración a TypeScript

**Fase 1 completada localmente.** Se añadieron TypeScript 6.0.3, los tipos de Node 22/React 19, esbuild y `dotenv` como dependencias directas. `tsconfig.json` sustituye a `jsconfig.json`; `typecheck` y `test:types` son verificaciones obligatorias. ESLint comprueba usos inseguros en TS/TSX y el build conserva la detección de errores.

Las pruebas usan transformación en memoria con imports reales y mocks explícitos, conservando `node:test`, caché y entorno ficticio. Se adaptaron los cargadores históricos y los tres fixtures. Pasaron 828 pruebas con PostgreSQL local, sin fallos ni omisiones; las 820 anteriores se conservan y se añaden ocho de infraestructura. No se modificaron reglas financieras, fuentes de aplicación, esquema ni migraciones, ni se publicó. Resultados, instalación limpia y límites: [fase 1](../artifacts/typescript-migration/phase-1/README.md). Sigue pendiente el piloto de transferencias de la fase 2.

### Referencia para la migración gradual a TypeScript

**Fase 0 completada localmente.** Se inventariaron 263 archivos JS/JSX (249 con contenido), contratos y cargadores de pruebas. PostgreSQL desechable verificó 42 migraciones y 45 tablas con RLS; pasaron 820 pruebas sin omisiones, lint y build. Un piloto con dos usuarios ficticios conserva 12 respuestas de transferencias y saldos, comparadas en una segunda ejecución con reloj fijo.

Se registraron la advertencia existente de `pg` y un fallo de preparación del build aislado, resuelto copiando sus dependencias. No hubo conversión de código, cambios de esquema ni despliegue. Evidencias y reproducción: [fase 0](../artifacts/typescript-migration/phase-0/README.md). Esta referencia precede la fase 1 del [plan](plan-migracion-typescript.md).

### Presupuestos diarios y previsiones de cobro

**Publicado.** El presupuesto variable pasó a estimar consumo por día para evitar concentrar el remanente mensual al final del mes. El gasto personal de una fecha cubre la previsión de ese día; superar el presupuesto antes no elimina las previsiones posteriores. Se añadió una mezcla de efectivo/débito y crédito basada en meses históricos, manteniendo el pago de crédito en su tarjeta.

La migración aditiva [variable_budget_payment_mix](../prisma/migrations/20261027000000_variable_budget_payment_mix/migration.sql) agregó `MoneyPlan.paymentMix` sin cambiar los planes anteriores. Las previsiones de cobro también pasaron a poder excluirse o asignarse por separado; el pago esperado corresponde a cada fecha, sin dividirlo entre las fechas del mes ni modificar los ingresos reales.

Evidencias: [presupuesto diario](../artifacts/mi-dinero/presupuesto-diario/production.json), [presupuesto mixto y migración](../artifacts/mi-dinero/presupuesto-mixto/production.json), [previsiones de cobro](../artifacts/mi-dinero/cobros-previsiones/production.json).

### Cargos genéricos BBVA como gastos con débito

**Migración aplicada; funcionalidad publicada y activada con autorización.** Se incorporó una regla opcional para tratar cargos genéricos como gastos con débito, cuenta explícita y categoría Por clasificar. Requiere aceptar ese significado, coincidencia exacta de terminación y un aviso compatible; solo afecta avisos nuevos.

La corrección a retiro, transferencia propia o pago de tarjeta sustituye el registro en una transacción, conserva la evidencia y evita una segunda salida de dinero. La migración [bbva_debit_automation](../prisma/migrations/20261027010000_bbva_debit_automation/migration.sql) amplió las reglas y el vínculo con pagos, sin activar automáticamente las configuraciones existentes. No requirió otra APK.

Evidencias: [verificación](../artifacts/bbva-debit-automation/verification.json), [aplicación y publicación](../artifacts/bbva-debit-automation/production.json).

### Carga y presentación de Mi dinero

**Verificado localmente; publicación pendiente en las evidencias citadas.** La lectura libera su transacción antes de calcular proyecciones, comparte consultas en curso y conserva el último resultado válido si falla una actualización. Los fallos temporales de Auth y los errores de disponibilidad de Prisma se presentan como recuperables. Persistió una advertencia de `pg` en el adaptador de Prisma; no se demostró que causara el fallo original ni que este proviniera del Wi-Fi.

El resumen mensual incorporó estados compartidos entre móvil y escritorio y períodos cercanos al mínimo. Por decisión del propietario, los avisos de liquidez evalúan el capital total de todas las cuentas; la revisión histórica queda oculta, conservando su diagnóstico. Estas revisiones no modificaron el esquema ni los movimientos. La comprobación estática no acreditó interacción o apariencia en navegador.

Evidencias: [carga y límites](../artifacts/mi-dinero/carga-resiliente/verificacion.json), [resumen mensual](../artifacts/mi-dinero/resumen-escritorio/verificacion.json), [capital total](../artifacts/mi-dinero/capital-total/verificacion.json).

## 2026-10-26

### Registro automático y devoluciones de compras

**Publicado.** La revisión diaria salió de la pestaña de Configuración y se concentró en `/registro-automatico`, con pendientes, historial, conciliación y ajustes. El traslado reutilizó las operaciones existentes y no necesitó migración ni APK nueva.

La ampliación de devoluciones sí incorporó la migración aditiva [expense_refunds](../prisma/migrations/20261026000000_expense_refunds/migration.sql). Permite revisar devoluciones totales, parciales y cancelaciones, conservando el cargo original y la opción de deshacer. Recibir o reinterpretar un aviso no aplica el reembolso: exige confirmación personal.

Evidencias: [nueva sección](../artifacts/automatic-recording-ux/production.json), [devoluciones](../artifacts/android-refunds/production.json).

### Débito, transferencias y retiros

**Migraciones aplicadas y funcionalidad publicada.** Se añadió `PaymentMethod.DEBIT` con cuenta de salida obligatoria. Las transferencias propias y los retiros pasaron a tener registros canónicos separados de gastos e ingresos. Las reglas de captura conservan consentimiento, identidad del aviso y revisión de coincidencias.

Migraciones: [debit_payment_method](../prisma/migrations/20261026010000_debit_payment_method/migration.sql) y [capture_account_movements](../prisma/migrations/20261026020000_capture_account_movements/migration.sql). Sustituyen la antigua instrucción de capturar débito como efectivo. La activación automática de retiros BBVA quedó condicionada a comprobar primero una muestra real.

Evidencias: [verificación de cuentas](../artifacts/account-capture/verification.json), [publicación](../artifacts/account-capture/production.json).

### Estados y colores de Google Calendar

**Publicado y sincronizado.** Se corrigieron los cobros recurrentes para evaluar cada fecha en su intervalo, evitando aplicar el total mensual a todas las ocurrencias. Se conservaron las identidades de eventos existentes.

La paleta de cuatro tonos fue sustituida por seis roles distinguibles porque azul y gris se confundían. Los cortes pasan a «Corte revisado» cuando tienen fechas confirmadas y monto de estado de cuenta, incluido cero. La migración [card_cycle_dates_confirmation](../prisma/migrations/20261026030000_card_cycle_dates_confirmation/migration.sql) añadió `datesConfirmedAt` sin confirmar automáticamente el historial. La aceptación histórica posterior fue una operación expresamente autorizada, no una regla para cortes futuros.

Evidencias: [cobros por fecha](../artifacts/google-calendar/receivable-labels-production.json), [paleta corregida](../artifacts/google-calendar/distinct-palette/production.json), [cortes revisados](../artifacts/google-calendar/reviewed-cuts/production.json).

### Avisos importantes en Android

**APK actualizada y backend publicado.** Se añadió la recepción de avisos del Dashboard mediante un permiso separado del lector bancario, preferencias persistentes y consultas con WorkManager. La entrega puede demorarse por las restricciones de Android; no es push inmediato. Los avisos respetan ocultaciones y no registran movimientos financieros.

La instalación y publicación no acreditaron la activación de la opción ni una recepción real; ambas quedaron pendientes. No hubo migraciones.

Evidencias: [instalación](../artifacts/android-important-notices/installation.json), [backend y pendientes](../artifacts/android-important-notices/production.json).

## 2026-10-24

### Mi dinero, rendimientos y calendario de nómina

**Publicado con migraciones aplicadas.** Mi dinero incorporó cuentas a la vista, referencias de saldo, asignación de movimientos, conciliaciones, planes y proyección. Se eligió trabajar con referencias capturadas y movimientos de AFP. Una compra de crédito y su pago no representan dos salidas de efectivo; los cobros pendientes siguen siendo previsiones.

Después se añadieron rendimientos históricos y futuros con reglas fechadas. Los abonos reales vinculados sustituyen el cálculo y las conciliaciones absorben lo ya incluido en el banco, sin crear ingresos ficticios. El calendario de nómina permite adelantar depósitos al día hábil bancario anterior, conservando las fechas nominal y efectiva y el tratamiento de la nómina neta.

Las migraciones aditivas de cuentas y rendimientos son [add_money_accounts](../prisma/migrations/20261025000000_add_money_accounts/migration.sql), [money_account_yields](../prisma/migrations/20261025010000_money_account_yields/migration.sql) y [automatic_money_yields](../prisma/migrations/20261025020000_automatic_money_yields/migration.sql); [payroll_business_days](../prisma/migrations/20261025030000_payroll_business_days/migration.sql) agrega la opción de calendario. Sus identificadores son posteriores a la fecha de actividad consignada en el README original.

También se corrigieron la edición de tasas y la modificación del saldo de referencia sin volver a aplicar movimientos. Los rendimientos son cálculos de AFP sujetos a las reglas configuradas; las diferencias con el banco requieren conciliación.

Evidencias: [publicación inicial](../artifacts/mi-dinero/production.json), [rendimientos](../artifacts/mi-dinero/automatic-yields/production.json), [nómina](../artifacts/mi-dinero/payroll-calendar/production.json), [edición de referencia](../artifacts/mi-dinero/reference-edit-verification.json).

### Wallet principal y respaldo bancario

**Publicado y activado con autorización.** Para las tarjetas configuradas se priorizó Wallet y se estableció una espera bancaria de al menos 15 minutos. Al vencer, el servidor vuelve a comprobar reglas, permisos y coincidencias. El retraso reduce el riesgo de duplicar avisos de una misma compra; una coincidencia por importe o comercio sigue requiriendo revisión.

La migración [capture_bank_fallback](../prisma/migrations/20261024020000_capture_bank_fallback/migration.sql) añadió la persistencia de esperas. Se configuró una tarea de un minuto con `pg_cron`, `pg_net` y Vault que solo solicita trabajo si hay vencimientos. Es independiente del mantenimiento diario de Calendar. La evidencia de activación dejó pendiente observar la siguiente compra real de respaldo.

Evidencias: [regresiones](../artifacts/android-bank-fallback/verification.json), [publicación y programación](../artifacts/android-bank-fallback/production.json).

### Fuentes de viajes y tema Android

**Publicado e instalado según cada evidencia.** Se añadieron Uber, DiDi viajes y Uber Eats como fuentes de evidencia para revisión, sin atribuir tarjeta ni crear gastos automáticamente. Se corrigió además la barra de estado blanca de la TWA mediante configuración nativa explícita del tema oscuro; la actualización conservó instalación y permisos. En ese cierre, las etiquetas web de tema seguían pendientes de publicación.

Evidencias: [fuentes de servicios](../artifacts/android-service-notices/production.json), [corrección de tema](../artifacts/android-status-bar/verification.json).

## 2026-10-22 y 23

### Calendar: sincronización por cambios

**Migración aplicada, conexión y publicación verificadas.** Se incorporó OAuth de servidor y un calendario propio de AFP con credenciales cifradas. Tras una primera versión con sondeo, se pasó a sincronizar después de los cambios financieros y continuar los lotes en el trabajador. Se retiró el cron de cinco minutos de Supabase; Vercel conserva una revisión diaria para mantenimiento y recuperación.

La decisión evita contactar Google cuando no hay cambios y conserva los identificadores de eventos. Desconectar retira eventos futuros y conserva historial. La migración [add_google_calendar_sync](../prisma/migrations/20261023000000_add_google_calendar_sync/migration.sql) añadió conexiones, estados OAuth, referencias de eventos y triggers.

Evidencias: [publicación inicial](../artifacts/google-calendar/production-deployment.json), [comparación contra Google](../artifacts/google-calendar/google-verification.json), [retiro del sondeo](../artifacts/google-calendar/events-verification.json).

### Pagos por notificaciones y comprobantes compartidos

**Publicado con migraciones aplicadas y actualización Android.** Se añadió OCR local de comprobantes compartidos y reglas para registrar abonos desde fuentes compatibles. La revisión distingue «Sumar este pago» de «Ya lo había registrado»: conservar evidencia no debe duplicar el acumulado del corte.

[capture_card_payments](../prisma/migrations/20261023030000_capture_card_payments/migration.sql) y [automatic_payment_receipts](../prisma/migrations/20261023040000_automatic_payment_receipts/migration.sql) incorporaron abonos y políticas. [receiver_payment_notices](../prisma/migrations/20261023060000_receiver_payment_notices/migration.sql) amplió las fuentes receptoras. Los cargos genéricos de salida no prueban por sí solos qué tarjeta se pagó; avisos contradictorios o coincidencias ambiguas permanecen en revisión.

Evidencias: [comprobantes y publicación](../artifacts/android-payment-sharing/production-verification.json), [pagos receptores](../artifacts/android-receiver-payments/production-financial-verification.json).

### Activación gradual de formatos reales

**Ampliaciones publicadas y habilitadas por fuente.** Se incorporaron formatos reales de compras Wallet y avisos bancarios de distintos emisores. Cada activación se apoyó en evidencia revisada y reglas expresas; un formato sintético o una fuente instalada no acredita cobertura de todas sus operaciones. Wallet puede aportar fecha de notificación sin demostrar la fecha bancaria de compra; la aceptación de esa política se conserva por tarjeta/formato.

Evidencias representativas: [Wallet/Banamex](../artifacts/android-wallet-banamex/production-state.json), [Santander](../artifacts/android-santander/production.json), [Nu y Mercado Pago](../artifacts/android-nu-mercadopago/production.json), [BBVA Wallet](../artifacts/android-bbva-wallet/production.json). El detalle por fuente permanece en la [guía Android](android-captura.md).

### Préstamos y conciliación de cuentas por cobrar

**Aplicado y publicado.** Se distinguió el capital pendiente conciliado del préstamo, sus intereses y los reembolsos de terceros. La migración [receivable_balance_adjustment](../prisma/migrations/20261023050000_receivable_balance_adjustment/migration.sql) añadió un ajuste firmado y su explicación: conciliar una cuenta no equivale a recibir dinero ni a amortizar nuevamente un préstamo.

Las reconstrucciones históricas conservaron la diferencia entre pagos comprobados y estimados. Importes, comprobantes y respaldos personales permanecen fuera de Git.

Evidencias: [reglas de préstamos](../artifacts/prestamos-nomina/verificacion.json), [conciliación y alcance de la verificación](../artifacts/conciliacion-cobros/produccion.json).

## 2026-10-21

### Vinculación, cola y revisión de captura Android

**Implementado, con aplicaciones y publicaciones documentadas por fase.** Se incorporaron identidad nativa revocable, cola cifrada, recibos por evento y registro transaccional. Las fases posteriores añadieron alias, revisión, conversión a MSI, conciliación y activación gradual. La credencial nativa quedó separada de la sesión Supabase y limitada a sus endpoints.

Las migraciones de captura de esta fecha están en el [historial SQL](../prisma/migrations/). El motor inicial usó formatos sintéticos no activables; la habilitación real se realizó después por fuente. Las pruebas sintéticas no sustituyeron esa aceptación.

Evidencias: [vinculación](../artifacts/android-fase2/produccion.json), [cola](../artifacts/android-fase3/verification.json), [motor y publicación](../artifacts/android-fase4/production-deployment.json), [revisión](../artifacts/android-fase5/verification.json), [piloto](../artifacts/android-fase6/production-deployment.json).

### Incidencia: migración de prueba dirigida a Supabase

**Recuperada.** Una invocación de prueba perdió la variable que sustituía la conexión por localhost y utilizó la conexión configurada de Supabase. La migración `20261021010000_add_capture_processing` se interrumpió y dejó un esquema parcial.

Se respaldó antes de reparar, se completaron restricciones y se verificaron esquema, RLS y checksum antes de cerrar el registro interrumpido. La comparación confirmó filas idénticas antes y después de la reparación; **no existía un snapshot anterior a la primera invocación equivocada**. La migración siguiente se aplicó posteriormente con autorización.

La lección operativa es conservar la conexión de prueba explícita en cada invocación y limitar los verificadores a bases locales desechables. La recuperación registrada fue específica de esa incidencia; no sustituye el flujo normal de migraciones.

Evidencias: [incidencia y límites](../artifacts/android-fase4/production-recovery.json), [cierre posterior](../artifacts/android-fase4/production-deployment.json).

### Capturas de saldo y seguimiento del crédito

**Migraciones aplicadas; el cierre de BD del seguimiento dejó la publicación web pendiente.** Se incorporaron límite, saldo bancario y fecha de referencia, y después seguimiento por cambios de exposición. Una MSI aporta su importe completo una sola vez; los pagos reales liberan crédito. Conciliar establece otra referencia sin crear movimientos ficticios.

Migraciones: [add_card_credit_balances](../prisma/migrations/20261021040000_add_card_credit_balances/migration.sql) y [add_card_balance_tracking](../prisma/migrations/20261022000000_add_card_balance_tracking/migration.sql). La segunda consta el 21 de octubre local y el 22 UTC. Posteriormente la interfaz se separó en Crédito y deuda; Tarjetas conservó ciclos y pagos.

Evidencias: [captura bancaria](../artifacts/saldos-tarjetas/produccion.json), [seguimiento y alcance del cierre](../artifacts/saldos-automaticos/produccion.json), [traslado de la interfaz](../artifacts/credito-y-deuda/verificacion.json).

## 2026-10-20

### Gastos compartidos y primera publicación de Digital Asset Links

**Migración aplicada y funcionalidad publicada.** Se separó el cargo pagado al comercio de la aportación ya recibida en efectivo: esta reduce el gasto personal, conservando el cargo completo para tarjetas y consumo mínimo. La migración [add_cash_expense_contributions](../prisma/migrations/20261020000000_add_cash_expense_contributions/migration.sql) añadió importe y restricción sin generar ingresos ni cuentas por cobrar.

La publicación de Digital Asset Links vinculó el dominio con la firma Android y permitió la TWA verificada. Esa publicación incluyó la funcionalidad de gastos compartidos. Firma, datos del teléfono y distribución de la APK mantuvieron su ciclo separado del despliegue web.

Evidencias: [migración](../artifacts/gastos-compartidos/produccion.json), [publicación web](../artifacts/android-fase1/deployment.json).

## 2026-10-15 a 17

### Auditoría, autorización e integridad financiera

La auditoría detectó acceso a API sin validación suficiente del propietario, riesgos de duplicación offline, inconsistencias de saldos y operaciones relacionadas no atómicas. Se incorporaron Bearer validado, aislamiento por usuario y referencias, exclusión de API del service worker, IndexedDB con UUID y recibos transaccionales. Los pagos parciales, abonos y ediciones de deudas pasaron a usar cálculos y transacciones compartidos.

La migración [add_expense_operations](../prisma/migrations/20261017000000_add_expense_operations/migration.sql) persistió los recibos idempotentes; [add_post_cut_credits](../prisma/migrations/20261017030000_add_post_cut_credits/migration.sql) incorporó devoluciones aplicadas al pago del corte. La revisión del 21 de octubre documentó la publicación de las correcciones cubiertas, con aceptaciones operativas todavía separadas de las pruebas con Auth simulada.

Evidencias: [auditoría y seguimiento](../artifacts/auditoria-2026-10-15/informe.md), [captura offline](../artifacts/auditoria-2026-10-15/a02-verificacion.json), [pagos y devoluciones](../artifacts/devoluciones-2026-10-17/verificacion.json).

### Reconstrucción del esquema y dependencias

**Migraciones de seguridad aplicadas.** Se recuperó una migración histórica ausente verificando su checksum contra el registro aplicado. [enable_application_rls](../prisma/migrations/20261017020000_enable_application_rls/migration.sql) versionó RLS y la activación de seguridad para tablas nuevas. Se añadieron herramientas para auditar historial y reconstruir desde cero y desde una versión anterior, sin reemplazar el historial por `db push`.

Se fijó pnpm como gestor y se actualizaron dependencias. Los resultados favorables de auditoría de esos días no describen el estado posterior: la consulta del 27 de octubre volvió a registrar hallazgos, incluidos críticos de producción.

Evidencias: [historial y aplicación](../artifacts/auditoria-2026-10-15/a11-produccion.json), [revisión del 21 de octubre](../artifacts/auditoria-2026-10-15/revision-2026-10-21.json), [auditoría del 27 de octubre](../artifacts/mi-dinero/presupuesto-diario/dependency-audit.json).

## Seguimientos al consolidar esta bitácora

Estos puntos conservan el estado de la evidencia citada; antes de retomarlos, comprobar si una intervención posterior ya los resolvió.

| Tema | Último estado documentado | Evidencia |
| --- | --- | --- |
| Dependencias | Actualización A10 publicada en `08aee7c`; últimas auditorías locales: cero avisos del árbol de producción y uno bajo de desarrollo, deepmerge sin parche en la consulta. Seguimiento del aviso y ambas auditorías antes de la siguiente publicación | [Auditorías](../artifacts/auditoria-2026-10-15/a10-2026-10-29/README.md) · [Publicación](../artifacts/auditoria-2026-10-15/publicacion-2026-10-29/README.md) |
| Nómina automática | Solicitada, sin regla implementada ni activa al 27 de octubre. Falta una notificación Android que permita verificar importe real, fecha y terminación; el buzón interno bancario no demuestra esos campos | README histórico, sección «Automatización de nómina solicitada», recuperable con el comando indicado abajo |
| Avisos importantes Android | Backend publicado y APK instalada; faltaba activar la opción, conceder permiso y confirmar recepción | [Cierre del 26 de octubre](../artifacts/android-important-notices/production.json) |
| Mi dinero | Publicación pendiente en los cierres locales de carga, capital total y resumen; advertencia de `pg` sin causa demostrada del fallo original | [Carga](../artifacts/mi-dinero/carga-resiliente/verificacion.json), [capital total](../artifacts/mi-dinero/capital-total/verificacion.json), [resumen](../artifacts/mi-dinero/resumen-escritorio/verificacion.json) |
| Retiros BBVA | Automatización condicionada a registrar y validar una muestra real; un cargo genérico no demuestra un retiro | [Verificación de cuentas](../artifacts/account-capture/verification.json) |
| Auditoría general | El informe del 21 de octubre conserva correcciones y aceptaciones abiertas. Sus estados requieren cotejo con las ampliaciones posteriores; no se revalidaron en esta consolidación | [Informe](../artifacts/auditoria-2026-10-15/informe.md#estado-actual) |

## Cómo mantenerla

- Agregar entradas por fecha para cambios de comportamiento, decisiones con su motivo, migraciones, incidentes o limitaciones relevantes. Agrupar ajustes de una misma función.
- Indicar qué quedó implementado, verificado, aplicado o publicado, según la evidencia disponible. Si un cambio sustituye una decisión anterior, enlazar su antecedente y explicar el motivo.
- Enlazar resultados detallados en `artifacts/`; evitar copiar conteos de pruebas, IDs de despliegue y relatos paso a paso. Actualizar el seguimiento cuando exista evidencia de cierre.
- Conservar importes personales, estados de cuenta, respaldos y credenciales fuera de Git. La bitácora registra el efecto técnico de una conciliación, no sus operaciones privadas.
- Actualizar el README cuando cambie el funcionamiento vigente. Las guías técnicas conservan los procedimientos reproducibles; esta bitácora conserva los antecedentes.

El texto anterior a la reorganización puede consultarse desde la raíz sin sobrescribir archivos:

```bash
git show 4562aa0cec0a46d8b482fdfef96116d1d3040282:README.md
```
