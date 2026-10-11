import { Prisma, type TipoMovimiento } from '../../../generated/prisma/client.ts';
import { prisma } from '../../config/prisma.ts';
import type { Periodo } from '../../utils/esquemas.ts';
import { hoy, moverMes, rangoDeAlcance, type Alcance } from '../../utils/fechas.ts';
import { filtroMovimientos, totalesEnRango } from '../movimientos/movimientos.service.ts';

type Fila = { meses: Prisma.Decimal[]; total: Prisma.Decimal };

const SECCIONES: { tipo: TipoMovimiento; nombre: string }[] = [
  { tipo: 'INGRESO', nombre: 'Ingresos' },
  { tipo: 'GASTO', nombre: 'Gastos' },
  { tipo: 'AHORRO', nombre: 'Ahorro' },
];

const cero = () => new Prisma.Decimal(0);
const filaVacia = (): Fila => ({ meses: Array.from({ length: 12 }, cero), total: cero() });

function sumar(destino: Fila, origen: Fila, signo = 1) {
  origen.meses.forEach((v, i) => (destino.meses[i] = destino.meses[i]!.plus(v.times(signo))));
  destino.total = destino.total.plus(origen.total.times(signo));
}

const aRespuesta = ({ meses, total }: Fila) => ({ meses: meses.map((v) => v.toFixed(2)), total: total.toFixed(2) });

export const reporteAnual = async (usuarioId: string, anio: number) => {
  const desde = new Date(Date.UTC(anio, 0, 1));
  const hasta = new Date(Date.UTC(anio + 1, 0, 1));

  const [sumas, categorias] = await Promise.all([
    prisma.$queryRaw<{ subcategoriaId: string; mes: number; total: Prisma.Decimal }[]>`
      SELECT "subcategoriaId", EXTRACT(MONTH FROM date_trunc('month', "fecha"))::int AS mes, SUM("monto") AS total
      FROM "Movimiento"
      WHERE "usuarioId" = ${usuarioId} AND "fecha" >= ${desde} AND "fecha" < ${hasta}
      GROUP BY "subcategoriaId", date_trunc('month', "fecha")`,
    prisma.categoria.findMany({
      where: { usuarioId },
      orderBy: { orden: 'asc' },
      include: { subcategorias: { orderBy: { nombre: 'asc' } } },
    }),
  ]);

  const porSubcategoria = new Map<string, Fila>();
  for (const { subcategoriaId, mes, total } of sumas) {
    const fila = porSubcategoria.get(subcategoriaId) ?? filaVacia();
    const monto = new Prisma.Decimal(total);
    fila.meses[mes - 1] = fila.meses[mes - 1]!.plus(monto);
    fila.total = fila.total.plus(monto);
    porSubcategoria.set(subcategoriaId, fila);
  }

  const efectivoNeto = filaVacia();

  const secciones = SECCIONES.map(({ tipo, nombre }) => {
    const totales = filaVacia();

    const filas = categorias
      .filter((c) => c.tipo === tipo)
      .map((c) => {
        const totalCategoria = filaVacia();
        const subcategorias = c.subcategorias
          .map((s) => ({ s, fila: porSubcategoria.get(s.id) }))
          .filter(({ s, fila }) => s.activa || fila)
          .map(({ s, fila }) => {
            const valores = fila ?? filaVacia();
            sumar(totalCategoria, valores);
            return { id: s.id, nombre: s.nombre, ...aRespuesta(valores) };
          });
        return { c, totalCategoria, subcategorias };
      })
      .filter(({ c, totalCategoria }) => c.activa || !totalCategoria.total.isZero())
      .map(({ c, totalCategoria, subcategorias }) => {
        sumar(totales, totalCategoria);
        return {
          id: c.id,
          nombre: c.nombre,
          icono: c.icono,
          color: c.color,
          activa: c.activa,
          ...aRespuesta(totalCategoria),
          subcategorias,
        };
      });

    sumar(efectivoNeto, totales, tipo === 'INGRESO' ? 1 : -1);
    return { tipo, nombre, categorias: filas, totales: aRespuesta(totales) };
  });

  return { anio, secciones, efectivoNeto: aRespuesta(efectivoNeto) };
};

const variacion = (actual: string, anterior: string) => {
  const previo = new Prisma.Decimal(anterior);
  return previo.isZero() ? null : Number(new Prisma.Decimal(actual).minus(previo).div(previo).times(100).toFixed(1));
};

