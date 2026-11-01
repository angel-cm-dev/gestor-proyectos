/**
 * CLI de base de datos:
 *   npm run db:migrate   → aplica migraciones pendientes
 *   npm run db:seed      → migra y carga datos demo (si la BD está vacía)
 */
import { loadConfig } from '../../config/env';
import { BcryptPasswordHasher, systemClock } from '../security/security';
import { createPostgresDb } from './db';
import { migrate } from './migrate';
import { seedDemo } from './seed';

async function run() {
  const command = process.argv[2];
  const config = loadConfig();
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria para la CLI');
  const db = createPostgresDb(config.DATABASE_URL);
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'Esquema al día');
    if (command === 'seed') {
      const seeded = await seedDemo(db, new BcryptPasswordHasher(config.BCRYPT_ROUNDS), systemClock.today());
      console.log(seeded ? 'Datos demo cargados' : 'La BD ya tenía usuarios: seed omitido');
    }
  } finally {
    await db.end?.();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
