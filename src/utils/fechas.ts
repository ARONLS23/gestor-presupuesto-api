const ZONA_HORARIA = 'America/Lima';

export function hoy() {
  const [anio, mes, dia] = new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA }).split('-').map(Number);
  return { anio: anio!, mes: mes!, dia: dia! };
}

export const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

export function moverMes({ anio, mes }: { anio: number; mes: number }, meses: number) {
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 };
}
