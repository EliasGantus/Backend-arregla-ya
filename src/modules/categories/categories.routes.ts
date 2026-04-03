import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { serializeCategory } from '../../lib/serializers.js';

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
