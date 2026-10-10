import { Prisma, type TipoMovimiento } from '../../../generated/prisma/client.ts';
import { prisma } from '../../config/prisma.ts';

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
