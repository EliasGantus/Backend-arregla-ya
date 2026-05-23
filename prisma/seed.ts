import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const password = '123456';

const main = async () => {
  const passwordHash = await bcrypt.hash(password, 10);

  const [cliente, profesional] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'cliente@arreglaya.com' },
      update: {},
      create: {
        email: 'cliente@arreglaya.com',
        passwordHash,
        fullName: 'Lucia Benitez',
        role: 'CLIENTE',
        city: 'Buenos Aires',
        zone: 'Caballito',
      },
    }),
    prisma.user.upsert({
      where: { email: 'pro@arreglaya.com' },
      update: {},
      create: {
        email: 'pro@arreglaya.com',
        passwordHash,
        fullName: 'Carlos Mendoza',
        role: 'PROFESIONAL',
        city: 'Buenos Aires',
        zone: 'Almagro',
      },
    }),
    prisma.user.upsert({
      where: { email: 'admin@arreglaya.com' },
      update: {},
      create: {
        email: 'admin@arreglaya.com',
        passwordHash,
        fullName: 'Sofia Herrera',
        role: 'ADMIN',
        city: 'Buenos Aires',
        zone: 'Centro',
      },
    }),
  ]);

  const [plomeria, electricidad] = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'plomeria' },
      update: {},
      create: { name: 'Plomería', slug: 'plomeria' },
    }),
    prisma.category.upsert({
      where: { slug: 'electricidad' },
      update: {},
      create: { name: 'Electricidad', slug: 'electricidad' },
    }),
  ]);

  const serviceRequest = await prisma.serviceRequest.upsert({
    where: { id: 'seed-request-1' },
    update: {},
    create: {
      id: 'seed-request-1',
      title: 'Plomería urgente en cocina',
      description: 'Se rompió una cañería y necesito revisión urgente.',
      status: 'OPEN',
      city: 'Buenos Aires',
      zone: 'Palermo',
      budget: '$85.000',
      clientId: cliente.id,
      categoryId: plomeria.id,
    },
  });

  await prisma.serviceRequest.upsert({
    where: { id: 'seed-request-2' },
    update: {},
    create: {
      id: 'seed-request-2',
      title: 'Instalación eléctrica en local',
      description: 'Necesito instalación trifásica para nuevo local comercial.',
      status: 'QUOTED',
      city: 'Córdoba',
      zone: 'Centro',
      budget: '$112.000',
      clientId: cliente.id,
      categoryId: electricidad.id,
    },
  });

  await prisma.quote.upsert({
    where: {
      serviceRequestId_professionalId: {
        serviceRequestId: serviceRequest.id,
        professionalId: profesional.id,
      },
    },
    update: {},
    create: {
      serviceRequestId: serviceRequest.id,
      professionalId: profesional.id,
      amount: '$85.000',
      status: 'PENDING',
      message: 'Puedo visitar hoy por la tarde y resolverlo en la misma jornada.',
    },
  });

  await prisma.booking.upsert({
    where: { id: 'seed-booking-1' },
    update: {},
    create: {
      id: 'seed-booking-1',
      serviceRequestId: serviceRequest.id,
      clientId: cliente.id,
      professionalId: profesional.id,
      scheduledAt: new Date('2026-06-05T14:00:00.000Z'),
      status: 'PENDING',
      notes: 'Turno de prueba generado por seed.',
    },
  });

  await prisma.serviceRequest.update({
    where: { id: serviceRequest.id },
    data: { status: 'ASSIGNED' },
  });

  await prisma.$disconnect();
  console.log('Seed completado.');
};

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
