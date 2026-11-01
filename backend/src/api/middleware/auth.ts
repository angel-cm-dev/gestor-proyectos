import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../../application/services/auth.service';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors';
import type { Actor, GlobalRole } from '../../domain/types';

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
  }
}

/** Exige un JWT válido en "Authorization: Bearer <token>" y adjunta el usuario a req.actor. */
export function authenticate(auth: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedError('Falta el token Bearer');
    req.actor = await auth.authenticate(token);
    next();
  };
}

/** Autorización por rol GLOBAL a nivel de endpoint (el rol por proyecto se verifica en los servicios). */
export function requireRole(...roles: GlobalRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor || !roles.includes(req.actor.role)) {
      throw new ForbiddenError(`Requiere rol: ${roles.join(' o ')}`);
    }
    next();
  };
}

/** Obtiene el actor autenticado (las rutas protegidas siempre lo tienen). */
export function actorOf(req: Request): Actor {
  if (!req.actor) throw new UnauthorizedError();
  return req.actor;
}
