import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { errorHandler, notFoundHandler } from './api/middleware/error-handler';
import { openApiSpec } from './api/openapi';
import { buildApiRouter } from './api/routes';
import type { Container } from './container';

/** Construye la app Express a partir del contenedor (sin abrir puertos: ideal para supertest). */
export function createApp(c: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger: c.logger,
      // Respeta un X-Request-Id entrante (p. ej. del proxy) para correlacionar logs.
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  // Swagger UI necesita scripts inline: se relaja la CSP solo en /api/docs.
  app.use('/api/docs', helmet({ contentSecurityPolicy: false }));
  app.use(helmet());
  app.use(cors({ origin: c.corsOrigin.split(',').map((o) => o.trim()), exposedHeaders: ['Content-Disposition', 'X-Request-Id'] }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    try {
      await c.db.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'error', timestamp: new Date().toISOString() });
    }
  });

  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Gestor de Proyectos API' }));
  app.use('/api', buildApiRouter(c));

  app.use(notFoundHandler);
  app.use(errorHandler(c.logger));
  return app;
}
