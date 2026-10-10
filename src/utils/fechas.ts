const ZONA_HORARIA = 'America/Lima';

export function hoy() {
  const [anio, mes, dia] = new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA }).split('-').map(Number);
  return { anio: anio!, mes: mes!, dia: dia! };
}

export const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
