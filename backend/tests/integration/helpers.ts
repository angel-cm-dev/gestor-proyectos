import pino from 'pino';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import type { Clock } from '../../src/application/ports';
import { createContainer } from '../../src/container';
import { createMemoryDb } from '../../src/infrastructure/db/db';
import { migrate } from '../../src/infrastructure/db/migrate';
import { DEMO_PASSWORD, seedDemo } from '../../src/infrastructure/db/seed';

/** "Hoy" fijo en las pruebas: los resultados no dependen de la fecha real. */
export const TODAY = '2026-03-18';
export const fixedClock: Clock = {
  now: () => new Date(`${TODAY}T15:00:00Z`),
  today: () => TODAY,
};

/** App completa sobre PostgreSQL en memoria (pg-mem): mismas migraciones y SQL que producción. */
export async function buildTestApp(): Promise<Express> {
  const db = await createMemoryDb();
  await migrate(db);
  const container = createContainer({
    db,
    logger: pino({ level: 'silent' }),
    jwtSecret: 'secreto-solo-para-pruebas-1234567890',
    jwtExpiresIn: '1h',
    bcryptRounds: 4,
    corsOrigin: 'http://localhost:5173',
    clock: fixedClock,
  });
  await seedDemo(db, container.hasher, TODAY);
  return createApp(container);
}

export async function login(app: Express, email: string, password = DEMO_PASSWORD): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}
