import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';
import { categoriasIniciales } from '../src/modules/categorias/categorias-iniciales.ts';
import { borrarUsuario, crearUsuarioTemporal } from './helpers.ts';

let usuario: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let otro: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
const auth = () => ({ Authorization: `Bearer ${usuario.token}` });

beforeAll(async () => {
  usuario = await crearUsuarioTemporal();
  otro = await crearUsuarioTemporal();
});

afterAll(async () => {
  await borrarUsuario(usuario.email);
  await borrarUsuario(otro.email);
  await prisma.$disconnect();
});

describe('categorías', () => {
  let categoriaId = '';

  it('crea una categoría con la subcategoría "General" por defecto', async () => {
    const res = await request(app).post('/api/categorias').set(auth()).send({ nombre: 'Mascotas', tipo: 'GASTO', icono: 'pets' });

    expect(res.status).toBe(201);
    expect(res.body.orden).toBe(categoriasIniciales.length);
    expect(res.body.subcategorias.map((s: { nombre: string }) => s.nombre)).toEqual(['General']);
    categoriaId = res.body.id;
  });

  it('rechaza un nombre repetido del mismo tipo', async () => {
    const res = await request(app).post('/api/categorias').set(auth()).send({ nombre: 'Mascotas', tipo: 'GASTO' });

    expect(res.status).toBe(409);
  });

  it('actualiza nombre y color', async () => {
    const res = await request(app).put(`/api/categorias/${categoriaId}`).set(auth()).send({ nombre: 'Mascota', color: '#10B981' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombre: 'Mascota', color: '#10B981' });
  });

  it('no permite tocar categorías de otro usuario', async () => {
    const res = await request(app)
      .put(`/api/categorias/${categoriaId}`)
      .set({ Authorization: `Bearer ${otro.token}` })
      .send({ nombre: 'Hackeada' });

    expect(res.status).toBe(404);
  });

  it('elimina una categoría sin movimientos', async () => {
    const res = await request(app).delete(`/api/categorias/${categoriaId}`).set(auth());

    expect(res.body).toEqual({ resultado: 'eliminada' });
    expect(await prisma.categoria.count({ where: { id: categoriaId } })).toBe(0);
  });

  it('desactiva una categoría con movimientos', async () => {
    const hogar = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId, nombre: 'Vivienda' },
      include: { subcategorias: true },
    });
    await prisma.movimiento.create({
      data: {
        usuarioId: usuario.usuarioId,
        subcategoriaId: hogar.subcategorias[0]!.id,
        tipo: 'GASTO',
        fecha: new Date('2026-10-01'),
        descripcion: 'Alquiler',
        monto: '1200.00',
      },
    });

    const res = await request(app).delete(`/api/categorias/${hogar.id}`).set(auth());

    expect(res.body).toEqual({ resultado: 'desactivada' });
    expect((await prisma.categoria.findUniqueOrThrow({ where: { id: hogar.id } })).activa).toBe(false);
  });
});

describe('subcategorías', () => {
  let categoriaId = '';
  let subcategoriaId = '';

  beforeAll(async () => {
    const res = await request(app).post('/api/categorias').set(auth()).send({ nombre: 'Proyectos personales', tipo: 'GASTO' });
    categoriaId = res.body.id;
  });

  it('crea una subcategoría', async () => {
    const res = await request(app).post('/api/subcategorias').set(auth()).send({ categoriaId, nombre: 'Cursos' });

    expect(res.status).toBe(201);
    subcategoriaId = res.body.id;
  });

  it('rechaza una subcategoría repetida en la misma categoría', async () => {
    const res = await request(app).post('/api/subcategorias').set(auth()).send({ categoriaId, nombre: 'Cursos' });

    expect(res.status).toBe(409);
  });

  it('elimina una subcategoría sin movimientos', async () => {
    const res = await request(app).delete(`/api/subcategorias/${subcategoriaId}`).set(auth());

    expect(res.body).toEqual({ resultado: 'eliminada' });
  });

  it('no elimina la última subcategoría de una categoría', async () => {
    const general = await prisma.subcategoria.findFirstOrThrow({ where: { categoriaId } });
    const res = await request(app).delete(`/api/subcategorias/${general.id}`).set(auth());

    expect(res.status).toBe(409);
  });

  it('no permite crear subcategorías en categorías de otro usuario', async () => {
    const res = await request(app)
      .post('/api/subcategorias')
      .set({ Authorization: `Bearer ${otro.token}` })
      .send({ categoriaId, nombre: 'Intrusa' });

    expect(res.status).toBe(404);
  });
});
