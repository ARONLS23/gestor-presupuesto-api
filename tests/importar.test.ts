import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';
import { binario, borrarUsuario, crearUsuarioTemporal } from './helpers.ts';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MESES = ['Ene', 'Feb', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

let usuario: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let otro: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let archivo: Buffer;

const auth = (u = usuario) => ({ Authorization: `Bearer ${u.token}` });
const enviar = (ruta: string, cuerpo: Buffer, u = usuario) => request(app).post(ruta).set(auth(u)).set('Content-Type', XLSX).send(cuerpo);
const mes = (valores: Record<number, number | string>) => MESES.map((_, i) => valores[i] ?? 0);

// Plantilla mensual: Categoría (+ Subcategoría) y solo las columnas de los meses a cargar.
type FilaPlantilla = [string, string, ...number[]];

async function plantillaMensual(columnas: string[], gastos: FilaPlantilla[], ingresos: FilaPlantilla[] = []) {
  const libro = new ExcelJS.Workbook();
  const resumen = libro.addWorksheet('Resumen');
  resumen.getRow(8).values = [undefined, 'Categoría', 'Subcategoría', ...columnas];
  ingresos.forEach((f, i) => (resumen.getRow(9 + i).values = [undefined, ...f]));
  const gasto = libro.addWorksheet('Gasto');
  gasto.getRow(3).values = [undefined, 'Categoría', 'Subcategoría', ...columnas];
  gastos.forEach((f, i) => (gasto.getRow(4 + i).values = [undefined, ...f]));
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// Libro con la estructura de la plantilla: hojas Resumen (Ingresos) y Gasto, con Categoría y Subcategoría.
async function plantillaConDatos() {
  const libro = new ExcelJS.Workbook();
  const resumen = libro.addWorksheet('Resumen');
  resumen.getRow(6).values = [undefined, 'Categoría', 'Subcategoría', ...MESES, 'Año'];
  resumen.getRow(7).values = [undefined, 'Sueldo', 'Sueldo mensual', ...mes({ 0: 4200, 1: 4200 })];
  resumen.getRow(8).values = [undefined, 'Bonos', 'Extra', ...mes({ 0: 100 })];
  resumen.getRow(9).values = [undefined, 'Total'];

  const gasto = libro.addWorksheet('Gasto');
  gasto.getRow(3).values = [undefined, 'Categoría', 'Subcategoría', ...MESES, 'Año'];
  gasto.getRow(4).values = [undefined, 'Vivienda', 'Alquiler o hipoteca', ...mes({ 0: 1200 })];
  gasto.getRow(5).values = [undefined, 'Alimentación', 'Supermercado ', ...mes({ 2: 300.5 })];
  gasto.getRow(6).values = [undefined, 'Transporte', 'Combustible', ...mes({})];
  gasto.getRow(7).values = [undefined, 'Pagos varios', 'Deudas', ...mes({ 0: 50 })];
  gasto.getRow(8).values = [undefined, 'Vivienda', 'Luz eléctrica', ...mes({ 0: 80 })];
  gasto.getRow(9).values = [undefined, 'Salud', 'Consultas', ...mes({ 1: 'abc' })];
  gasto.getRow(10).values = [undefined, 'Ahorro', 'Ahorro general', ...mes({ 0: 600 })];
  gasto.getRow(11).values = [undefined, 'Total'];
  gasto.getCell('D11').value = { formula: 'SUM(D4:D10)', result: 1930 };

  return Buffer.from(await libro.xlsx.writeBuffer());
}

beforeAll(async () => {
  [usuario, otro] = await Promise.all([crearUsuarioTemporal(), crearUsuarioTemporal()]);
  archivo = await plantillaConDatos();

  const hogar = await prisma.subcategoria.findFirst({ where: { nombre: 'Alquiler o hipoteca', categoria: { usuarioId: usuario.usuarioId } } });
  await request(app)
    .post('/api/movimientos')
    .set(auth())
    .send({ subcategoriaId: hogar!.id, fecha: '2026-01-15', descripcion: 'Registrado a mano', monto: '50.00' });
});

afterAll(async () => {
  await Promise.all([borrarUsuario(usuario.email), borrarUsuario(otro.email)]);
  await prisma.$disconnect();
});


type Fila = { categoria: string; subcategoria: string | null; subcategoriaId: string | null; aviso: string | null; montos: string[] };
type Previa = { anio: number; alcance: string; meses: number[]; filas: Fila[] };

const ver = async (cuerpo: Buffer, alcance = 'anual', u = usuario) =>
  (await enviar(`/api/excel/importar/previa?anio=2026&alcance=${alcance}`, cuerpo, u)).body as Previa;

// Lo que enviaría la vista previa sin cambios: filas con subcategoría y montos válidos (vacío = 0).
const filasValidas = (previa: Previa) =>
  previa.filas
    .filter((f) => f.subcategoriaId && f.montos.every((m) => !m || /^\d+(\.\d{1,2})?$/.test(m)))
    .map((f) => ({ subcategoriaId: f.subcategoriaId!, montos: f.montos }));

const guardar = (previa: Previa, filas = filasValidas(previa), u = usuario) =>
  request(app).post('/api/excel/importar').set(auth(u)).send({ anio: previa.anio, alcance: previa.alcance, meses: previa.meses, filas });

const fila = (previa: Previa, categoria: string, subcategoria?: string) =>
  previa.filas.find((f) => f.categoria === categoria && (subcategoria === undefined || f.subcategoria === subcategoria))!;

const subcategoria = async (nombre: string) =>
  (await prisma.subcategoria.findFirst({ where: { nombre, categoria: { usuarioId: usuario.usuarioId } } }))!.id;

describe('importar plantilla de Excel', () => {
  it('la plantilla original lista sus filas vacías y avisa que sus categorías no existen', async () => {
    const original = await readFile(new URL('../../Presupuesto plantilla.xlsx', import.meta.url));

    const previa = await ver(original);
    expect(previa.filas).toHaveLength(11);
    expect(previa.filas.every((f) => f.montos.every((m) => m === ''))).toBe(true);
    expect(previa.filas.every((f) => !f.subcategoriaId && f.aviso)).toBe(true);
  });

  it('vista previa: cada fila con su subcategoría o el aviso de por qué no la tiene, sin guardar nada', async () => {
    const previa = await ver(archivo);

    expect(previa.meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(fila(previa, 'Sueldo').subcategoriaId).toBe(await subcategoria('Sueldo mensual'));
    expect(fila(previa, 'Alimentación').subcategoriaId).toBe(await subcategoria('Supermercado'));
    expect(fila(previa, 'Alimentación').montos[2]).toBe('300.50');
    expect(fila(previa, 'Pagos varios')).toMatchObject({ subcategoriaId: null, aviso: 'La categoría "Deudas" tiene varias subcategorías' });
    expect(fila(previa, 'Bonos')).toMatchObject({ subcategoriaId: null, aviso: 'La categoría "Bonos" no existe' });
    expect(fila(previa, 'Vivienda', 'Luz eléctrica')).toMatchObject({
      subcategoriaId: null,
      aviso: 'La subcategoría "Luz eléctrica" no existe en "Vivienda"',
    });
    expect(fila(previa, 'Salud').montos[1]).toBe('abc');
    expect(fila(previa, 'Transporte').montos.every((m) => m === '')).toBe(true);

    expect(await prisma.movimiento.count({ where: { usuarioId: usuario.usuarioId } })).toBe(1);
  });

  it('guardar: un movimiento por fila y mes, el día 1, incluso con monto 0', async () => {
    const res = await guardar(await ver(archivo));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ creados: 60 });

    const { body } = await request(app).get('/api/movimientos?anio=2026&mes=3&orden=monto_desc').set(auth());
    expect(body.total).toBe(5);
    expect(body.items[0]).toMatchObject({ fecha: '2026-03-01', descripcion: '', comercio: null, monto: '300.50', tipo: 'GASTO' });
    expect(body.items[4].monto).toBe('0.00');
  });

  it('guarda lo corregido en la vista previa y solo agrega: no borra lo importado antes ni lo manual', async () => {
    const previa = await ver(archivo);

    const bonos = fila(previa, 'Bonos');
    bonos.subcategoriaId = await subcategoria('Otros');
    fila(previa, 'Salud').montos[1] = '80';

    const res = await guardar(previa);
    expect(res.body).toMatchObject({ creados: 84 });

    const { body } = await request(app).get('/api/movimientos/totales?anio=2026').set(auth());
    expect(body).toMatchObject({ ingresos: '16900.00', gastos: '3131.00', ahorro: '1200.00' });
    expect(body.cantidad.total).toBe(145);
  });

  it('rechaza montos no válidos o subcategorías de otra cuenta', async () => {
    const previa = await ver(archivo);
    expect((await guardar(previa, [])).status).toBe(400);
    const conTexto = [{ subcategoriaId: await subcategoria('Alquiler o hipoteca'), montos: ['abc', ...Array(11).fill('')] }];
    expect((await guardar(previa, conTexto)).status).toBe(400);

    const ajena = (await prisma.subcategoria.findFirst({ where: { categoria: { usuarioId: otro.usuarioId } } }))!.id;
    const res = await guardar(previa, [{ subcategoriaId: ajena, montos: ['10', ...Array(11).fill('')] }]);
    expect(res.status).toBe(400);
  });

  it('exportar e importar en otra cuenta da la misma vista anual', async () => {
    const exportado = await request(app).get('/api/excel/exportar?anio=2026').set(auth()).buffer(true).parse(binario);
    const res = await guardar(await ver(exportado.body, 'anual', otro), undefined, otro);
    expect(res.status).toBe(201);

    const anual = async (u: typeof usuario) => (await request(app).get('/api/reportes/anual?anio=2026').set(auth(u))).body;
    const [original, importado] = await Promise.all([anual(usuario), anual(otro)]);
    expect(importado.efectivoNeto).toEqual(original.efectivoNeto);
    expect(importado.secciones.map((s: { totales: unknown }) => s.totales)).toEqual(original.secciones.map((s: { totales: unknown }) => s.totales));
  });

  it('anual exige las 12 columnas de meses', async () => {
    const soloNoviembre = await plantillaMensual(['Nov'], [['Vivienda', 'Alquiler o hipoteca', 999]]);
    const res = await enviar('/api/excel/importar/previa?anio=2026&alcance=anual', soloNoviembre);
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toContain('plantilla mensual');

    const previa = await ver(soloNoviembre, 'mensual');
    expect((await guardar({ ...previa, alcance: 'anual' })).status).toBe(400);
  });

  it('mensual: carga solo los meses del archivo y no toca lo importado de otros meses', async () => {
    const previa = await ver(
      await plantillaMensual(['Nov'], [['Vivienda', 'Alquiler o hipoteca', 999]], [['Sueldo', 'Sueldo mensual', 4200]]),
      'mensual',
    );
    expect(previa.meses).toEqual([11]);

    const res = await guardar(previa);
    expect(res.body).toEqual({ creados: 2, meses: [11] });

    const { body } = await request(app).get('/api/movimientos/totales?anio=2026').set(auth());
    expect(body.gastos).toBe('4130.00');
  });

  it('mensual con varios meses: agrega en cada mes sin tocar lo que ya había', async () => {
    const previa = await ver(await plantillaMensual(['Marzo', 'Nov'], [['Alimentación', 'Supermercado', 100, 0]]), 'mensual');
    expect(previa.meses).toEqual([3, 11]);

    const res = await guardar(previa);
    expect(res.body).toEqual({ creados: 2, meses: [3, 11] });

    const marzo = await request(app).get('/api/movimientos/totales?anio=2026&mes=3').set(auth());
    expect(marzo.body.gastos).toBe('701.00');
    const noviembre = await request(app).get('/api/movimientos/totales?anio=2026&mes=11').set(auth());
    expect(noviembre.body.gastos).toBe('999.00');
  });

  it('rechaza archivos que no son Excel o vacíos', async () => {
    expect((await enviar('/api/excel/importar/previa?anio=2026&alcance=anual', Buffer.from('hola'))).body.mensaje).toBe(
      'El archivo no es un Excel válido (.xlsx)',
    );
    expect((await request(app).post('/api/excel/importar/previa?anio=2026&alcance=anual').set(auth())).status).toBe(400);
  });
});
