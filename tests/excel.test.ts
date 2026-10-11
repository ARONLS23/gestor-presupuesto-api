import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';
import { binario, borrarUsuario, crearUsuarioTemporal } from './helpers.ts';

let usuario: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let libro: ExcelJS.Workbook;

const auth = () => ({ Authorization: `Bearer ${usuario.token}` });
const fila = (hoja: string, etiqueta: string, columna = 2) => {
  const ws = libro.getWorksheet(hoja)!;
  return ws.getRows(1, ws.rowCount)!.find((r) => r.getCell(columna).value === etiqueta)!;
};
const resultado = (celda: ExcelJS.Cell) => (celda.value as ExcelJS.CellFormulaValue).result;

async function descargar(ruta: string, nombre: string) {
  const res = await request(app)
    .get(ruta)
    .set(auth())
    .buffer(true)
    .parse(binario);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('spreadsheetml');
  expect(res.headers['content-disposition']).toContain(nombre);
  const archivo = new ExcelJS.Workbook();
  await archivo.xlsx.load(res.body);
  return archivo;
}

beforeAll(async () => {
  usuario = await crearUsuarioTemporal();

  const categorias = await prisma.categoria.findMany({ where: { usuarioId: usuario.usuarioId }, include: { subcategorias: true } });
  const sub = (nombre: string) => categorias.flatMap((c) => c.subcategorias).find((s) => s.nombre === nombre)!.id;

  const movimientos = [
    { sub: 'Sueldo mensual', fecha: '2026-01-01', monto: '4200.00' },
    { sub: 'Otros', fecha: '2026-03-20', monto: '300.50' },
    { sub: 'Alquiler o hipoteca', fecha: '2026-01-05', monto: '1200.00' },
    { sub: 'Supermercado', fecha: '2026-03-07', monto: '150.25' },
    { sub: 'Ahorro general', fecha: '2026-01-02', monto: '600.00' },
    { sub: 'Alquiler o hipoteca', fecha: '2025-12-05', monto: '999.00' },
  ];
  for (const m of movimientos) {
    await request(app)
      .post('/api/movimientos')
      .set(auth())
      .send({ subcategoriaId: sub(m.sub), fecha: m.fecha, descripcion: 'Test', monto: m.monto });
  }

  libro = await descargar('/api/excel/exportar?anio=2026', 'presupuesto-2026.xlsx');
});

afterAll(async () => {
  await borrarUsuario(usuario.email);
  await prisma.$disconnect();
});

describe('exportar vista anual a Excel', () => {
  it('genera las hojas Resumen y Gasto', () => {
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Resumen', 'Gasto']);
  });

  it('hoja Gasto: una fila por subcategoría con meses y Año = SUM', () => {
    const hogar = fila('Gasto', 'Alquiler o hipoteca', 3);
    expect(hogar.getCell(4).value).toBe(1200);
    expect(hogar.getCell(16).value).toMatchObject({ formula: `SUM(D${hogar.number}:O${hogar.number})`, result: 1200 });
  });

  it('hoja Gasto: totales de Gastos y Ahorro con SUM por mes', () => {
    const [gastos, ahorro] = libro.getWorksheet('Gasto')!.getRows(1, 80)!.filter((r) => r.getCell(2).value === 'Total');
    expect((gastos!.getCell(4).value as ExcelJS.CellFormulaValue).formula).toMatch(/^SUM\(D\d+:D\d+\)$/);
    expect(resultado(gastos!.getCell(16))).toBe(1350.25);
    expect(resultado(ahorro!.getCell(16))).toBe(600);
  });

  it('hoja Resumen: gastos, ahorro y efectivo libre = ingresos − gastos − ahorro', () => {
    expect(resultado(fila('Resumen', 'Gastos totales').getCell(16))).toBe(1350.25);
    expect(resultado(fila('Resumen', 'Ahorro total').getCell(16))).toBe(600);

    const efectivo = fila('Resumen', 'Efectivo libre');
    expect(resultado(efectivo.getCell(4))).toBe(2400);
    expect(resultado(efectivo.getCell(16))).toBe(2550.25);
    expect((efectivo.getCell(4).value as ExcelJS.CellFormulaValue).formula).toMatch(/^D\d+-D3-D4$/);
  });

  it('hoja Resumen: tabla de ingresos por categoría y subcategoría', () => {
    const sueldo = fila('Resumen', 'Sueldo mensual', 3);
    expect(sueldo.getCell(2).value).toBe('Sueldo');
    expect(sueldo.getCell(4).value).toBe(4200);
    expect(resultado(fila('Resumen', 'Total').getCell(16))).toBe(4500.5);
  });

  it('trimestral: solo los 3 meses del trimestre y columna Total', async () => {
    const trimestre = await descargar('/api/excel/exportar?anio=2026&mes=2&alcance=trimestral', 'presupuesto-2026-T1.xlsx');
    const gasto = trimestre.getWorksheet('Gasto')!;
    expect([2, 3, 4, 5, 6, 7, 8].map((c) => gasto.getRow(3).getCell(c).value)).toEqual(['Categoría', 'Subcategoría', 'Ene', 'Feb', 'Marzo', 'Total', null]);
    expect(gasto.getCell('B1').value).toBe('Presupuesto personal T1 2026');

    const resumen = trimestre.getWorksheet('Resumen')!;
    const efectivo = resumen.getRows(1, 10)!.find((r) => r.getCell(2).value === 'Efectivo libre')!;
    expect(resultado(efectivo.getCell(7))).toBe(2550.25);
  });

  it('mensual: una columna con el mes y sin columna total', async () => {
    const marzo = await descargar('/api/excel/exportar?anio=2026&mes=3&alcance=mensual', 'presupuesto-2026-03.xlsx');
    const gasto = marzo.getWorksheet('Gasto')!;
    const vida = gasto.getRows(1, 60)!.find((r) => r.getCell(3).value === 'Supermercado')!;
    expect(gasto.getRow(3).getCell(4).value).toBe('Marzo');
    expect(gasto.getRow(3).getCell(5).value).toBeNull();
    expect(vida.getCell(4).value).toBe(150.25);
  });

  it('plantilla vacía para importar (mensual)', async () => {
    const plantilla = await descargar('/api/excel/plantilla?anio=2026&mes=11&alcance=mensual', 'plantilla-mensual-2026-11.xlsx');
    const gasto = plantilla.getWorksheet('Gasto')!;
    const hogar = gasto.getRows(1, 60)!.find((r) => r.getCell(3).value === 'Alquiler o hipoteca')!;
    expect(gasto.getRow(3).getCell(4).value).toBe('Nov');
    expect(hogar.getCell(4).value).toBeNull();
  });

  it('valida el año', async () => {
    const res = await request(app).get('/api/excel/exportar?anio=abc').set(auth());
    expect(res.status).toBe(400);
  });
});

