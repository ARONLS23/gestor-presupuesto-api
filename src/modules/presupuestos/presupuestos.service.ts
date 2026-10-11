import { Prisma } from '../../../generated/prisma/client.ts';
import { prisma } from '../../config/prisma.ts';
import { HttpError } from '../../middlewares/errores.ts';
import type { Periodo } from '../../utils/esquemas.ts';
import { diasDelMes, hoy, moverMes } from '../../utils/fechas.ts';
import { filtroMovimientos } from '../movimientos/movimientos.service.ts';
import type { GuardarPresupuestosInput } from './presupuestos.schemas.ts';

export type EstadoPresupuesto = 'SIN_LIMITE' | 'EN_RANGO' | 'ATENCION' | 'CERCA_LIMITE' | 'EXCEDIDO';

function estado(porcentaje: number | null): EstadoPresupuesto {
  if (porcentaje === null) return 'SIN_LIMITE';
  if (porcentaje > 100) return 'EXCEDIDO';
  if (porcentaje >= 90) return 'CERCA_LIMITE';
  if (porcentaje >= 75) return 'ATENCION';
  return 'EN_RANGO';
}

const porcentaje = (parte: Prisma.Decimal, total: Prisma.Decimal) =>
  total.isZero() ? null : Number(parte.div(total).times(100).toFixed(1));

function ritmo({ anio, mes }: Periodo) {
  const actual = hoy();
  const dias = diasDelMes(anio, mes);
  const comparacion = Math.sign(anio * 12 + mes - (actual.anio * 12 + actual.mes));
  const transcurridos = comparacion < 0 ? dias : comparacion > 0 ? 0 : actual.dia;

  return {
    diasMes: dias,
    diasTranscurridos: transcurridos,
    diasRestantes: comparacion < 0 ? 0 : comparacion > 0 ? dias : dias - actual.dia + 1,
    porcentajeMes: Number(((transcurridos / dias) * 100).toFixed(1)),
    esMesActual: comparacion === 0,
  };
}

export const listarPresupuestos = async (usuarioId: string, periodo: Periodo) => {
  const [categorias, presupuestos, gastos] = await Promise.all([
    prisma.categoria.findMany({
      where: { usuarioId, tipo: 'GASTO' },
      orderBy: { orden: 'asc' },
      include: { subcategorias: { orderBy: { nombre: 'asc' } } },
    }),
    prisma.presupuesto.findMany({ where: { usuarioId, anio: periodo.anio, mes: periodo.mes } }),
    prisma.movimiento.groupBy({
      by: ['subcategoriaId'],
      where: filtroMovimientos(usuarioId, { ...periodo, tipo: 'GASTO' }),
      _sum: { monto: true },
    }),
  ]);

  const tiempo = ritmo(periodo);
  const cero = new Prisma.Decimal(0);
  const gastoDe = (subcategoriaId: string) => gastos.find((g) => g.subcategoriaId === subcategoriaId)?._sum.monto ?? cero;
  let presupuestado = cero;
  let gastadoConLimite = cero;
  let gastadoSinLimite = cero;

  const filas = categorias
    .map((c) => {
      const subcategorias = c.subcategorias.map((s) => ({ id: s.id, nombre: s.nombre, gastado: gastoDe(s.id) }));
      const gastado = subcategorias.reduce((suma, s) => suma.plus(s.gastado), cero);
      const limite = presupuestos.find((p) => p.categoriaId === c.id)?.limite ?? null;
      return { c, subcategorias, gastado, limite };
    })
    .filter(({ c, gastado, limite }) => c.activa || !gastado.isZero() || limite)
    .map(({ c, subcategorias, gastado, limite }) => {
      const disponible = limite ? limite.minus(gastado) : null;
      const pct = limite ? porcentaje(gastado, limite) : null;

      if (limite) {
        presupuestado = presupuestado.plus(limite);
        gastadoConLimite = gastadoConLimite.plus(gastado);
      } else {
        gastadoSinLimite = gastadoSinLimite.plus(gastado);
      }

      return {
        categoriaId: c.id,
        nombre: c.nombre,
        icono: c.icono,
        color: c.color,
        activa: c.activa,
        limite: limite?.toFixed(2) ?? null,
        gastado: gastado.toFixed(2),
        disponible: disponible?.toFixed(2) ?? null,
        porcentaje: pct,
        estado: estado(pct),
        cupoDiario:
          tiempo.esMesActual && disponible && disponible.greaterThan(0) && tiempo.diasRestantes > 0
            ? disponible.div(tiempo.diasRestantes).toFixed(2)
            : null,
        subcategorias: subcategorias
          .filter((s) => !s.gastado.isZero() || c.subcategorias.find((x) => x.id === s.id)?.activa)
          .map((s) => ({ ...s, gastado: s.gastado.toFixed(2) })),
      };
    });

  const porcentajeTotal = porcentaje(gastadoConLimite, presupuestado);

  return {
    ...periodo,
    ritmo: tiempo,
    resumen: {
      presupuestado: presupuestado.toFixed(2),
      gastado: gastadoConLimite.toFixed(2),
      disponible: presupuestado.minus(gastadoConLimite).toFixed(2),
      porcentaje: porcentajeTotal,
      estado: estado(porcentajeTotal),
      gastoSinPresupuesto: gastadoSinLimite.toFixed(2),
      gastadoTotal: gastadoConLimite.plus(gastadoSinLimite).toFixed(2),
    },
    categorias: filas,
  };
};

async function validarCategorias(usuarioId: string, ids: string[]) {
  const unicos = [...new Set(ids)];
  const propias = await prisma.categoria.count({ where: { id: { in: unicos }, usuarioId, tipo: 'GASTO' } });
  if (propias !== unicos.length) throw new HttpError(400, 'Solo puedes presupuestar tus categorías de gasto');
}

const upsertLimite = (usuarioId: string, { anio, mes }: Periodo, categoriaId: string, limite: string | Prisma.Decimal) =>
  prisma.presupuesto.upsert({
    where: { usuarioId_categoriaId_anio_mes: { usuarioId, categoriaId, anio, mes } },
    create: { usuarioId, categoriaId, anio, mes, limite },
    update: { limite },
  });

export const guardarPresupuestos = async (usuarioId: string, { limites, ...periodo }: GuardarPresupuestosInput) => {
  await validarCategorias(usuarioId, limites.map((l) => l.categoriaId));

  await prisma.$transaction(
    limites.map(({ categoriaId, limite }) =>
      limite === null
        ? prisma.presupuesto.deleteMany({ where: { usuarioId, categoriaId, anio: periodo.anio, mes: periodo.mes } })
        : upsertLimite(usuarioId, periodo, categoriaId, limite),
    ),
  );
  return listarPresupuestos(usuarioId, periodo);
};

export const copiarPresupuestoAnterior = async (usuarioId: string, periodo: Periodo) => {
  const anterior = moverMes(periodo, -1);
  const previos = await prisma.presupuesto.findMany({ where: { usuarioId, ...anterior } });
  if (!previos.length) throw new HttpError(404, 'El mes anterior no tiene presupuesto');

  await prisma.$transaction(previos.map((p) => upsertLimite(usuarioId, periodo, p.categoriaId, p.limite)));
  return listarPresupuestos(usuarioId, periodo);
};