export const kpis = async (usuarioId: string, periodo: Periodo, alcance: Alcance) => {
  const rango = rangoDeAlcance(periodo, alcance);
  const anterior = rangoDeAlcance(moverMes(rango.inicio, -rango.meses), alcance);
  const [actual, previo] = await Promise.all([
    totalesEnRango(usuarioId, rango.desde, rango.hasta),
    totalesEnRango(usuarioId, anterior.desde, anterior.hasta),
  ]);

  return {
    alcance,
    inicio: rango.inicio,
    meses: rango.meses,
    totales: { ingresos: actual.ingresos, gastos: actual.gastos, ahorro: actual.ahorro, efectivoLibre: actual.balance },
    variacion: {
      ingresos: variacion(actual.ingresos, previo.ingresos),
      gastos: variacion(actual.gastos, previo.gastos),
      ahorro: variacion(actual.ahorro, previo.ahorro),
      efectivoLibre: variacion(actual.balance, previo.balance),
    },
  };
};

export const resumenMensual = async (usuarioId: string, periodo: Periodo) => {
  const [{ totales, variacion }, categorias, sumas] = await Promise.all([
    kpis(usuarioId, periodo, 'mensual'),
    prisma.categoria.findMany({ where: { usuarioId }, include: { subcategorias: { select: { id: true } } } }),
    prisma.movimiento.groupBy({ by: ['subcategoriaId'], where: filtroMovimientos(usuarioId, periodo), _sum: { monto: true } }),
  ]);

  const desglose = (tipo: TipoMovimiento, total: string) =>
    categorias
      .filter((c) => c.tipo === tipo)
      .map((c) => ({
        c,
        monto: c.subcategorias.reduce(
          (suma, s) => suma.plus(sumas.find((x) => x.subcategoriaId === s.id)?._sum.monto ?? 0),
          cero(),
        ),
      }))
      .filter(({ monto }) => !monto.isZero())
      .sort((a, b) => b.monto.comparedTo(a.monto))
      .map(({ c, monto }) => ({
        categoriaId: c.id,
        nombre: c.nombre,
        icono: c.icono,
        color: c.color,
        monto: monto.toFixed(2),
        porcentaje: Number(monto.div(total).times(100).toFixed(1)),
      }));

  return {
    ...periodo,
    totales,
    variacion,
    desglose: {
      ingresos: desglose('INGRESO', totales.ingresos),
      gastos: desglose('GASTO', totales.gastos),
    },
  };
};

export const historico = async (usuarioId: string, { meses, ...periodo }: Periodo & { meses: number }) => {
  const inicio = moverMes(periodo, -(meses - 1));
  const desde = new Date(Date.UTC(inicio.anio, inicio.mes - 1, 1));
  const hasta = new Date(Date.UTC(periodo.anio, periodo.mes, 1));

  const sumas = await prisma.$queryRaw<{ anio: number; mes: number; tipo: TipoMovimiento; total: Prisma.Decimal }[]>`
    SELECT EXTRACT(YEAR FROM "fecha")::int AS anio, EXTRACT(MONTH FROM "fecha")::int AS mes, "tipo", SUM("monto") AS total
    FROM "Movimiento"
    WHERE "usuarioId" = ${usuarioId} AND "fecha" >= ${desde} AND "fecha" < ${hasta}
    GROUP BY 1, 2, 3`;

  let ahorroTotal = cero();
  const filas = Array.from({ length: meses }, (_, i) => {
    const p = moverMes(inicio, i);
    const suma = (tipo: TipoMovimiento) =>
      new Prisma.Decimal(sumas.find((s) => s.anio === p.anio && s.mes === p.mes && s.tipo === tipo)?.total ?? 0);
    const [ingresos, gastos, ahorro] = [suma('INGRESO'), suma('GASTO'), suma('AHORRO')];
    ahorroTotal = ahorroTotal.plus(ahorro);
    return {
      ...p,
      ingresos: ingresos.toFixed(2),
      gastos: gastos.toFixed(2),
      ahorro: ahorro.toFixed(2),
      efectivoLibre: ingresos.minus(gastos).minus(ahorro).toFixed(2),
    };
  });

  return { meses: filas, promedioAhorro: ahorroTotal.div(meses).toFixed(2) };
};

export const saldo = async (usuarioId: string) => {
  const { anio, mes, dia } = hoy();
  const { balance } = await totalesEnRango(usuarioId, new Date(0), new Date(Date.UTC(anio, mes - 1, dia + 1)));
  return { saldo: balance };
};
