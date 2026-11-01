import { ForbiddenError, NotFoundError, UnauthorizedError, ConflictError } from '../../domain/errors';
import { canManageUsers } from '../../domain/permissions';
import type { Actor, Page, User } from '../../domain/types';
import type { CreateUserDto, ListUsersQuery, UpdateUserDto } from '../dtos';
import type { PasswordHasher, TokenService, UserRepository } from '../ports';

export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.active) {
      // Se compara contra un hash ficticio para que la respuesta tarde lo mismo
      // exista o no el correo: evita enumerar usuarios midiendo tiempos.
      this.dummyHash ??= this.hasher.hash('contraseña-ficticia-0');
      await this.hasher.verify(password, await this.dummyHash);
      throw new UnauthorizedError('Credenciales inválidas');
    }
    const ok = await this.hasher.verify(password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Credenciales inválidas');

    const { passwordHash: _omit, ...publicUser } = user;
    const token = this.tokens.sign({ sub: user.id, role: user.role, name: user.name, username: user.username });
    return { token, user: publicUser };
  }

  /** Verifica el token y que el usuario siga activo (un usuario desactivado pierde acceso de inmediato). */
  async authenticate(token: string): Promise<Actor> {
    const claims = this.tokens.verify(token);
    const user = await this.users.findById(claims.sub);
    if (!user || !user.active) throw new UnauthorizedError('Usuario inactivo o inexistente');
    return { id: user.id, role: user.role, name: user.name, username: user.username };
  }

  async me(actor: Actor): Promise<User> {
    const user = await this.users.findById(actor.id);
    if (!user) throw new NotFoundError('Usuario', actor.id);
    return user;
  }
}

export class UsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  /** Directorio de usuarios: visible para todos (se necesita para asignar y mencionar). */
  list(query: ListUsersQuery): Promise<Page<User>> {
    return this.users.list(query);
  }

  async create(actor: Actor, dto: CreateUserDto): Promise<User> {
    if (!canManageUsers(actor.role)) throw new ForbiddenError('Solo un administrador puede crear usuarios');
    const taken = await this.users.findTaken(dto.email, dto.username);
    if (taken.email) throw new ConflictError('Ya existe un usuario con ese correo', 'email_taken');
    if (taken.username) throw new ConflictError('Ese nombre de usuario ya está en uso', 'username_taken');
    return this.users.create({
      name: dto.name,
      email: dto.email,
      username: dto.username,
      role: dto.role,
      passwordHash: await this.hasher.hash(dto.password),
    });
  }

  async update(actor: Actor, id: number, dto: UpdateUserDto): Promise<User> {
    if (!canManageUsers(actor.role)) throw new ForbiddenError('Solo un administrador puede modificar usuarios');
    // Un admin no puede quitarse a sí mismo el rol ni desactivarse: evita quedarse sin administradores.
    if (actor.id === id && ((dto.role && dto.role !== 'admin') || dto.active === false)) {
      throw new ConflictError('No puedes quitarte el rol de administrador ni desactivarte a ti mismo', 'self_lockout');
    }
    const updated = await this.users.update(id, {
      name: dto.name,
      role: dto.role,
      active: dto.active,
      passwordHash: dto.password ? await this.hasher.hash(dto.password) : undefined,
    });
    if (!updated) throw new NotFoundError('Usuario', id);
    return updated;
  }
}
