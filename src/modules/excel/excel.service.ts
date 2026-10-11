import ExcelJS from 'exceljs';
import { Prisma, type TipoMovimiento } from '../../../generated/prisma/client.ts';
import { prisma } from '../../config/prisma.ts';
import type { Periodo } from '../../utils/esquemas.ts';
import { rangoDeAlcance, type Alcance } from '../../utils/fechas.ts';
import type { FiltrosExportar } from '../movimientos/movimientos.schemas.ts';
import { todosLosMovimientos, totalesMovimientos } from '../movimientos/movimientos.service.ts';
import { reporteAnual } from '../reportes/reportes.service.ts';

type Reporte = Awaited<ReturnType<typeof reporteAnual>>;
type Totales = { meses: string[]; total: string };
type Fila = Totales & { etiquetas: string[] };
// Meses (0–11) que lleva el archivo, encabezado de la columna total (si tiene) y si va sin montos.
type Rango = { meses: number[]; total: string | null; vacia: boolean };

export const MESES = ['Ene', 'Feb', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FORMATO_MONTO = '#,##0.00';
const PRIMARIO = 'FF00685F';
const FONDO_ENCABEZADO = 'FFEFF4FF';
const TEXTO_SECUNDARIO = 'FF6D7A77';
const COLUMNA_TOTAL: Record<Alcance, string | null> = { anual: 'Año', trimestral: 'Total', mensual: null };

const letra = (columna: number) => String.fromCharCode(64 + columna);

const nombreMes = (anio: number, mes: number) => {
  const nombre = new Date(Date.UTC(anio, mes - 1)).toLocaleDateString('es-PE', { month: 'long', timeZone: 'UTC' });
  return `${nombre[0]!.toUpperCase()}${nombre.slice(1)}`;
};

function nuevoLibro() {
  const libro = new ExcelJS.Workbook();
  libro.calcProperties.fullCalcOnLoad = true;
  return libro;
}

function titulo(hoja: ExcelJS.Worksheet, fila: number, texto: string, tamano = 18) {
  const celda = hoja.getCell(fila, 2);
  celda.value = texto;
  celda.font = { bold: true, size: tamano, color: { argb: PRIMARIO } };
}

function estiloEncabezado(fila: ExcelJS.Row, colMes: number, colFin: number) {
  for (let c = 2; c <= colFin; c++) {
    const celda = fila.getCell(c);
    celda.font = { bold: true, color: { argb: PRIMARIO } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FONDO_ENCABEZADO } };
    celda.border = { bottom: { style: 'thin', color: { argb: PRIMARIO } } };
    if (c >= colMes) celda.alignment = { horizontal: 'right' };
  }
}

function estiloTotal(fila: ExcelJS.Row, hasta: number, desde = 2) {
  for (let c = desde; c <= hasta; c++) {
    const celda = fila.getCell(c);
    celda.font = { bold: true };
    celda.border = { top: { style: 'thin', color: { argb: PRIMARIO } } };
  }
}

function recortar({ meses }: Totales, rango: Rango): Totales {
  const valores = rango.meses.map((m) => (rango.vacia ? '0' : meses[m]!));
  return { meses: valores, total: valores.reduce((t, v) => t.plus(v), new Prisma.Decimal(0)).toFixed(2) };
}

const encabezadosMes = (rango: Rango) => [...rango.meses.map((m) => MESES[m]!), ...(rango.total ? [rango.total] : [])];

