import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';
import { diasDelMes, hoy } from '../src/utils/fechas.ts';
import { borrarUsuario, crearUsuarioTemporal } from './helpers.ts';

let usuario: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
const cat: Record<string, string> = {};
const auth = () => ({ Authorization: `Bearer ${usuario.token}` });

type Fila = { nombre: string; limite: string | null; gastado: string; porcentaje: number | null; estado: string; cupoDiario: string | null };
const fila = (body: { categorias: Fila[] }, nombre: string) => body.categorias.find((c) => c.nombre === nombre)!;
const guardar = (anio: number, mes: number, limites: { categoriaId: string; limite: string | null }[]) =>
  request(app).put('/api/presupuestos').set(auth()).send({ anio, mes, limites });

beforeAll(async () => {
  usuario = await crearUsuarioTemporal();
  const categorias = await prisma.categoria.findMany({ where: { usuarioId: usuario.usuarioId }, include: { subcategorias: true } });
  for (const c of categorias) cat[c.nombre] = c.id;
  const sub = (nombre: string) => categorias.find((c) => c.nombre === nombre)!.subcategorias[0]!.id;

  for (const [nombre, monto] of [['Hogar', '1200'], ['Vida diaria', '250'], ['Transporte', '95'], ['Ocio', '10'], ['Salud', '50']]) {
    await request(app)
      .post('/api/movimientos')
      .set(auth())
      .send({ subcategoriaId: sub(nombre!), fecha: '2026-03-10', descripcion: 'Test', monto });
  }
});

afterAll(async () => {
  await borrarUsuario(usuario.email);
  await prisma.$disconnect();
});

describe('presupuestos', () => {
  it('calcula gasto real, porcentaje y estado por categoría', async () => {
    const res = await guardar(2026, 3, [
      { categoriaId: cat['Hogar']!, limite: '1500' },
      { categoriaId: cat['Vida diaria']!, limite: '200' },
      { categoriaId: cat['Transporte']!, limite: '100' },
      { categoriaId: cat['Ocio']!, limite: '100' },
    ]);

    expect(res.status).toBe(200);
    expect(fila(res.body, 'Hogar')).toMatchObject({ limite: '1500.00', gastado: '1200.00', porcentaje: 80, estado: 'ATENCION' });
    expect(fila(res.body, 'Vida diaria')).toMatchObject({ porcentaje: 125, estado: 'EXCEDIDO' });
    expect(fila(res.body, 'Transporte')).toMatchObject({ porcentaje: 95, estado: 'CERCA_LIMITE' });
    expect(fila(res.body, 'Ocio')).toMatchObject({ porcentaje: 10, estado: 'EN_RANGO' });
    expect(fila(res.body, 'Salud')).toMatchObject({ limite: null, gastado: '50.00', estado: 'SIN_LIMITE' });
  });

  it('resume el mes y separa el gasto sin presupuesto', async () => {
    const { body } = await request(app).get('/api/presupuestos?anio=2026&mes=3').set(auth());

    expect(body.resumen).toEqual({
      presupuestado: '1900.00',
      gastado: '1555.00',
      disponible: '345.00',
      porcentaje: 81.8,
      gastoSinPresupuesto: '50.00',
    });
  });

  it('en un mes pasado el ritmo es 100% y no hay cupo diario', async () => {
    const { body } = await request(app).get('/api/presupuestos?anio=2026&mes=3').set(auth());

    expect(body.ritmo).toMatchObject({ porcentajeMes: 100, diasRestantes: 0, esMesActual: false });
    expect(fila(body, 'Ocio').cupoDiario).toBeNull();
  });

  it('en el mes actual sugiere un cupo diario', async () => {
    const { anio, mes, dia } = hoy();
    const res = await guardar(anio, mes, [{ categoriaId: cat['Ocio']!, limite: '300' }]);
    const restantes = diasDelMes(anio, mes) - dia + 1;

    expect(res.body.ritmo.esMesActual).toBe(true);
    expect(fila(res.body, 'Ocio').cupoDiario).toBe((300 / restantes).toFixed(2));
  });

  it('elimina un límite enviando null', async () => {
    const res = await guardar(2026, 3, [{ categoriaId: cat['Ocio']!, limite: null }]);

    expect(fila(res.body, 'Ocio')).toMatchObject({ limite: null, estado: 'SIN_LIMITE' });
  });

  it('copia el presupuesto del mes anterior', async () => {
    const res = await request(app).post('/api/presupuestos/copiar').set(auth()).send({ anio: 2026, mes: 4 });

    expect(res.status).toBe(200);
    expect(fila(res.body, 'Hogar').limite).toBe('1500.00');
    expect(fila(res.body, 'Hogar').gastado).toBe('0.00');
  });

  it('avisa si el mes anterior no tiene presupuesto', async () => {
    const res = await request(app).post('/api/presupuestos/copiar').set(auth()).send({ anio: 2020, mes: 1 });

    expect(res.status).toBe(404);
  });

  it('solo permite presupuestar categorías de gasto propias', async () => {
    expect((await guardar(2026, 3, [{ categoriaId: cat['Salarios']!, limite: '100' }])).status).toBe(400);
    expect((await guardar(2026, 3, [{ categoriaId: 'no-existe', limite: '100' }])).status).toBe(400);
  });
});
