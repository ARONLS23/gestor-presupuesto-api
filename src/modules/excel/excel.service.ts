import ExcelJS from 'exceljs';
import { reporteAnual } from '../reportes/reportes.service.ts';

type Reporte = Awaited<ReturnType<typeof reporteAnual>>;
type Totales = { meses: string[]; total: string };
type Fila = Totales & { etiquetas: string[] };

const MESES = ['Ene', 'Feb', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FORMATO_MONTO = '#,##0.00';
const PRIMARIO = 'FF00685F';
const FONDO_ENCABEZADO = 'FFEFF4FF';

const letra = (columna: number) => String.fromCharCode(64 + columna);

function titulo(hoja: ExcelJS.Worksheet, fila: number, texto: string, tamano = 18) {
  const celda = hoja.getCell(fila, 2);
  celda.value = texto;
  celda.font = { bold: true, size: tamano, color: { argb: PRIMARIO } };
}

function estiloEncabezado(fila: ExcelJS.Row, colMes: number, colAnio: number) {
  for (let c = 2; c <= colAnio; c++) {
    const celda = fila.getCell(c);
    celda.font = { bold: true, color: { argb: PRIMARIO } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FONDO_ENCABEZADO } };
    celda.border = { bottom: { style: 'thin', color: { argb: PRIMARIO } } };
    if (c >= colMes) celda.alignment = { horizontal: 'right' };
  }
}

function estiloTotal(fila: ExcelJS.Row, colAnio: number) {
  for (let c = 2; c <= colAnio; c++) {
    const celda = fila.getCell(c);
    celda.font = { bold: true };
    celda.border = { top: { style: 'thin', color: { argb: PRIMARIO } } };
  }
}

// Escribe encabezado, filas con columna Año y fila Total; devuelve el número de la fila Total.
function escribirTabla(hoja: ExcelJS.Worksheet, inicio: number, columnas: string[], filas: Fila[], totales: Totales) {
  const colMes = 2 + columnas.length;
  const colAnio = colMes + 12;
  const sumaFila = (n: number, total: string) => ({
    formula: `SUM(${letra(colMes)}${n}:${letra(colMes + 11)}${n})`,
    result: Number(total),
  });

  const encabezado = hoja.getRow(inicio);
  [...columnas, ...MESES, 'Año'].forEach((texto, i) => (encabezado.getCell(2 + i).value = texto));
  estiloEncabezado(encabezado, colMes, colAnio);

  filas.forEach((f, i) => {
    const n = inicio + 1 + i;
    const fila = hoja.getRow(n);
    f.etiquetas.forEach((texto, j) => (fila.getCell(2 + j).value = texto));
    f.meses.forEach((v, m) => (fila.getCell(colMes + m).value = Number(v)));
    fila.getCell(colAnio).value = sumaFila(n, f.total);
  });

  const filaTotal = inicio + filas.length + 1;
  const total = hoja.getRow(filaTotal);
  total.getCell(2).value = 'Total';
  totales.meses.forEach((v, m) => {
    const col = letra(colMes + m);
    total.getCell(colMes + m).value = filas.length
      ? { formula: `SUM(${col}${inicio + 1}:${col}${filaTotal - 1})`, result: Number(v) }
      : 0;
  });
  total.getCell(colAnio).value = sumaFila(filaTotal, totales.total);
  estiloTotal(total, colAnio);

  for (let n = inicio + 1; n <= filaTotal; n++) {
    for (let c = colMes; c <= colAnio; c++) hoja.getCell(n, c).numFmt = FORMATO_MONTO;
  }
  return filaTotal;
}

function hojaGasto(hoja: ExcelJS.Worksheet, reporte: Reporte) {
  hoja.columns = [{ width: 2.7 }, { width: 22 }, { width: 22 }, ...MESES.map(() => ({ width: 12.5 })), { width: 14 }];
  titulo(hoja, 1, `Presupuesto personal ${reporte.anio}`);

  const tabla = (tipo: 'GASTO' | 'AHORRO', inicio: number) => {
    const seccion = reporte.secciones.find((s) => s.tipo === tipo)!;
    titulo(hoja, inicio, seccion.nombre, 14);
    const filas = seccion.categorias.flatMap((c) => c.subcategorias.map((s) => ({ ...s, etiquetas: [c.nombre, s.nombre] })));
    return escribirTabla(hoja, inicio + 1, ['Categoría', 'Subcategoría'], filas, seccion.totales);
  };

  const totalGastos = tabla('GASTO', 2);
  const totalAhorro = tabla('AHORRO', totalGastos + 2);
  return { totalGastos, totalAhorro };
}

function hojaResumen(hoja: ExcelJS.Worksheet, reporte: Reporte, gasto: { totalGastos: number; totalAhorro: number }) {
  hoja.columns = [{ width: 2.7 }, { width: 34 }, ...MESES.map(() => ({ width: 12.5 })), { width: 14 }];
  titulo(hoja, 1, `Presupuesto personal ${reporte.anio}`);

  const ingresos = reporte.secciones.find((s) => s.tipo === 'INGRESO')!;
  titulo(hoja, 7, ingresos.nombre, 14);
  const filas = ingresos.categorias.map((c) => ({ ...c, etiquetas: [c.nombre] }));
  const totalIngresos = escribirTabla(hoja, 8, ['Categoría'], filas, ingresos.totales);

  const encabezado = hoja.getRow(2);
  [...MESES, 'Año'].forEach((texto, i) => (encabezado.getCell(3 + i).value = texto));
  estiloEncabezado(encabezado, 3, 15);

  const valor = (tipo: 'GASTO' | 'AHORRO') => reporte.secciones.find((s) => s.tipo === tipo)!.totales;
  const resumen = [
    { nombre: 'Gastos totales', valores: valor('GASTO'), formula: (m: number) => `Gasto!${letra(4 + m)}${gasto.totalGastos}` },
    { nombre: 'Ahorro total', valores: valor('AHORRO'), formula: (m: number) => `Gasto!${letra(4 + m)}${gasto.totalAhorro}` },
    { nombre: 'Efectivo libre', valores: reporte.efectivoNeto, formula: (m: number) => `${letra(3 + m)}${totalIngresos}-${letra(3 + m)}3-${letra(3 + m)}4` },
  ];

  resumen.forEach(({ nombre, valores, formula }, i) => {
    const n = 3 + i;
    const fila = hoja.getRow(n);
    fila.getCell(2).value = nombre;
    valores.meses.forEach((v, m) => {
      fila.getCell(3 + m).value = { formula: formula(m), result: Number(v) };
    });
    fila.getCell(15).value = { formula: `SUM(C${n}:N${n})`, result: Number(valores.total) };
    for (let c = 3; c <= 15; c++) fila.getCell(c).numFmt = FORMATO_MONTO;
  });
  estiloTotal(hoja.getRow(5), 15);
}

export async function exportarAnual(usuarioId: string, anio: number) {
  const reporte = await reporteAnual(usuarioId, anio);

  const libro = new ExcelJS.Workbook();
  const vista = { showGridLines: false };
  const resumen = libro.addWorksheet('Resumen', { views: [vista] });
  const gasto = libro.addWorksheet('Gasto', { views: [vista] });

  hojaResumen(resumen, reporte, hojaGasto(gasto, reporte));

  return Buffer.from(await libro.xlsx.writeBuffer());
}
