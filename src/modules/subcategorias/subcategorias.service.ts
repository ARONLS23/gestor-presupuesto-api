import { prisma } from '../../config/prisma.ts';
import { HttpError } from '../../middlewares/errores.ts';
import { esDuplicado } from '../../utils/prisma-errores.ts';
import type { ActualizarSubcategoriaInput, CrearSubcategoriaInput } from './subcategorias.schemas.ts';

const subcategoriaPublica = { id: true, categoriaId: true, nombre: true, activa: true };
const NOMBRE_DUPLICADO = 'Esta categoría ya tiene una subcategoría con ese nombre';

async function obtenerPropia(usuarioId: string, id: string) {
  const subcategoria = await prisma.subcategoria.findFirst({ where: { id, categoria: { usuarioId } } });
  if (!subcategoria) throw new HttpError(404, 'Subcategoría no encontrada');
  return subcategoria;
}

export const crearSubcategoria = async (usuarioId: string, { categoriaId, nombre }: CrearSubcategoriaInput) => {
  const categoria = await prisma.categoria.findFirst({ where: { id: categoriaId, usuarioId } });
  if (!categoria) throw new HttpError(404, 'Categoría no encontrada');

  try {
    return await prisma.subcategoria.create({ data: { categoriaId, nombre }, select: subcategoriaPublica });
  } catch (err) {
    if (esDuplicado(err)) throw new HttpError(409, NOMBRE_DUPLICADO);
    throw err;
  }
};

export const actualizarSubcategoria = async (usuarioId: string, id: string, datos: ActualizarSubcategoriaInput) => {
  await obtenerPropia(usuarioId, id);

  try {
    return await prisma.subcategoria.update({ where: { id }, data: datos, select: subcategoriaPublica });
  } catch (err) {
    if (esDuplicado(err)) throw new HttpError(409, NOMBRE_DUPLICADO);
    throw err;
  }
};

export const eliminarSubcategoria = async (usuarioId: string, id: string) => {
  const subcategoria = await obtenerPropia(usuarioId, id);

  if (await prisma.movimiento.count({ where: { subcategoriaId: id } })) {
    await prisma.subcategoria.update({ where: { id }, data: { activa: false } });
    return { resultado: 'desactivada' as const };
  }

  if ((await prisma.subcategoria.count({ where: { categoriaId: subcategoria.categoriaId } })) === 1) {
    throw new HttpError(409, 'La categoría debe tener al menos una subcategoría');
  }

  await prisma.subcategoria.delete({ where: { id } });
  return { resultado: 'eliminada' as const };
};
