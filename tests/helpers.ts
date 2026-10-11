import request from 'supertest';
import { app } from '../src/app.ts';
import { prisma } from '../src/config/prisma.ts';

type Parser = Extract<Parameters<request.Test['parse']>[0], (res: never, listo: never) => void>;

export const binario: Parser = (res, listo) => {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => listo(null, Buffer.concat(partes)));
};

export async function crearUsuarioTemporal() {
  const email = `test-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test', email, password: 'MiClave123' });
  return { email, usuarioId: res.body.usuario.id as string, token: res.body.token as string };
}

export async function borrarUsuario(email: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) return;

  const usuarioId = usuario.id;
  await prisma.$transaction([
    prisma.movimiento.deleteMany({ where: { usuarioId } }),
    prisma.presupuesto.deleteMany({ where: { usuarioId } }),
    prisma.subcategoria.deleteMany({ where: { categoria: { usuarioId } } }),
    prisma.categoria.deleteMany({ where: { usuarioId } }),
    prisma.usuario.delete({ where: { id: usuarioId } }),
  ]);
}
