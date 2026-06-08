import type { Prisma, UserRole } from '@prisma/client';

type SeedUser = {
  email: string;
  fullName: string;
  role: UserRole;
  city: string;
  zone: string;
};

export const seedUsers = {
  cliente: {
    email: 'cliente@arreglaya.com',
    fullName: 'Lucia Benitez',
    role: 'CLIENTE',
    city: 'Buenos Aires',
    zone: 'Caballito',
  },
  profesional: {
    email: 'pro@arreglaya.com',
    fullName: 'Carlos Mendoza',
    role: 'PROFESIONAL',
    city: 'Buenos Aires',
    zone: 'Almagro',
  },
  admin: {
    email: 'admin@arreglaya.com',
    fullName: 'Sofia Herrera',
    role: 'ADMIN',
    city: 'Buenos Aires',
    zone: 'Centro',
  },
} satisfies Record<string, SeedUser>;

export const buildSeedUserUpsertArgs = (
  user: SeedUser,
  passwordHash: string,
): Prisma.UserUpsertArgs => {
  const data = {
    ...user,
    passwordHash,
  };

  return {
    where: { email: user.email },
    update: data,
    create: data,
  };
};
