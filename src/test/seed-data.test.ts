import { describe, expect, it } from 'vitest';

import { buildSeedUserUpsertArgs, seedUsers } from '../../prisma/seed-data.js';

describe('seed demo data', () => {
  it('actualiza los usuarios demo cuando el seed se vuelve a ejecutar', () => {
    const passwordHash = 'hashed-password';

    const args = buildSeedUserUpsertArgs(seedUsers.profesional, passwordHash);

    expect(args.where).toEqual({ email: 'pro@arreglaya.com' });
    expect(args.update).toMatchObject({
      passwordHash,
      fullName: 'Carlos Mendoza',
      role: 'PROFESIONAL',
      city: 'Buenos Aires',
      zone: 'Almagro',
    });
    expect(args.create).toMatchObject(args.update);
  });
});
