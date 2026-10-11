const ZONA_HORARIA = 'America/Lima';

export function hoy() {
  const [anio, mes, dia] = new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA }).split('-').map(Number);
  return { anio: anio!, mes: mes!, dia: dia! };
}

export const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

export const ALCANCES = ['mensual', 'trimestral', 'anual'] as const;
export type Alcance = (typeof ALCANCES)[number];

const MESES_POR_ALCANCE: Record<Alcance, number> = { mensual: 1, trimestral: 3, anual: 12 };

export function rangoDeAlcance({ anio, mes }: { anio: number; mes: number }, alcance: Alcance) {
  const meses = MESES_POR_ALCANCE[alcance];
  const inicio = { anio, mes: Math.floor((mes - 1) / meses) * meses + 1 };
  const fin = moverMes(inicio, meses);
  return {
    inicio,
    meses,
    desde: new Date(Date.UTC(inicio.anio, inicio.mes - 1, 1)),
    hasta: new Date(Date.UTC(fin.anio, fin.mes - 1, 1)),
  };
}

export function moverMes({ anio, mes }: { anio: number; mes: number }, meses: number) {
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 };
}