// Escribe encabezado, filas (con columna total si corresponde) y fila Total; devuelve el número de la fila Total.
function escribirTabla(hoja: ExcelJS.Worksheet, inicio: number, columnas: string[], filas: Fila[], totales: Totales, rango: Rango) {
  const colMes = 2 + columnas.length;
  const colUltimoMes = colMes + rango.meses.length - 1;
  const colFin = rango.total ? colUltimoMes + 1 : colUltimoMes;
  const sumaFila = (n: number, total: string) => ({
    formula: `SUM(${letra(colMes)}${n}:${letra(colUltimoMes)}${n})`,
    result: Number(total),
  });

  const encabezado = hoja.getRow(inicio);
  [...columnas, ...encabezadosMes(rango)].forEach((texto, i) => (encabezado.getCell(2 + i).value = texto));
  estiloEncabezado(encabezado, colMes, colFin);

  filas.forEach((f, i) => {
    const n = inicio + 1 + i;
    const fila = hoja.getRow(n);
    const valores = recortar(f, rango);
    f.etiquetas.forEach((texto, j) => (fila.getCell(2 + j).value = texto));
    valores.meses.forEach((v, m) => (fila.getCell(colMes + m).value = rango.vacia ? null : Number(v)));
    if (rango.total) fila.getCell(colFin).value = sumaFila(n, valores.total);
  });

  const filaTotal = inicio + filas.length + 1;
  const total = hoja.getRow(filaTotal);
  const suma = recortar(totales, rango);
  total.getCell(2).value = 'Total';
  suma.meses.forEach((v, m) => {
    const col = letra(colMes + m);
    total.getCell(colMes + m).value = filas.length
      ? { formula: `SUM(${col}${inicio + 1}:${col}${filaTotal - 1})`, result: Number(v) }
      : 0;
  });
  if (rango.total) total.getCell(colFin).value = sumaFila(filaTotal, suma.total);
  estiloTotal(total, colFin);

  for (let n = inicio + 1; n <= filaTotal; n++) {
    for (let c = colMes; c <= colFin; c++) hoja.getCell(n, c).numFmt = FORMATO_MONTO;
  }
  return filaTotal;
}

const COLUMNAS_TABLA = ['Categoría', 'Subcategoría'];
// Los meses empiezan después de las columnas Categoría y Subcategoría (columna D) en ambas hojas.
const COL_PRIMER_MES = 2 + COLUMNAS_TABLA.length;

const filasPorSubcategoria = (seccion: Reporte['secciones'][number]) =>
  seccion.categorias.flatMap((c) => c.subcategorias.map((s) => ({ ...s, etiquetas: [c.nombre, s.nombre] })));

const anchosMatriz = (rango: Rango) => [{ width: 2.7 }, { width: 22 }, { width: 22 }, ...encabezadosMes(rango).map(() => ({ width: 12.5 }))];

function hojaGasto(hoja: ExcelJS.Worksheet, reporte: Reporte, rango: Rango, nombre: string) {
  hoja.columns = anchosMatriz(rango);
  titulo(hoja, 1, nombre);

  const tabla = (tipo: 'GASTO' | 'AHORRO', inicio: number) => {
    const seccion = reporte.secciones.find((s) => s.tipo === tipo)!;
    titulo(hoja, inicio, seccion.nombre, 14);
    return escribirTabla(hoja, inicio + 1, COLUMNAS_TABLA, filasPorSubcategoria(seccion), seccion.totales, rango);
  };

  const totalGastos = tabla('GASTO', 2);
  const totalAhorro = tabla('AHORRO', totalGastos + 2);
  return { totalGastos, totalAhorro };
}

