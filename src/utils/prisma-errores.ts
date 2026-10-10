import { Prisma } from '../../generated/prisma/client.ts';

export const esDuplicado = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