describe('exportar movimientos filtrados a Excel', () => {
  const hoja = (archivo: ExcelJS.Workbook) => archivo.getWorksheet('Movimientos')!;
  const filaDe = (archivo: ExcelJS.Workbook, etiqueta: string) =>
    hoja(archivo).getRows(1, hoja(archivo).rowCount)!.find((r) => r.getCell(9).value === etiqueta)!;

  it('exporta todos los movimientos del mes, ordenados y con totales por tipo', async () => {
    const archivo = await descargar('/api/excel/movimientos?anio=2026&mes=1', 'movimientos-2026-01.xlsx');
    const ws = hoja(archivo);

    expect(ws.getCell('B1').value).toBe('Movimientos de Enero 2026');
    expect(ws.getCell('B2').value).toBe('Sin filtros');
    expect(ws.getRow(4).getCell(2).value).toBe('Fecha');
    expect([5, 6, 7].map((n) => [ws.getCell(`C${n}`).value, ws.getCell(`D${n}`).value, ws.getCell(`J${n}`).value])).toEqual([
      ['Gasto', 'Vivienda', 1200],
      ['Ahorro', 'Ahorro', 600],
      ['Ingreso', 'Sueldo', 4200],
    ]);
    expect(ws.getCell('B5').value).toEqual(new Date('2026-01-05T00:00:00Z'));

    expect(filaDe(archivo, 'Ingresos').getCell(10).value).toMatchObject({ formula: 'SUMIF(C5:C7,"Ingreso",J5:J7)', result: 4200 });
    expect(resultado(filaDe(archivo, 'Gastos').getCell(10))).toBe(1200);
    expect(resultado(filaDe(archivo, 'Balance neto').getCell(10))).toBe(2400);
  });

  it('respeta los filtros y los describe en la hoja', async () => {
    const archivo = await descargar('/api/excel/movimientos?anio=2026&tipo=GASTO&orden=monto_asc', 'movimientos-2026.xlsx');
    const ws = hoja(archivo);

    expect(ws.getCell('B2').value).toBe('Tipo: Gasto');
    expect([5, 6].map((n) => ws.getCell(`J${n}`).value)).toEqual([150.25, 1200]);
    expect(ws.getCell('J7').value).toBeNull();
  });

  it('sin movimientos: hoja vacía con totales en 0', async () => {
    const archivo = await descargar('/api/excel/movimientos?anio=2020&mes=5', 'movimientos-2020-05.xlsx');
    expect(filaDe(archivo, 'Ingresos').getCell(10).value).toBe(0);
    expect(filaDe(archivo, 'Balance neto').getCell(10).value).toMatchObject({ formula: 'J6-J7-J8' });
  });
});
