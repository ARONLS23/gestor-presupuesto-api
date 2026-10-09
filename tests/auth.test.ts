import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';

const email = `test-${Date.now()}@example.com`;
const password = 'MiClave123';
let token = '';

afterAll(async () => {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (usuario) {
    await prisma.$transaction([
      prisma.subcategoria.deleteMany({ where: { categoria: { usuarioId: usuario.id } } }),
      prisma.categoria.deleteMany({ where: { usuarioId: usuario.id } }),
      prisma.usuario.delete({ where: { id: usuario.id } }),
    ]);
  }
  await prisma.$disconnect();
});

describe('auth', () => {
  it('registra un usuario con sus categorías iniciales', async () => {
    const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test', email, password });

    expect(res.status).toBe(201);
    expect(res.body.usuario.email).toBe(email);
    expect(res.body.usuario).not.toHaveProperty('passwordHash');
    expect(res.body.token).toBeTypeOf('string');

    const categorias = await request(app).get('/api/categorias').set('Authorization', `Bearer ${res.body.token}`);
    expect(categorias.body).toHaveLength(11);
  });

  it('rechaza un email ya registrado', async () => {
    const res = await request(app).post('/api/auth/registro').send({ nombre: 'Otro', email, password });

    expect(res.status).toBe(409);
  });

  it('rechaza datos inválidos', async () => {
    const res = await request(app).post('/api/auth/registro').send({ nombre: '', email: 'x', password: '123' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errores)).toEqual(['nombre', 'email', 'password']);
  });

  it('inicia sesión', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    token = res.body.token;
  });

  it('rechaza una contraseña incorrecta', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'incorrecta' });

    expect(res.status).toBe(401);
  });

  it('devuelve el usuario actual con token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
  });

  it('rechaza /me sin token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});
