import { z } from 'zod';

/**
 * Configuración validada al arrancar: si falta una variable crítica la app
 * falla de inmediato con un mensaje claro, en lugar de fallar en producción
 * a mitad de una petición.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    /** postgres = PostgreSQL real; memory = pg-mem (demo rápida sin instalar nada). */
    DB_DRIVER: z.enum(['postgres', 'memory']).default('postgres'),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
    JWT_EXPIRES_IN: z.string().default('8h'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    SEED_DEMO: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((c) => c.DB_DRIVER === 'memory' || Boolean(c.DATABASE_URL), {
    message: 'DATABASE_URL es obligatoria cuando DB_DRIVER=postgres',
    path: ['DATABASE_URL'],
  });

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida -> ${detail}`);
  }
  return parsed.data;
}
