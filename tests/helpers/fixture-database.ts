// No carga .env. Validar antes de importar clientes o crear recursos temporales.
export function fixtureConnection(value = process.env.AFP_TEST_DATABASE_URL): string {
  if (!value) throw new Error('Falta AFP_TEST_DATABASE_URL.');
  const url = new URL(value);
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || !['localhost', '127.0.0.1'].includes(url.hostname)
    || !/^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) || url.search || url.hash) {
    throw new Error('Solo permite PostgreSQL local afp_test, sin parámetros ni fragmentos.');
  }
  return value;
}

export async function fixtureDatabase(connectionString: string) {
  fixtureConnection(connectionString);
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import('@prisma/client'), import('@prisma/adapter-pg'),
  ]);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
