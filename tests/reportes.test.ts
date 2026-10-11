import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';
import { borrarUsuario, crearUsuarioTemporal } from './helpers.ts';

let usuario: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let reporte: {
  secciones: {
    tipo: string;
    categorias: { nombre: string; meses: string[]; total: string; subcategorias: { nombre: string; meses: string[] }[] }[];
    totales: { meses: string[]; total: string };
  }[];
  efectivoNeto: { meses: string[]; total: string };
};

const auth = () => ({ Authorization: `Bearer ${usuario.token}` });
const seccion = (tipo: string) => reporte.secciones.find((s) => s.tipo === tipo)!;
const categoria = (tipo: string, nombre: string) => seccion(tipo).categorias.find((c) => c.nombre === nombre)!;

beforeAll(async () => {
  usuario = await crearUsuarioTemporal();

  const categorias = await prisma.categoria.findMany({ where: { usuarioId: usuario.usuarioId }, include: { subcategorias: true } });
  const sub = (nombre: string) => categorias.find((c) => c.nombre === nombre)!.subcategorias[0]!.id;

  const movimientos = [
    { sub: 'Salarios', fecha: '2026-01-01', monto: '4200.00' },
    { sub: 'Varios', fecha: '2026-01-20', monto: '300.50' },
    { sub: 'Salarios', fecha: '2026-02-01', monto: '4200.00' },
    { sub: 'Hogar', fecha: '2026-01-05', monto: '1200.00' },
    { sub: 'Vida diaria', fecha: '2026-01-07', monto: '150.25' },
    { sub: 'Vida diaria', fecha: '2026-01-21', monto: '99.75' },
    { sub: 'Hogar', fecha: '2026-02-05', monto: '1200.00' },
    { sub: 'Vacaciones', fecha: '2026-12-15', monto: '2000.00' },
    { sub: 'Ahorros', fecha: '2026-01-02', monto: '600.00' },
    { sub: 'Hogar', fecha: '2025-12-05', monto: '999.00' },
    { sub: 'Hogar', fecha: '2027-01-05', monto: '999.00' },
  ];
  for (const m of movimientos) {
    await request(app)
      .post('/api/movimientos')
      .set(auth())
      .send({ subcategoriaId: sub(m.sub), fecha: m.fecha, descripcion: 'Test', monto: m.monto });
  }

  reporte = (await request(app).get('/api/reportes/anual?anio=2026').set(auth())).body;
});

afterAll(async () => {
  await borrarUsuario(usuario.email);
  await prisma.$disconnect();
});

describe('reporte anual (fórmulas del Excel)', () => {
  it('GastoMes(cat, mes) suma los gastos de la categoría en el mes', () => {
    expect(categoria('GASTO', 'Vida diaria').meses[0]).toBe('250.00');
    expect(categoria('GASTO', 'Hogar').meses.slice(0, 2)).toEqual(['1200.00', '1200.00']);
    expect(categoria('GASTO', 'Vida diaria').subcategorias[0]!.meses[0]).toBe('250.00');
  });

  it('IngresoMes(cat, mes) suma los ingresos de la categoría en el mes', () => {
    expect(categoria('INGRESO', 'Salarios').meses.slice(0, 3)).toEqual(['4200.00', '4200.00', '0.00']);
    expect(categoria('INGRESO', 'Varios').meses[0]).toBe('300.50');
  });

  it('GastosTotales(mes) suma todos los gastos del mes', () => {
    expect(seccion('GASTO').totales.meses.slice(0, 2)).toEqual(['1450.00', '1200.00']);
    expect(seccion('GASTO').totales.meses[11]).toBe('2000.00');
  });

  it('EfectivoLibre(mes) = ingresos − gastos − ahorro', () => {
    expect(reporte.efectivoNeto.meses[0]).toBe('2450.50');
    expect(reporte.efectivoNeto.meses[1]).toBe('3000.00');
    expect(reporte.efectivoNeto.meses[11]).toBe('-2000.00');
  });

  it('Año = suma de los 12 meses en cada fila', () => {
    expect(categoria('GASTO', 'Hogar').total).toBe('2400.00');
    expect(seccion('INGRESO').totales.total).toBe('8700.50');
    expect(seccion('GASTO').totales.total).toBe('4650.00');
    expect(seccion('AHORRO').totales.total).toBe('600.00');
    expect(reporte.efectivoNeto.total).toBe('3450.50');
  });

  it('ignora movimientos de otros años', () => {
    const hogar = categoria('GASTO', 'Hogar');
    expect(hogar.meses[0]).toBe('1200.00');
    expect(hogar.meses[11]).toBe('0.00');
  });

  it('resumen mensual: totales y variación frente al mes anterior', async () => {
    const { body } = await request(app).get('/api/reportes/resumen-mensual?anio=2026&mes=2').set(auth());

    expect(body.totales).toEqual({ ingresos: '4200.00', gastos: '1200.00', ahorro: '0.00', efectivoLibre: '3000.00' });
    expect(body.variacion).toEqual({ ingresos: -6.7, gastos: -17.2, ahorro: -100, efectivoLibre: 22.4 });
  });

  it('resumen mensual: desglose por categoría con porcentaje', async () => {
    const { body } = await request(app).get('/api/reportes/resumen-mensual?anio=2026&mes=1').set(auth());

    expect(body.desglose.gastos.map((g: { nombre: string; monto: string; porcentaje: number }) => [g.nombre, g.monto, g.porcentaje])).toEqual([
      ['Hogar', '1200.00', 82.8],
      ['Vida diaria', '250.00', 17.2],
    ]);
    expect(body.variacion.ingresos).toBeNull();
  });

  it('histórico: últimos N meses, cruzando de año, y ahorro promedio', async () => {
    const { body } = await request(app).get('/api/reportes/historico?anio=2026&mes=2&meses=3').set(auth());

    expect(body.meses.map((m: { anio: number; mes: number; ingresos: string; gastos: string }) => [m.anio, m.mes, m.ingresos, m.gastos])).toEqual([
      [2025, 12, '0.00', '999.00'],
      [2026, 1, '4500.50', '1450.00'],
      [2026, 2, '4200.00', '1200.00'],
    ]);
    expect(body.promedioAhorro).toBe('200.00');
  });

  it('valida el año', async () => {
    const res = await request(app).get('/api/reportes/anual?anio=abc').set(auth());
    expect(res.status).toBe(400);
  });
});
