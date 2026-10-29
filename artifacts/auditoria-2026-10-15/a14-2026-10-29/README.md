# A14 · Controles del login móvil · 29 de octubre de 2026

Implementación local sobre `b701fb4882caa2d7defd6faf002cb1a5a9af179b`. [Hallazgo](../informe.md#A14). Sin publicación, migraciones nuevas, cambios de dependencias ni acceso a servicios remotos. La aceptación visual usa el build real y Auth ficticia; la suite usa PostgreSQL 16 local desechable.

## Implementación

- [Input](../../../src/components/ui/input.tsx) incorpora `density="comfortable"`: altura mínima de 48 px, padding y texto de 16 px, sin reducirlo en escritorio. La densidad predeterminada sigue siendo compacta.
- [Button](../../../src/components/ui/button.tsx) incorpora `size="touch"`: mínimos de 48×48 px y texto de 16 px; admite varias líneas al ampliar el texto. Conserva sus variantes, foco, estado deshabilitado y tamaños anteriores.
- [Login](../../../src/app/login/page.tsx) aplica esas opciones al correo, contraseña, envío y cambio de modo. Usa los Field existentes y conserva labels, validación nativa, mensajes, recuperación y bloqueo durante envío. El cambio de modo comparte un botón y retira los mensajes anteriores.
- `name="email"`/`name="password"`, `autocomplete="username"` y contraseña `current-password`/`new-password` según el modo. El correo declara `inputmode="email"`, sin mayúsculas ni autocorrección; las teclas sugeridas son siguiente, acceso y registro. No se fuerza el foco al cargar ni se restringe el zoom.
- Altura mínima `100dvh` con padding vertical y contenido desplazable. El pie puede reacomodarse; los botones crecen con el texto. No se modifica el contrato de autenticación ni los tamaños de los otros consumidores.

## Verificación

| Comprobación | Resultado y evidencia |
| --- | --- |
| Tipos | Web, pruebas y contratos negativos correctos: [web](typecheck.log), [pruebas](typecheck-tests.log), [contratos](test-types.log). |
| Lint | Cero errores y dos advertencias previas: `loadSubscriptions` sin uso y TanStack/React Compiler. [Log](lint.log). |
| Suite completa | **965 escenarios correctos, cero fallos y cero omisiones**, PostgreSQL local. No se añadieron escenarios a la suite para este ajuste visual. [Resultado final](tests-local.log). |
| Build | `pnpm build` predeterminado correcto, Next.js 16.4.3/Turbopack con TypeScript. Conexiones locales y Auth ficticia explícitas. [Log](build.log). |
| BD | Aplicadas las 42 migraciones existentes a `afp_test_a14`. No hay cambios de persistencia ni se requiere otra reconstrucción `db:verify`. [Log](migrate.log). |
| UI compartida | Revisión React de propiedades, estado, composición, labels y foco. Detector impeccable sin observaciones: [resultado](impeccable.json). Las variantes nuevas son optativas. |
| Fixture visual | Servidor de Auth ficticia sin cuerpos ni contraseñas en sus registros. Su fuente se comprobó con TypeScript estricto y ESLint. [Fuente](auth-fixture.ts), [tipos](auth-fixture-types.log), [lint](auth-fixture-lint.log). |

La primera suite tuvo **963 correctos y 2 fallos**: el subcaso preexistente de Captura que busca la subcadena `1000` en el JSON completo y su padre. La repetición aislada pasó sus **26 escenarios** y la segunda suite completa pasó los **965**. Se conservan [el primer resultado](tests-local-initial.log), [la repetición aislada](test-rollout-repeat.log) y [todos los códigos de salida](checks.json). No se modificó esa prueba ni se omite su fallo inicial; estas repeticiones no establecen su causa.

## Navegador

[Mediciones y aserciones](browser-acceptance.json). Chromium **150.0.7871.24**, agent-browser, viewport/UA móvil emulados y toque sintetizado con CDP. Son medidas CSS; las capturas móviles iniciales usan DPR 3. Se midieron ambos modos en 390×844, 320×568, 390×360, 844×390, 768×1024 y 1440×900.

- Los cuatro controles miden **48 px de alto** con texto normal; los campos mantienen **16 px** en todos los tamaños. Ninguno de esos tamaños presenta desbordamiento horizontal. [Acceso móvil](login-mobile.png), [registro móvil](register-mobile.png), [escritorio](login-desktop.png).
- Un toque sintético enfoca el correo. Tab recorre contraseña → envío → cambio de modo, con foco visible; Shift+Tab retrocede. Enter en contraseña envía tanto acceso como registro. El registro se confirma contra el fixture; no crea un usuario real.
- Durante la espera, los cuatro controles quedan deshabilitados y conservan su tamaño. Un 400 de credenciales inválidas muestra el mensaje en español y conserva los valores. Cambiar de modo limpia mensajes y cambia el autocompletado de contraseña. Un correo inválido se rechaza antes de enviar otra petición. [Carga](login-loading.png), [error](login-error-mobile.png).
- En **390×360**, contraseña y envío siguen alcanzables mediante foco y desplazamiento; el formulario crece verticalmente. Esta reducción del viewport comprueba el espacio disponible, no simula un teclado virtual real. [Captura](login-short-viewport.png).
- Texto raíz al **200%** en 320×568: los campos alcanzan 32 px de fuente y mínimos de 96 px; controles y pie se reacomodan sin desbordamiento horizontal. [Registro ampliado](register-text-200-percent.png). Es ampliación de texto mediante CSS, distinta de zoom de navegador.
- Escala de página móvil **2** aplicada mediante CDP: `visualViewport.scale=2`, viewport visual de 195 px. El meta viewport conserva `width=device-width, initial-scale=1`, sin límite de zoom. [Captura](login-zoom-200-percent.png).
- Ninguna excepción de página registrada durante el recorrido final.

## Reproducción

Crear PostgreSQL local desechable conforme al README, en el puerto 55444 y con base `afp_test_a14`. Fijar estas variables en una terminal dedicada; sus valores son ficticios y locales:

```bash
export DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55444/afp_test_a14
export DIRECT_URL="$DATABASE_URL"
export AFP_TEST_DATABASE_URL="$DATABASE_URL"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4234
export NEXT_PUBLIC_SUPABASE_ANON_KEY=a14-fake-public-key

pnpm exec prisma migrate deploy
pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
pnpm test
pnpm build
pnpm exec next start --hostname 127.0.0.1 --port 4233
```

En otra terminal, desde la raíz:

```bash
node --import tsx artifacts/auditoria-2026-10-15/a14-2026-10-29/auth-fixture.ts
npx --yes agent-browser --session a14 set device 'iPhone 14'
npx --yes agent-browser --session a14 open http://127.0.0.1:4233/login
npx --yes agent-browser --session a14 wait --load networkidle
npx --yes agent-browser --session a14 snapshot -i
```

El fixture ocupa la terminal; ejecutar los comandos de navegador en otra. Si no se encuentra Chrome, proporcionar su ruta con `--executable-path` al abrir la sesión. Usar `a14-qa@example.test` y una contraseña inventada de seis o más caracteres. El acceso espera ocho segundos y rechaza las credenciales; el registro devuelve una confirmación ficticia. No reutilizar una sesión real para este recorrido.

Recorrer con Tab/Shift+Tab, enviar con Enter y cambiar entre los modos. Esperar al título correspondiente después de cada cambio antes de medir. Repetir con `set viewport ANCHO ALTO 1` para los tamaños anteriores. Medir alturas y fuente con:

```bash
npx --yes agent-browser --session a14 eval --stdin <<'JS'
[...document.querySelectorAll('main input, main button')].map(el => ({
  control: el.id || el.textContent,
  height: el.getBoundingClientRect().height,
  width: el.getBoundingClientRect().width,
  fontSize: getComputedStyle(el).fontSize,
  autocomplete: el.getAttribute('autocomplete')
}))
JS
```

Para ampliación de texto usar `document.documentElement.style.fontSize="200%"` desde `eval`; retirar ese estilo después. Para escala de página usar DevTools/CDP `Emulation.setPageScaleFactor` con `pageScaleFactor: 2` y comprobar `visualViewport.scale`. Guardar las capturas sin datos reales. Cerrar navegador, servidores y la base desechable al terminar.

[Resumen y huellas de fuentes](verification.json).

## Límites

No se acredita publicación, acceso/registro con Supabase Auth real, teclado virtual o gestor de contraseñas de un teléfono físico, ni comportamiento de Safari/iOS. El autocompletado se verifica por sus atributos y por la captura del formulario; no se ejercitó un gestor real. La emulación de espacio, el toque sintetizado y CDP no sustituyen esa aceptación física. No se certifica WCAG ni se deriva una infracción AA únicamente de tamaños táctiles.
