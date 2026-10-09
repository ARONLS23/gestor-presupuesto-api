import { prisma } from '../../config/prisma.ts';

export const listarCategorias = (usuarioId: string) =>
  prisma.categoria.findMany({
    where: { usuarioId },
    orderBy: { orden: 'asc' },
    select: {
      id: true,
      nombre: true,
      tipo: true,
      color: true,
      icono: true,
      orden: true,
      activa: true,
      subcategorias: {
        select: { id: true, nombre: true, activa: true },
        orderBy: { nombre: 'asc' },
      },
    },
  });
