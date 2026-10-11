import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';
import { binario, borrarUsuario, crearUsuarioTemporal } from './helpers.ts';

let duenio: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let ajeno: Awaited<ReturnType<typeof crearUsuarioTemporal>>;
let movimientoId: string;
let categoriaId: string;
let subcategoriaId: string;

const como = (u: typeof duenio) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  [duenio, ajeno] = await Promise.all([crearUsuarioTemporal(), crearUsuarioTemporal()]);

  const hogar = await prisma.categoria.findFirst({
    where: { usuarioId: duenio.usuarioId, nombre: 'Hogar' },
    include: { subcategorias: true },
  });
  categoriaId = hogar!.id;
  subcategoriaId = hogar!.subcategorias[0]!.id;

  const { body } = await request(app)
    .post('/api/movimientos')
    .set(como(duenio))
    .send({ subcategoriaId, fecha: '2026-05-10', descripcion: 'Alquiler', monto: '1200.00' });
  movimientoId = body.id;
});

afterAll(async () => {
  await Promise.all([borrarUsuario(duenio.email), borrarUsuario(ajeno.email)]);
  await prisma.$disconnect();
});

describe('aislamiento entre usuarios', () => {
  it('no puede editar un movimiento ajeno', async () => {
    const res = await request(app).put(`/api/movimientos/${movimientoId}`).set(como(ajeno)).send({ monto: '1.00' });
    expect(res.status).toBe(404);

    const { body } = await request(app).get(`/api/movimientos/${movimientoId}`).set(como(duenio));
    expect(body.monto).toBe('1200.00');
  });

  it('no puede editar ni borrar subcategorías ajenas', async () => {
    expect((await request(app).put(`/api/subcategorias/${subcategoriaId}`).set(como(ajeno)).send({ nombre: 'X' })).status).toBe(404);
    expect((await request(app).delete(`/api/subcategorias/${subcategoriaId}`).set(como(ajeno))).status).toBe(404);
    expect(await prisma.subcategoria.findUnique({ where: { id: subcategoriaId } })).toMatchObject({ activa: true });
  });

  it('no puede borrar categorías ajenas', async () => {
    expect((await request(app).delete(`/api/categorias/${categoriaId}`).set(como(ajeno))).status).toBe(404);
    expect(await prisma.categoria.findUnique({ where: { id: categoriaId } })).toMatchObject({ activa: true });
  });

  it('no puede definir límites sobre categorías ajenas', async () => {
    const res = await request(app)
      .put('/api/presupuestos')
      .set(como(ajeno))
      .send({ anio: 2026, mes: 5, limites: [{ categoriaId, limite: '100.00' }] });
    expect(res.status).toBe(400);
    expect(await prisma.presupuesto.count({ where: { categoriaId } })).toBe(0);
  });

  it('filtrar o exportar por una categoría ajena no devuelve sus datos', async () => {
    const lista = await request(app).get(`/api/movimientos?anio=2026&mes=5&categoriaId=${categoriaId}`).set(como(ajeno));
    expect(lista.body.total).toBe(0);

    const archivo = await request(app)
      .get(`/api/excel/movimientos?anio=2026&mes=5&categoriaId=${categoriaId}`)
      .set(como(ajeno))
      .buffer(true)
      .parse(binario);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(archivo.body);
    const hoja = libro.getWorksheet('Movimientos')!;
    expect(hoja.getCell('B2').value).toBe('Sin filtros');
    expect(hoja.getCell('B5').value).toBeNull();
  });

  it('sin token o con un token inválido responde 401', async () => {
    expect((await request(app).get('/api/movimientos')).status).toBe(401);
    expect((await request(app).get('/api/movimientos').set({ Authorization: 'Bearer abc.def.ghi' })).status).toBe(401);
  });
});

describe('login', () => {
  const intentar = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

  it('bloquea el email tras 5 intentos fallidos, aunque luego la contraseña sea correcta', async () => {
    for (let i = 0; i < 5; i++) expect((await intentar(duenio.email, 'incorrecta')).status).toBe(401);

    const bloqueado = await intentar(duenio.email, 'MiClave123');
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.mensaje).toContain('Demasiados intentos');
  });

  it('el bloqueo es por email: otra cuenta puede entrar', async () => {
    expect((await intentar(ajeno.email, 'MiClave123')).status).toBe(200);
  });

  it('los inicios de sesión correctos no cuentan como intentos', async () => {
    for (let i = 0; i < 6; i++) expect((await intentar(ajeno.email, 'MiClave123')).status).toBe(200);
  });

  it('mismo mensaje si el email no existe o la contraseña es incorrecta', async () => {
    const noExiste = await intentar('no-existe@example.com', 'MiClave123');
    const incorrecta = await intentar(ajeno.email, 'otra-clave');
    expect(noExiste.status).toBe(401);
    expect(noExiste.body).toEqual(incorrecta.body);
  });

  it('la API no anuncia la tecnología del servidor', async () => {
    const res = await intentar(ajeno.email, 'MiClave123');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