function hojaResumen(
  hoja: ExcelJS.Worksheet,
  reporte: Reporte,
  gasto: { totalGastos: number; totalAhorro: number },
  rango: Rango,
  nombre: string,
) {
  hoja.columns = anchosMatriz(rango);
  titulo(hoja, 1, nombre);

  const ingresos = reporte.secciones.find((s) => s.tipo === 'INGRESO')!;
  titulo(hoja, 7, ingresos.nombre, 14);
  const totalIngresos = escribirTabla(hoja, 8, COLUMNAS_TABLA, filasPorSubcategoria(ingresos), ingresos.totales, rango);

  const colUltimoMes = COL_PRIMER_MES + rango.meses.length - 1;
  const colFin = rango.total ? colUltimoMes + 1 : colUltimoMes;
  const encabezado = hoja.getRow(2);
  encabezadosMes(rango).forEach((texto, i) => (encabezado.getCell(COL_PRIMER_MES + i).value = texto));
  estiloEncabezado(encabezado, COL_PRIMER_MES, colFin);

  const valor = (tipo: 'GASTO' | 'AHORRO') => reporte.secciones.find((s) => s.tipo === tipo)!.totales;
  const resumen = [
    { nombre: 'Gastos totales', valores: valor('GASTO'), formula: (col: string) => `Gasto!${col}${gasto.totalGastos}` },
    { nombre: 'Ahorro total', valores: valor('AHORRO'), formula: (col: string) => `Gasto!${col}${gasto.totalAhorro}` },
    { nombre: 'Efectivo libre', valores: reporte.efectivoNeto, formula: (col: string) => `${col}${totalIngresos}-${col}3-${col}4` },
  ];

  resumen.forEach(({ nombre, valores, formula }, i) => {
    const n = 3 + i;
    const fila = hoja.getRow(n);
    const recortados = recortar(valores, rango);
    fila.getCell(2).value = nombre;
    recortados.meses.forEach((v, m) => {
      fila.getCell(COL_PRIMER_MES + m).value = { formula: formula(letra(COL_PRIMER_MES + m)), result: Number(v) };
    });
    if (rango.total) {
      fila.getCell(colFin).value = {
        formula: `SUM(${letra(COL_PRIMER_MES)}${n}:${letra(colUltimoMes)}${n})`,
        result: Number(recortados.total),
      };
    }
    for (let c = COL_PRIMER_MES; c <= colFin; c++) fila.getCell(c).numFmt = FORMATO_MONTO;
  });
  estiloTotal(hoja.getRow(5), colFin);
}

// Matriz Resumen + Gasto del mes, trimestre o año. "vacia" genera la plantilla para importar.
export async function exportarReporte(usuarioId: string, periodo: Periodo, alcance: Alcance, vacia = false) {
  const { inicio, meses } = rangoDeAlcance(periodo, alcance);
  const { anio } = inicio;
  const trimestre = Math.ceil(inicio.mes / 3);
  const rango: Rango = {
    meses: Array.from({ length: meses }, (_, i) => inicio.mes - 1 + i),
    total: COLUMNA_TOTAL[alcance],
    vacia,
  };
  const nombres: Record<Alcance, { titulo: string; archivo: string }> = {
    anual: { titulo: `${anio}`, archivo: `${anio}` },
    trimestral: { titulo: `T${trimestre} ${anio}`, archivo: `${anio}-T${trimestre}` },
    mensual: { titulo: `${nombreMes(anio, inicio.mes)} ${anio}`, archivo: `${anio}-${String(inicio.mes).padStart(2, '0')}` },
  };
  const nombre = `Presupuesto personal ${nombres[alcance].titulo}`;

  const reporte = await reporteAnual(usuarioId, anio);
  const libro = nuevoLibro();
  const vista = { showGridLines: false };
  const resumen = libro.addWorksheet('Resumen', { views: [vista] });
  const gasto = libro.addWorksheet('Gasto', { views: [vista] });

  hojaResumen(resumen, reporte, hojaGasto(gasto, reporte, rango, nombre), rango, nombre);

  return {
    archivo: Buffer.from(await libro.xlsx.writeBuffer()),
    nombre: `${vacia ? `plantilla-${alcance}` : 'presupuesto'}-${nombres[alcance].archivo}.xlsx`,
  };
}

const TIPOS: Record<TipoMovimiento, string> = { INGRESO: 'Ingreso', GASTO: 'Gasto', AHORRO: 'Ahorro' };

const COLUMNAS = [
  { titulo: 'Fecha', ancho: 12 },
  { titulo: 'Tipo', ancho: 10 },
  { titulo: 'Categoría', ancho: 22 },
  { titulo: 'Subcategoría', ancho: 22 },
  { titulo: 'Descripción', ancho: 34 },
  { titulo: 'Comercio', ancho: 20 },
  { titulo: 'Cuenta', ancho: 14 },
  { titulo: 'Notas', ancho: 30 },
  { titulo: 'Monto', ancho: 14 },
];

function nombrePeriodo({ anio, mes }: FiltrosExportar) {
  if (!anio) return { titulo: 'Movimientos', archivo: 'movimientos' };
  if (!mes) return { titulo: `Movimientos ${anio}`, archivo: `movimientos-${anio}` };
  return {
    titulo: `Movimientos de ${nombreMes(anio, mes)} ${anio}`,
    archivo: `movimientos-${anio}-${String(mes).padStart(2, '0')}`,
  };
}

