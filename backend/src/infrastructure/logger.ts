import pino, { type Logger } from 'pino';

/**
 * Logging estructurado en JSON (pino): cada línea es parseable por herramientas
 * como Loki, ELK o CloudWatch. En desarrollo se usa pino-pretty para leerlo cómodo.
 * Nunca se registran contraseñas ni tokens (ver `redact`).
 */
export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    base: { service: 'gestor-proyectos-api' },
    redact: { paths: ['req.headers.authorization', 'password', '*.password', 'passwordHash'], censor: '[oculto]' },
    transport: pretty ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } : undefined,
  });
}
