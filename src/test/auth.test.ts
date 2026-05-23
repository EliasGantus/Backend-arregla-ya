import type { User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

const prismaMocks = vi.hoisted(() => ({
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
  userCreate: vi.fn<(args: unknown) => Promise<User>>(),
  userUpdate: vi.fn<(args: unknown) => Promise<User>>(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: prismaMocks.userFindUnique,
      create: prismaMocks.userCreate,
      update: prismaMocks.userUpdate,
    },
  },
}));

type AuthResponse = {
  accessToken?: unknown;
  refreshToken?: unknown;
  user?: {
    email?: unknown;
    role?: unknown;
    passwordHash?: unknown;
  };
};

type UserWriteArgs = {
  where?: {
    id?: unknown;
  };
  data?: {
    email?: unknown;
    role?: unknown;
    refreshTokenHash?: unknown;
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
  refreshTokenHash: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registra usuarios cliente y emite tokens sin exponer el password hash', async () => {
    const app = createApp();
    const createdUser = makeUser({
      id: 'new-user',
      email: 'nuevo@arreglaya.com',
    });

    prismaMocks.userFindUnique.mockResolvedValue(null);
    prismaMocks.userCreate.mockResolvedValue(createdUser);
    prismaMocks.userUpdate.mockResolvedValue({
      ...createdUser,
      refreshTokenHash: 'stored-refresh-hash',
    });

    const response = await request(app).post('/auth/register').send({
      email: 'NUEVO@ARREGLAYA.COM',
      password: '123456',
      fullName: 'Nuevo Cliente',
      role: 'cliente',
      city: 'Buenos Aires',
      zone: 'Palermo',
    });
    const body = response.body as AuthResponse;

    expect(response.status).toBe(201);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.user?.email).toBe('nuevo@arreglaya.com');
    expect(body.user?.role).toBe('cliente');
    expect(body.user?.passwordHash).toBeUndefined();

    const createArgs = prismaMocks.userCreate.mock.calls[0]?.[0] as UserWriteArgs | undefined;
    const updateArgs = prismaMocks.userUpdate.mock.calls[0]?.[0] as UserWriteArgs | undefined;

    expect(createArgs?.data?.email).toBe('nuevo@arreglaya.com');
    expect(createArgs?.data?.role).toBe('CLIENTE');
    expect(updateArgs?.where?.id).toBe('new-user');
    expect(typeof updateArgs?.data?.refreshTokenHash).toBe('string');
  });

  it('loguea profesionales con credenciales validas y rota el refresh token', async () => {
    const app = createApp();
    const passwordHash = await authUtils.hashPassword('123456');
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      passwordHash,
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.userUpdate.mockResolvedValue({
      ...professional,
      refreshTokenHash: 'stored-refresh-hash',
    });

    const response = await request(app).post('/auth/login').send({
      email: 'PRO@ARREGLAYA.COM',
      password: '123456',
    });
    const body = response.body as AuthResponse;

    expect(response.status).toBe(200);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.user?.email).toBe('pro@arreglaya.com');
    expect(body.user?.role).toBe('profesional');

    const updateArgs = prismaMocks.userUpdate.mock.calls[0]?.[0] as UserWriteArgs | undefined;

    expect(updateArgs?.where?.id).toBe('pro-1');
    expect(typeof updateArgs?.data?.refreshTokenHash).toBe('string');
  });

  it('refresca una sesion cuando el refresh token coincide con el hash persistido', async () => {
    const app = createApp();
    const refreshToken = authUtils.signRefreshToken('user-1');
    const refreshTokenHash = await authUtils.hashToken(refreshToken);
    const user = makeUser({ refreshTokenHash });

    prismaMocks.userFindUnique.mockResolvedValue(user);
    prismaMocks.userUpdate.mockResolvedValue({
      ...user,
      refreshTokenHash: 'rotated-refresh-hash',
    });

    const response = await request(app).post('/auth/refresh').send({ refreshToken });
    const body = response.body as AuthResponse;

    expect(response.status).toBe(200);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it('valida el access token para consultar la sesion actual', async () => {
    const app = createApp();
    const user = makeUser();
    const accessToken = authUtils.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    prismaMocks.userFindUnique.mockResolvedValue(user);

    const response = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`);
    const body = response.body as AuthResponse['user'];

    expect(response.status).toBe(200);
    expect(body?.email).toBe('cliente@arreglaya.com');
    expect(body?.role).toBe('cliente');
  });

  it('rechaza rutas protegidas sin access token', async () => {
    const app = createApp();

    const response = await request(app).get('/me');
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(401);
    expect(body.code).toBe('AUTH_REQUIRED');
    expect(prismaMocks.userFindUnique).not.toHaveBeenCalled();
  });
});
