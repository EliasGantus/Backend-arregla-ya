import type { User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

const prismaMocks = vi.hoisted(() => ({
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
  userFindMany: vi.fn<(args: unknown) => Promise<User[]>>(),
  userCreate: vi.fn<(args: unknown) => Promise<User>>(),
  userUpdate: vi.fn<(args: unknown) => Promise<User>>(),
  userDelete: vi.fn<(args: unknown) => Promise<User>>(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: prismaMocks.userFindUnique,
      findMany: prismaMocks.userFindMany,
      create: prismaMocks.userCreate,
      update: prismaMocks.userUpdate,
      delete: prismaMocks.userDelete,
    },
  },
}));

type UserResponse = {
  id?: unknown;
  email?: unknown;
  fullName?: unknown;
  role?: unknown;
  passwordHash?: unknown;
};

type UserWriteArgs = {
  where?: {
    id?: unknown;
    email?: unknown;
  };
  data?: {
    email?: unknown;
    passwordHash?: unknown;
    fullName?: unknown;
    role?: unknown;
    city?: unknown;
    zone?: unknown;
  };
};

type UserListArgs = {
  where?: {
    role?: unknown;
  };
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'cliente@arreglaya.com',
  passwordHash: 'hashed-password',
  fullName: 'Lucia Benitez',
  role: 'CLIENTE',
  city: 'Buenos Aires',
  zone: 'Caballito',
  ratingAverage: 0,
  ratingCount: 0,
  refreshTokenHash: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const bearerTokenFor = (user: User) =>
  `Bearer ${authUtils.signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  })}`;

describe('users routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista usuarios para admin y permite filtrar por rol', async () => {
    const app = createApp();
    const admin = makeUser({ id: 'admin-1', email: 'admin@arreglaya.com', role: 'ADMIN' });
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.userFindMany.mockResolvedValue([professional]);

    const response = await request(app)
      .get('/users?role=profesional')
      .set('Authorization', bearerTokenFor(admin));
    const body = response.body as UserResponse[];
    const findManyArgs = prismaMocks.userFindMany.mock.calls[0]?.[0] as UserListArgs | undefined;

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.role).toBe('profesional');
    expect(findManyArgs?.where?.role).toBe('PROFESIONAL');
  });

  it('crea usuarios cliente o profesional desde un administrador', async () => {
    const app = createApp();
    const admin = makeUser({ id: 'admin-1', email: 'admin@arreglaya.com', role: 'ADMIN' });
    const createdUser = makeUser({
      id: 'new-user',
      email: 'nuevo@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValueOnce(admin).mockResolvedValueOnce(null);
    prismaMocks.userCreate.mockResolvedValue(createdUser);

    const response = await request(app)
      .post('/users')
      .set('Authorization', bearerTokenFor(admin))
      .send({
        email: 'NUEVO@ARREGLAYA.COM',
        password: '123456',
        fullName: 'Nuevo Profesional',
        role: 'profesional',
        city: 'Buenos Aires',
        zone: 'Almagro',
      });
    const body = response.body as UserResponse;
    const createArgs = prismaMocks.userCreate.mock.calls[0]?.[0] as UserWriteArgs | undefined;

    expect(response.status).toBe(201);
    expect(body.email).toBe('nuevo@arreglaya.com');
    expect(body.role).toBe('profesional');
    expect(body.passwordHash).toBeUndefined();
    expect(createArgs?.data?.email).toBe('nuevo@arreglaya.com');
    expect(createArgs?.data?.role).toBe('PROFESIONAL');
    expect(typeof createArgs?.data?.passwordHash).toBe('string');
  });

  it('permite consultar un usuario propio por id', async () => {
    const app = createApp();
    const user = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(user);

    const response = await request(app)
      .get('/users/user-1')
      .set('Authorization', bearerTokenFor(user));
    const body = response.body as UserResponse;

    expect(response.status).toBe(200);
    expect(body.id).toBe('user-1');
    expect(body.email).toBe('cliente@arreglaya.com');
  });

  it('actualiza solo datos de perfil cuando el usuario no es admin', async () => {
    const app = createApp();
    const user = makeUser();
    const updatedUser = makeUser({ fullName: 'Lucia Actualizada' });

    prismaMocks.userFindUnique.mockResolvedValue(user);
    prismaMocks.userUpdate.mockResolvedValue(updatedUser);

    const response = await request(app)
      .patch('/users/user-1')
      .set('Authorization', bearerTokenFor(user))
      .send({
        fullName: 'Lucia Actualizada',
        role: 'profesional',
      });
    const body = response.body as UserResponse;
    const updateArgs = prismaMocks.userUpdate.mock.calls[0]?.[0] as UserWriteArgs | undefined;

    expect(response.status).toBe(200);
    expect(body.fullName).toBe('Lucia Actualizada');
    expect(updateArgs?.where?.id).toBe('user-1');
    expect(updateArgs?.data?.fullName).toBe('Lucia Actualizada');
    expect(updateArgs?.data?.role).toBeUndefined();
  });

  it('elimina usuarios solo con rol administrador', async () => {
    const app = createApp();
    const admin = makeUser({ id: 'admin-1', email: 'admin@arreglaya.com', role: 'ADMIN' });
    const deletedUser = makeUser({ id: 'user-to-delete' });

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.userDelete.mockResolvedValue(deletedUser);

    const response = await request(app)
      .delete('/users/user-to-delete')
      .set('Authorization', bearerTokenFor(admin));
    const deleteArgs = prismaMocks.userDelete.mock.calls[0]?.[0] as UserWriteArgs | undefined;

    expect(response.status).toBe(204);
    expect(deleteArgs?.where?.id).toBe('user-to-delete');
  });
});
