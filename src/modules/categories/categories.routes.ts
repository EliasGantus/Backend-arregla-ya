import { Prisma, type Category } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { serializeCategory } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

const normalizeSlug = (value: string) => value.trim().toLowerCase();
const normalizeName = (value: string) => value.trim();

const categorySchema = z.object({
  name: z.string().min(2).transform(normalizeName),
  slug: z
    .string()
    .min(2)
    .transform(normalizeSlug)
    .pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido.')),
});

const categoryUpdateSchema = categorySchema.partial();

const isRecordNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

const ensureSlugAvailable = async (slug: string, currentCategoryId?: string) => {
  const existingCategory = await prisma.category.findUnique({
    where: { slug },
  });

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw new HttpError(409, 'Ya existe una categoría con ese slug.', 'CATEGORY_SLUG_IN_USE');
  }
};

const updateCategory = async (
  categoryId: string,
  data: {
    name?: string;
    slug?: string;
  },
): Promise<Category> => {
  try {
    return await prisma.category.update({
      where: { id: categoryId },
      data,
    });
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new HttpError(404, 'Categoría no encontrada.', 'CATEGORY_NOT_FOUND');
    }

    throw error;
  }
};

export const categoriesRouter = Router();

categoriesRouter.get(
  '/categories',
  asyncHandler(async (_request, response) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    response.json(categories.map(serializeCategory));
  }),
);

categoriesRouter.get(
  '/categories/:id',
  asyncHandler(async (request, response) => {
    const category = await prisma.category.findUnique({
      where: { id: String(request.params.id) },
    });

    if (!category) {
      throw new HttpError(404, 'Categoría no encontrada.', 'CATEGORY_NOT_FOUND');
    }

    response.json(serializeCategory(category));
  }),
);

categoriesRouter.post(
  '/categories',
  authenticate,
  requireRoles(['ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = categorySchema.parse(request.body);
    const slug = payload.slug;

    await ensureSlugAvailable(slug);

    const category = await prisma.category.create({
      data: {
        name: payload.name,
        slug,
      },
    });

    response.status(201).json(serializeCategory(category));
  }),
);

categoriesRouter.patch(
  '/categories/:id',
  authenticate,
  requireRoles(['ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = categoryUpdateSchema.parse(request.body);
    const slug = payload.slug;

    if (slug) {
      await ensureSlugAvailable(slug, String(request.params.id));
    }

    const category = await updateCategory(String(request.params.id), {
      name: payload.name,
      slug,
    });

    response.json(serializeCategory(category));
  }),
);

categoriesRouter.delete(
  '/categories/:id',
  authenticate,
  requireRoles(['ADMIN']),
  asyncHandler(async (request, response) => {
    try {
      await prisma.category.delete({
        where: { id: String(request.params.id) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new HttpError(
          409,
          'No se puede eliminar una categoría con solicitudes relacionadas.',
          'CATEGORY_HAS_RELATED_DATA',
        );
      }

      if (isRecordNotFound(error)) {
        throw new HttpError(404, 'Categoría no encontrada.', 'CATEGORY_NOT_FOUND');
      }

      throw error;
    }

    response.status(204).send();
  }),
);
