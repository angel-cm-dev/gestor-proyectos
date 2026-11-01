import { Pool, types } from 'pg';

/**
 * Abstracción mínima de base de datos. Tanto `pg.Pool` (producción) como el
 * adaptador de pg-mem (pruebas / modo demo en memoria) cumplen esta interfaz,
 * así los repositorios SQL son exactamente los mismos en ambos casos.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end?(): Promise<void>;
}

// DATE (OID 1082) se devuelve como texto 'YYYY-MM-DD': evita corrimientos por zona horaria.
types.setTypeParser(1082, (value: string) => value);

export function createPostgresDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 10 });
  return pool as unknown as Db;
}

/**
 * Base PostgreSQL emulada en memoria (pg-mem). Se usa en las pruebas y en el
 * modo demo DB_DRIVER=memory, de modo que no hace falta Docker para probar la API.
 */
export async function createMemoryDb(): Promise<Db> {
  // Import dinámico: pg-mem solo se carga cuando realmente se usa.
  const { newDb } = await import('pg-mem');
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool: MemPool } = mem.adapters.createPg();
  return new MemPool() as unknown as Db;
}

/** Normaliza valores DATE: pg devuelve string y pg-mem devuelve Date (UTC). */
export function asDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Normaliza TIMESTAMPTZ a ISO-8601. */
export function asTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

export function asNullableTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : asTimestamp(value);
}

/** NUMERIC y COUNT(*) llegan como string en pg y como number en pg-mem. */
export function asNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Construye la lista de placeholders "$n, $n+1, ..." para cláusulas IN. */
export function placeholders(values: unknown[], params: unknown[]): string {
  return values
    .map((v) => {
      params.push(v);
      return `$${params.length}`;
    })
    .join(', ');
}
