import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './db';

/**
 * Ejecutor de migraciones minimalista: aplica en orden los archivos .sql de
 * /migrations que aún no figuran en la tabla schema_migrations.
 * Funciona igual con PostgreSQL y con pg-mem.
 */
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(200) PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const executed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    // Sin parámetros, PostgreSQL ejecuta un script multi-sentencia dentro de una
    // transacción implícita: si una sentencia falla, no queda un esquema a medias.
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    executed.push(file);
  }
  return executed;
}
