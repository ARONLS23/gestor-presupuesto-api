import type { Prisma } from '../../../generated/prisma/client.ts';
import { prisma } from '../../config/prisma.ts';
import { HttpError } from '../../middlewares/errores.ts';
import { esDuplicado } from '../../utils/prisma-errores.ts';
import type { ActualizarCategoriaInput, CrearCategoriaInput } from './categorias.schemas.ts';

const categoriaPublica = {
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
} satisfies Prisma.CategoriaSelect;

const NOMBRE_DUPLICADO = 'Ya tienes una categoría de ese tipo con ese nombre';

export const listarCategorias = (usuarioId: string) =>
  prisma.categoria.findMany({
    where: { usuarioId },
    orderBy: { orden: 'asc' },
    select: categoriaPublica,
  });

async function obtenerPropia(usuarioId: string, id: string) {
  const categoria = await prisma.categoria.findFirst({ where: { id, usuarioId } });
  if (!categoria) throw new HttpError(404, 'Categoría no encontrada');
  return categoria;
}

export const crearCategoria = async (usuarioId: string, { subcategorias, ...datos }: CrearCategoriaInput) => {
  const { _max } = await prisma.categoria.aggregate({ where: { usuarioId }, _max: { orden: true } });

  try {
    return await prisma.categoria.create({
      data: {
        ...datos,
        usuarioId,
        orden: (_max.orden ?? -1) + 1,
        subcategorias: { create: (subcategorias ?? ['General']).map((nombre) => ({ nombre })) },
      },
      select: categoriaPublica,
    });
  } catch (err) {
    if (esDuplicado(err)) throw new HttpError(409, NOMBRE_DUPLICADO);
    throw err;
  }
};

export const actualizarCategoria = async (usuarioId: string, id: string, datos: ActualizarCategoriaInput) => {
  await obtenerPropia(usuarioId, id);

  try {
    return await prisma.categoria.update({ where: { id }, data: datos, select: categoriaPublica });
  } catch (err) {
    if (esDuplicado(err)) throw new HttpError(409, NOMBRE_DUPLICADO);
    throw err;
  }
};

export const eliminarCategoria = async (usuarioId: string, id: string) => {
  await obtenerPropia(usuarioId, id);

  const movimientos = await prisma.movimiento.count({ where: { subcategoria: { categoriaId: id } } });
  if (movimientos) {
    await prisma.categoria.update({ where: { id }, data: { activa: false } });
    return { resultado: 'desactivada' as const };
  }

  await prisma.$transaction([
    prisma.presupuesto.deleteMany({ where: { categoriaId: id } }),
    prisma.subcategoria.deleteMany({ where: { categoriaId: id } }),
    prisma.categoria.delete({ where: { id } }),
  ]);
  return { resultado: 'eliminada' as const };
};
