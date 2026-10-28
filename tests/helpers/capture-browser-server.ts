// Interfaz/API reales; Auth ficticia y PostgreSQL local desechable. No carga .env.
import { runNextBrowserFixture } from './next-browser-fixture';

void runNextBrowserFixture({ kind: 'capture', port: 4208 })
  // Terminar los watchers de Next dev después de completar toda la limpieza.
  .then(() => process.exit(0), (error: unknown) => { console.error(error); process.exit(1); });
