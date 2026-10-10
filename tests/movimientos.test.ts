import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';
import { borrarUsuario, crearUsuarioTemporal } from './helpers.ts';

let usuario: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let otro: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
const auth = () => ({ Authorization: `Bearer ${usuario.token}` });
const sub: Record<string, string> = {};
let hogarId = '';

const crear = (datos: object) => request(app).post('/api/movimientos').set(auth()).send(datos);
const listar = (query: string) => request(app).get(`/api/movimientos?${query}`).set(auth());

beforeAll(async () => {
  usuario = await crearUsuarioTemporal();
  otro = await crearUsuarioTemporal();

  const categorias = await prisma.categoria.findMany({ where: { usuarioId: usuario.usuarioId }, include: { subcategorias: true } });
  for (const c of categorias) sub[c.nombre] = c.subcategorias[0]!.id;
  hogarId = categorias.find((c) => c.nombre === 'Hogar')!.id;

  await crear({ subcategoriaId: sub['Hogar'], fecha: '2026-03-05', descripcion: 'Pensión marzo', monto: '1200' });
  await crear({ subcategoriaId: sub['Vida diaria'], fecha: '2026-03-10', descripcion: 'Supermercado Plaza', comercio: 'Plaza Vea', monto: 250.5 });
  await crear({ subcategoriaId: sub['Salarios'], fecha: '2026-03-01', descripcion: 'Sueldo', monto: '4200.00' });
  await crear({ subcategoriaId: sub['Vida diaria'], fecha: '2026-04-02', descripcion: 'Mercado', monto: '80.25' });
});

afterAll(async () => {
  await borrarUsuario(usuario.email);
  await borrarUsuario(otro.email);
  await prisma.$disconnect();
});

describe('movimientos', () => {
  it('toma el tipo de la categoría y devuelve fecha y monto normalizados', async () => {
    const res = await crear({ subcategoriaId: sub['Ahorros'], fecha: '2026-03-02', descripcion: 'Ahorro', monto: '600' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tipo: 'AHORRO', fecha: '2026-03-02', monto: '600.00' });
    expect(res.body.subcategoria.categoria.nombre).toBe('Ahorros');
  });

  it('rechaza montos inválidos', async () => {
    for (const monto of ['0', '-10', '12.345', 'abc']) {
      const res = await crear({ subcategoriaId: sub['Hogar'], fecha: '2026-03-05', descripcion: 'X', monto });
      expect(res.status).toBe(400);
    }
  });

  it('filtra por año y mes', async () => {
    const res = await listar('anio=2026&mes=3');

    expect(res.body.total).toBe(4);
    expect(res.body.items[0].fecha).toBe('2026-03-10');
  });

  it('calcula los totales del filtro', async () => {
    const res = await request(app).get('/api/movimientos/totales?anio=2026&mes=3').set(auth());

    expect(res.body).toEqual({
      ingresos: '4200.00',
      gastos: '1450.50',
      ahorro: '600.00',
      balance: '2149.50',
      cantidad: { INGRESO: 1, GASTO: 2, AHORRO: 1, total: 4 },
    });
  });

  it('devuelve totales en cero cuando no hay movimientos', async () => {
    const res = await request(app).get('/api/movimientos/totales?anio=2020').set(auth());

    expect(res.body).toMatchObject({ ingresos: '0.00', gastos: '0.00', ahorro: '0.00', balance: '0.00' });
  });

  it('filtra por tipo, categoría y texto', async () => {
    expect((await listar('tipo=INGRESO')).body.total).toBe(1);
    expect((await listar(`categoriaId=${hogarId}`)).body.total).toBe(1);
    expect((await listar('q=plaza')).body.items.map((m: { descripcion: string }) => m.descripcion)).toEqual([
      'Supermercado Plaza',
    ]);
  });

  it('ordena por monto y pagina', async () => {
    const res = await listar('orden=monto_desc&size=2&page=1');

    expect(res.body).toMatchObject({ total: 5, size: 2, paginas: 3 });
    expect(res.body.items.map((m: { monto: string }) => m.monto)).toEqual(['4200.00', '1200.00']);
  });

  it('rechaza filtros inválidos', async () => {
    expect((await listar('mes=13')).status).toBe(400);
  });

  it('actualiza y recalcula el tipo al cambiar de subcategoría', async () => {
    const { body } = await crear({ subcategoriaId: sub['Ocio'], fecha: '2026-03-20', descripcion: 'Cine', monto: '40' });
    const res = await request(app)
      .put(`/api/movimientos/${body.id}`)
      .set(auth())
      .send({ subcategoriaId: sub['Varios'], descripcion: 'Reembolso' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tipo: 'INGRESO', descripcion: 'Reembolso', monto: '40.00' });
  });

  it('no permite registrar en subcategorías desactivadas', async () => {
    await prisma.subcategoria.update({ where: { id: sub['Vacaciones']! }, data: { activa: false } });
    const res = await crear({ subcategoriaId: sub['Vacaciones'], fecha: '2026-03-05', descripcion: 'Viaje', monto: '100' });

    expect(res.status).toBe(400);
  });

  it('no permite ver ni usar datos de otro usuario', async () => {
    const { body } = await listar('size=1');
    const ajeno = { Authorization: `Bearer ${otro.token}` };

    expect((await request(app).get(`/api/movimientos/${body.items[0].id}`).set(ajeno)).status).toBe(404);
    expect((await request(app).delete(`/api/movimientos/${body.items[0].id}`).set(ajeno)).status).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/movimientos')
          .set(ajeno)
          .send({ subcategoriaId: sub['Hogar'], fecha: '2026-03-05', descripcion: 'X', monto: '1' })
      ).status,
    ).toBe(404);
  });

  it('elimina un movimiento', async () => {
    const { body } = await crear({ subcategoriaId: sub['Salud'], fecha: '2026-03-15', descripcion: 'Consulta', monto: '90' });
    const res = await request(app).delete(`/api/movimientos/${body.id}`).set(auth());

    expect(res.body).toEqual({ resultado: 'eliminado' });
    expect((await request(app).get(`/api/movimientos/${body.id}`).set(auth())).status).toBe(404);
  });
});
