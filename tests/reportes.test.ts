import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  const sub = (nombre: string) => categorias.flatMap((c) => c.subcategorias).find((s) => s.nombre === nombre)!.id;

  const movimientos = [
    { sub: 'Sueldo mensual', fecha: '2026-01-01', monto: '4200.00' },
    { sub: 'Otros', fecha: '2026-01-20', monto: '300.50' },
    { sub: 'Sueldo mensual', fecha: '2026-02-01', monto: '4200.00' },
    { sub: 'Alquiler o hipoteca', fecha: '2026-01-05', monto: '1200.00' },
    { sub: 'Supermercado', fecha: '2026-01-07', monto: '150.25' },
    { sub: 'Supermercado', fecha: '2026-01-21', monto: '99.75' },
    { sub: 'Alquiler o hipoteca', fecha: '2026-02-05', monto: '1200.00' },
    { sub: 'Viajes', fecha: '2026-12-15', monto: '2000.00' },
    { sub: 'Ahorro general', fecha: '2026-01-02', monto: '600.00' },
    { sub: 'Alquiler o hipoteca', fecha: '2025-12-05', monto: '999.00' },
    { sub: 'Alquiler o hipoteca', fecha: '2027-01-05', monto: '999.00' },
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
    expect(categoria('GASTO', 'Alimentación').meses[0]).toBe('250.00');
    expect(categoria('GASTO', 'Vivienda').meses.slice(0, 2)).toEqual(['1200.00', '1200.00']);
    expect(categoria('GASTO', 'Alimentación').subcategorias.find((s) => s.nombre === 'Supermercado')!.meses[0]).toBe('250.00');
  });

  it('IngresoMes(cat, mes) suma los ingresos de la categoría en el mes', () => {
    expect(categoria('INGRESO', 'Sueldo').meses.slice(0, 3)).toEqual(['4200.00', '4200.00', '0.00']);
    expect(categoria('INGRESO', 'Otros ingresos').meses[0]).toBe('300.50');
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
    expect(categoria('GASTO', 'Vivienda').total).toBe('2400.00');
    expect(seccion('INGRESO').totales.total).toBe('8700.50');
    expect(seccion('GASTO').totales.total).toBe('4650.00');
    expect(seccion('AHORRO').totales.total).toBe('600.00');
    expect(reporte.efectivoNeto.total).toBe('3450.50');
  });

  it('ignora movimientos de otros años', () => {
    const hogar = categoria('GASTO', 'Vivienda');
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
      ['Vivienda', '1200.00', 82.8],
      ['Alimentación', '250.00', 17.2],
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

  it('KPIs trimestrales: trimestre del mes frente al trimestre anterior', async () => {
    const { body } = await request(app).get('/api/reportes/kpis?anio=2026&mes=2&alcance=trimestral').set(auth());

    expect(body.inicio).toEqual({ anio: 2026, mes: 1 });
    expect(body.totales).toEqual({ ingresos: '8700.50', gastos: '2650.00', ahorro: '600.00', efectivoLibre: '5450.50' });
    expect(body.variacion).toMatchObject({ ingresos: null, gastos: 165.3 });
  });

  it('KPIs anuales: año completo frente al año anterior', async () => {
    const { body } = await request(app).get('/api/reportes/kpis?anio=2026&mes=7&alcance=anual').set(auth());

    expect(body.totales).toEqual({ ingresos: '8700.50', gastos: '4650.00', ahorro: '600.00', efectivoLibre: '3450.50' });
    expect(body.variacion.gastos).toBe(365.5);
  });

  it('KPIs mensuales coinciden con el resumen mensual', async () => {
    const kpis = (await request(app).get('/api/reportes/kpis?anio=2026&mes=2').set(auth())).body;
    const resumen = (await request(app).get('/api/reportes/resumen-mensual?anio=2026&mes=2').set(auth())).body;

    expect(kpis.alcance).toBe('mensual');
    expect(kpis.totales).toEqual(resumen.totales);
    expect(kpis.variacion).toEqual(resumen.variacion);
  });

  it('saldo: ingresos − gastos − ahorro acumulados hasta hoy (hora de Lima)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-02-01T04:00:00Z'));
    const { body } = await request(app).get('/api/reportes/saldo').set(auth());
    vi.useRealTimers();

    expect(body).toEqual({ saldo: '1451.50' });
  });

  it('valida el año', async () => {
    const res = await request(app).get('/api/reportes/anual?anio=abc').set(auth());
    expect(res.status).toBe(400);
  });
});