export async function exportarMovimientos(usuarioId: string, filtros: FiltrosExportar) {
  const [movimientos, totales, categoria] = await Promise.all([
    todosLosMovimientos(usuarioId, filtros),
    totalesMovimientos(usuarioId, filtros),
    filtros.categoriaId
      ? prisma.categoria.findFirst({ where: { id: filtros.categoriaId, usuarioId }, select: { nombre: true } })
      : null,
  ]);
  const periodo = nombrePeriodo(filtros);

  const encabezado = 4;
  const colTipo = 3;
  const colMonto = 2 + COLUMNAS.length - 1;
  const libro = nuevoLibro();
  const hoja = libro.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: encabezado, showGridLines: false }] });
  hoja.columns = [{ width: 2.7 }, ...COLUMNAS.map((c) => ({ width: c.ancho }))];

  titulo(hoja, 1, periodo.titulo);
  const aplicados = [
    filtros.tipo && `Tipo: ${TIPOS[filtros.tipo]}`,
    categoria && `Categoría: ${categoria.nombre}`,
    filtros.q && `Búsqueda: "${filtros.q}"`,
  ].filter(Boolean);
  const detalle = hoja.getCell(2, 2);
  detalle.value = aplicados.length ? aplicados.join(' · ') : 'Sin filtros';
  detalle.font = { italic: true, color: { argb: TEXTO_SECUNDARIO } };

  const filaEncabezado = hoja.getRow(encabezado);
  COLUMNAS.forEach((c, i) => (filaEncabezado.getCell(2 + i).value = c.titulo));
  estiloEncabezado(filaEncabezado, colMonto, colMonto);

  movimientos.forEach((m, i) => {
    const fila = hoja.getRow(encabezado + 1 + i);
    fila.values = [
      undefined,
      new Date(`${m.fecha}T00:00:00Z`),
      TIPOS[m.tipo],
      m.subcategoria.categoria.nombre,
      m.subcategoria.nombre,
      m.descripcion,
      m.comercio,
      m.cuenta,
      m.notas,
      Number(m.monto),
    ];
    fila.getCell(2).numFmt = 'dd/mm/yyyy';
    fila.getCell(2).alignment = { horizontal: 'left' };
    fila.getCell(colMonto).numFmt = FORMATO_MONTO;
  });

  const ultima = encabezado + movimientos.length;
  if (movimientos.length) {
    hoja.autoFilter = { from: { row: encabezado, column: 2 }, to: { row: ultima, column: colMonto } };
  }

  const tipos = letra(colTipo);
  const montos = letra(colMonto);
  const sumaTipo = (tipo: TipoMovimiento, total: string) =>
    movimientos.length
      ? { formula: `SUMIF(${tipos}${encabezado + 1}:${tipos}${ultima},"${TIPOS[tipo]}",${montos}${encabezado + 1}:${montos}${ultima})`, result: Number(total) }
      : 0;

  const inicio = ultima + 2;
  const resumen = [
    ['Ingresos', sumaTipo('INGRESO', totales.ingresos)],
    ['Gastos', sumaTipo('GASTO', totales.gastos)],
    ['Ahorro', sumaTipo('AHORRO', totales.ahorro)],
    ['Balance neto', { formula: `${montos}${inicio}-${montos}${inicio + 1}-${montos}${inicio + 2}`, result: Number(totales.balance) }],
  ] as const;
  resumen.forEach(([nombre, valor], i) => {
    const fila = hoja.getRow(inicio + i);
    fila.getCell(colMonto - 1).value = nombre;
    fila.getCell(colMonto).value = valor;
    fila.getCell(colMonto).numFmt = FORMATO_MONTO;
  });
  estiloTotal(hoja.getRow(inicio + 3), colMonto, colMonto - 1);

  return { archivo: Buffer.from(await libro.xlsx.writeBuffer()), nombre: `${periodo.archivo}.xlsx` };
}
