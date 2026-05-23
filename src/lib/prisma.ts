import { PrismaClient } from '@prisma/client';

declare global {
  var __arreglaYaPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__arreglaYaPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__arreglaYaPrisma__ = prisma;
}
