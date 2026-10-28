import { fixtureConnection, fixtureDatabase } from '../helpers/fixture-database';
import { copyNextConfiguration, generateNextTypes } from '../helpers/next-fixture';
import { runNextBrowserFixture } from '../helpers/next-browser-fixture';

// @ts-expect-error La conexión debe validarse desde una cadena explícita.
fixtureConnection({ hostname: 'localhost' });
// @ts-expect-error El cliente no admite opciones Prisma en lugar de la conexión.
void fixtureDatabase({ connectionString: 'postgresql://localhost/afp_test' });
// @ts-expect-error El destino de copia es una ruta, no un objeto de configuración.
copyNextConfiguration({ directory: '/tmp/fixture' });
// @ts-expect-error La generación de tipos requiere un directorio de fixture explícito.
generateNextTypes();
// @ts-expect-error Solo existen los fixtures de dominio money y capture.
void runNextBrowserFixture({ kind: 'production', port: 4216 });
// @ts-expect-error El puerto del servidor debe ser numérico.
void runNextBrowserFixture({ kind: 'money', port: '4216' });
