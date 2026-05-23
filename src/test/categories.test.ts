import type { Category, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

const prismaMocks = vi.hoisted(() => ({
  categoryFindMany: vi.fn<(args: unknown) => Promise<Category[]>>(),
  categoryFindUnique: vi.fn<(args: unknown) => Promise<Category | null>>(),
  categoryCreate: vi.fn<(args: unknown) => Promise<Category>>(),
  categoryUpdate: vi.fn<(args: unknown) => Promise<Category>>(),
  categoryDelete: vi.fn<(args: unknown) => Promise<Category>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    category: {
      findMany: prismaMocks.categoryFindMany,
      findUnique: prismaMocks.categoryFindUnique,
      create: prismaMocks.categoryCreate,
      update: prismaMocks.categoryUpdate,
      delete: prismaMocks.categoryDelete,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
  },
}));

type CategoryResponse = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
};

type CategoryWriteArgs = {
  where?: {
    id?: unknown;
    slug?: unknown;
  };
  data?: {
    name?: unknown;
    slug?: unknown;
  };
};

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'category-1',
  name: 'Plomería',
  slug: 'plomeria',
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'admin-1',
  email: 'admin@arreglaya.com',
  passwordHash: 'hashed-password',
  fullName: 'Sofia Herrera',
  role: 'ADMIN',
  city: 'Buenos Aires',
  zone: 'Centro',
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

describe('categories routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista categorías sin autenticación', async () => {
    const app = createApp();

    prismaMocks.categoryFindMany.mockResolvedValue([
      makeCategory({ id: 'category-2', name: 'Electricidad', slug: 'electricidad' }),
      makeCategory(),
    ]);

    const response = await request(app).get('/categories');
    const body = response.body as CategoryResponse[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0]?.slug).toBe('electricidad');
  });

  it('crea categorías como admin normalizando el slug', async () => {
    const app = createApp();
    const admin = makeUser();
    const createdCategory = makeCategory({
      id: 'category-3',
      name: 'Aire acondicionado',
      slug: 'aire-acondicionado',
    });

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.categoryFindUnique.mockResolvedValue(null);
    prismaMocks.categoryCreate.mockResolvedValue(createdCategory);

    const response = await request(app)
      .post('/categories')
      .set('Authorization', bearerTokenFor(admin))
      .send({
        name: 'Aire acondicionado',
        slug: 'AIRE-ACONDICIONADO',
      });
    const body = response.body as CategoryResponse;
    const createArgs = prismaMocks.categoryCreate.mock.calls[0]?.[0] as
      | CategoryWriteArgs
      | undefined;

    expect(response.status).toBe(201);
    expect(body.slug).toBe('aire-acondicionado');
    expect(createArgs?.data?.name).toBe('Aire acondicionado');
    expect(createArgs?.data?.slug).toBe('aire-acondicionado');
  });

  it('rechaza crear categorías sin rol admin', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);

    const response = await request(app)
      .post('/categories')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        name: 'Gas',
        slug: 'gas',
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(prismaMocks.categoryCreate).not.toHaveBeenCalled();
  });

  it('evita actualizar a un slug usado por otra categoría', async () => {
    const app = createApp();
    const admin = makeUser();
    const existingCategory = makeCategory({ id: 'other-category', slug: 'electricidad' });

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.categoryFindUnique.mockResolvedValue(existingCategory);

    const response = await request(app)
      .patch('/categories/category-1')
      .set('Authorization', bearerTokenFor(admin))
      .send({
        slug: 'electricidad',
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(409);
    expect(body.code).toBe('CATEGORY_SLUG_IN_USE');
    expect(prismaMocks.categoryUpdate).not.toHaveBeenCalled();
  });

  it('elimina categorías como admin', async () => {
    const app = createApp();
    const admin = makeUser();
    const deletedCategory = makeCategory();

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.categoryDelete.mockResolvedValue(deletedCategory);

    const response = await request(app)
      .delete('/categories/category-1')
      .set('Authorization', bearerTokenFor(admin));
    const deleteArgs = prismaMocks.categoryDelete.mock.calls[0]?.[0] as
      | CategoryWriteArgs
      | undefined;

    expect(response.status).toBe(204);
    expect(deleteArgs?.where?.id).toBe('category-1');
  });
});
