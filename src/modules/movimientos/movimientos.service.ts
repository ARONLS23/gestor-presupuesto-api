import { Prisma } from '../../../generated/prisma/client.ts';
import { prisma } from '../../config/prisma.ts';
import { HttpError } from '../../middlewares/errores.ts';
import type {
  ActualizarMovimientoInput,
  CrearMovimientoInput,
  FiltrosMovimientos,
  FiltrosTotales,
} from './movimientos.schemas.ts';

const movimientoPublico = {
  id: true,
  tipo: true,
  fecha: true,
  descripcion: true,
  comercio: true,
  cuenta: true,
  monto: true,
  notas: true,
  subcategoria: {
    select: {
      id: true,
      nombre: true,
      categoria: { select: { id: true, nombre: true, icono: true, color: true } },
    },
  },
} satisfies Prisma.MovimientoSelect;

type MovimientoDb = Prisma.MovimientoGetPayload<{ select: typeof movimientoPublico }>;

const aRespuesta = (m: MovimientoDb) => ({
  ...m,
  fecha: m.fecha.toISOString().slice(0, 10),
  monto: m.monto.toFixed(2),
});

const aFecha = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

const ordenes: Record<FiltrosMovimientos['orden'], Prisma.MovimientoOrderByWithRelationInput[]> = {
  fecha_desc: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
  fecha_asc: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
  monto_desc: [{ monto: 'desc' }, { fecha: 'desc' }],
  monto_asc: [{ monto: 'asc' }, { fecha: 'desc' }],
};

export function filtroMovimientos(usuarioId: string, { anio, mes, tipo, categoriaId, q }: FiltrosTotales) {
  const where: Prisma.MovimientoWhereInput = { usuarioId, tipo };

  if (anio) {
    where.fecha = mes
      ? { gte: new Date(Date.UTC(anio, mes - 1, 1)), lt: new Date(Date.UTC(anio, mes, 1)) }
      : { gte: new Date(Date.UTC(anio, 0, 1)), lt: new Date(Date.UTC(anio + 1, 0, 1)) };
  }
  if (categoriaId) where.subcategoria = { categoriaId };
  if (q) {
    where.OR = [
      { descripcion: { contains: q, mode: 'insensitive' } },
      { comercio: { contains: q, mode: 'insensitive' } },
      { notas: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export const listarMovimientos = async (usuarioId: string, filtros: FiltrosMovimientos) => {
  const where = filtroMovimientos(usuarioId, filtros);
  const { page, size } = filtros;

  const [items, total] = await prisma.$transaction([
    prisma.movimiento.findMany({
      where,
      orderBy: ordenes[filtros.orden],
      skip: (page - 1) * size,
      take: size,
      select: movimientoPublico,
    }),
    prisma.movimiento.count({ where }),
  ]);

  return { items: items.map(aRespuesta), total, page, size, paginas: Math.ceil(total / size) };
};

export const totalesMovimientos = (usuarioId: string, filtros: FiltrosTotales) =>
  totalesDe(filtroMovimientos(usuarioId, filtros));

export const totalesEnRango = (usuarioId: string, desde: Date, hasta: Date) =>
  totalesDe({ usuarioId, fecha: { gte: desde, lt: hasta } });

async function totalesDe(where: Prisma.MovimientoWhereInput) {
  const grupos = await prisma.movimiento.groupBy({
    by: ['tipo'],
    where,
    _sum: { monto: true },
    _count: true,
  });

  const porTipo = (tipo: 'INGRESO' | 'GASTO' | 'AHORRO') => grupos.find((g) => g.tipo === tipo);
  const suma = (tipo: 'INGRESO' | 'GASTO' | 'AHORRO') => porTipo(tipo)?._sum.monto ?? new Prisma.Decimal(0);
  const cantidad = (tipo: 'INGRESO' | 'GASTO' | 'AHORRO') => porTipo(tipo)?._count ?? 0;

  const ingresos = suma('INGRESO');
  const gastos = suma('GASTO');
  const ahorro = suma('AHORRO');

  return {
    ingresos: ingresos.toFixed(2),
    gastos: gastos.toFixed(2),
    ahorro: ahorro.toFixed(2),
    balance: ingresos.minus(gastos).minus(ahorro).toFixed(2),
    cantidad: {
      INGRESO: cantidad('INGRESO'),
      GASTO: cantidad('GASTO'),
      AHORRO: cantidad('AHORRO'),
      total: cantidad('INGRESO') + cantidad('GASTO') + cantidad('AHORRO'),
    },
  };
}

async function obtenerPropio(usuarioId: string, id: string) {
  const movimiento = await prisma.movimiento.findFirst({ where: { id, usuarioId }, select: movimientoPublico });
  if (!movimiento) throw new HttpError(404, 'Movimiento no encontrado');
  return movimiento;
}

async function subcategoriaParaMovimiento(usuarioId: string, subcategoriaId: string) {
  const subcategoria = await prisma.subcategoria.findFirst({
    where: { id: subcategoriaId, categoria: { usuarioId } },
    include: { categoria: true },
  });
  if (!subcategoria) throw new HttpError(404, 'Subcategoría no encontrada');
  if (!subcategoria.activa || !subcategoria.categoria.activa) {
    throw new HttpError(400, 'La categoría o subcategoría está desactivada');
  }
  return subcategoria;
}

export const obtenerMovimiento = async (usuarioId: string, id: string) => aRespuesta(await obtenerPropio(usuarioId, id));

export const crearMovimiento = async (usuarioId: string, { fecha, ...datos }: CrearMovimientoInput) => {
  const subcategoria = await subcategoriaParaMovimiento(usuarioId, datos.subcategoriaId);

  const movimiento = await prisma.movimiento.create({
    data: { ...datos, usuarioId, tipo: subcategoria.categoria.tipo, fecha: aFecha(fecha) },
    select: movimientoPublico,
  });
  return aRespuesta(movimiento);
};

export const actualizarMovimiento = async (
  usuarioId: string,
  id: string,
  { fecha, ...datos }: ActualizarMovimientoInput,
) => {
  const actual = await obtenerPropio(usuarioId, id);

  const data: Prisma.MovimientoUncheckedUpdateInput = { ...datos };
  if (fecha) data.fecha = aFecha(fecha);
  if (datos.subcategoriaId && datos.subcategoriaId !== actual.subcategoria.id) {
    data.tipo = (await subcategoriaParaMovimiento(usuarioId, datos.subcategoriaId)).categoria.tipo;
  }

  const movimiento = await prisma.movimiento.update({ where: { id }, data, select: movimientoPublico });
  return aRespuesta(movimiento);
};

export const eliminarMovimiento = async (usuarioId: string, id: string) => {
  await obtenerPropio(usuarioId, id);
  await prisma.movimiento.delete({ where: { id } });
  return { resultado: 'eliminado' as const };
};
