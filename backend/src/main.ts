import { createApp } from './app';
import { loadConfig } from './config/env';
import { createContainer } from './container';
import { createMemoryDb, createPostgresDb } from './infrastructure/db/db';
import { migrate } from './infrastructure/db/migrate';
import { seedDemo } from './infrastructure/db/seed';
import { createLogger } from './infrastructure/logger';
import { systemClock } from './infrastructure/security/security';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

  const db = config.DB_DRIVER === 'memory' ? await createMemoryDb() : createPostgresDb(config.DATABASE_URL as string);
  if (config.DB_DRIVER === 'memory') logger.warn('DB_DRIVER=memory: los datos viven en memoria y se pierden al reiniciar');

  const applied = await migrate(db);
  if (applied.length) logger.info({ applied }, 'Migraciones aplicadas');

  const container = createContainer({
    db,
    logger,
    jwtSecret: config.JWT_SECRET,
    jwtExpiresIn: config.JWT_EXPIRES_IN,
    bcryptRounds: config.BCRYPT_ROUNDS,
    corsOrigin: config.CORS_ORIGIN,
  });

  // En memoria siempre se siembra: de lo contrario no habría con quién iniciar sesión.
  if (config.SEED_DEMO || config.DB_DRIVER === 'memory') {
    const seeded = await seedDemo(db, container.hasher, systemClock.today());
    if (seeded) logger.info('Datos demo cargados (admin@demo.pe / Demo123!)');
  }

  const server = createApp(container).listen(config.PORT, () => {
    logger.info(`API escuchando en http://localhost:${config.PORT} — docs en /api/docs`);
  });

  // Apagado ordenado: deja terminar las peticiones en curso y cierra el pool.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Cerrando servidor...');
    server.close(async () => {
      await db.end?.();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('No se pudo iniciar la API:', err);
  process.exit(1);
});
