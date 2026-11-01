import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Clock, PasswordHasher, TokenService } from '../../application/ports';
import { UnauthorizedError } from '../../domain/errors';
import { GLOBAL_ROLES, type GlobalRole } from '../../domain/types';

/**
 * bcrypt: hash lento y con sal por diseño, resistente a fuerza bruta.
 * bcryptjs es JavaScript puro: no requiere compilar binarios nativos en Windows.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds: number) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

type Claims = { sub: number; role: GlobalRole; name: string; username: string };

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(payload: Claims): string {
    return jwt.sign(
      { role: payload.role, name: payload.name, username: payload.username },
      this.secret,
      { subject: String(payload.sub), expiresIn: this.expiresIn as jwt.SignOptions['expiresIn'], algorithm: 'HS256' },
    );
  }

  verify(token: string): Claims {
    try {
      // Se fija el algoritmo para evitar ataques de "algorithm confusion" (p. ej. alg=none).
      const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      const role = decoded.role as GlobalRole;
      if (!decoded.sub || !GLOBAL_ROLES.includes(role)) throw new Error('claims inválidos');
      return { sub: Number(decoded.sub), role, name: String(decoded.name), username: String(decoded.username) };
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  }
}

export const systemClock: Clock = {
  now: () => new Date(),
  today: () => new Date().toISOString().slice(0, 10),
};
