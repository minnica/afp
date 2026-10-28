// Interfaz/API reales; Auth ficticia y PostgreSQL local desechable. No carga .env.
import { runNextBrowserFixture } from './next-browser-fixture';

void runNextBrowserFixture({ kind: 'money', port: Number(process.env.AFP_UI_TEST_PORT || 4216) })
  // Next dev conserva watchers internos incluso después de app.close().
  // La entrada CLI termina solo tras cerrar HTTP, Prisma y la copia temporal.
  .then(() => process.exit(0), (error: unknown) => { console.error(error); process.exit(1); });
