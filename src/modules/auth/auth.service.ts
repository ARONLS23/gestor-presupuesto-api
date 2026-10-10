import { compare, hash } from 'bcryptjs';
import type { Prisma } from '../../../generated/prisma/client.ts';
import { firmarToken } from '../../config/jwt.ts';
import { prisma } from '../../config/prisma.ts';
import { HttpError } from '../../middlewares/errores.ts';
import { esDuplicado } from '../../utils/prisma-errores.ts';
import { categoriasIniciales } from '../categorias/categorias-iniciales.ts';
import type { LoginInput, RegistroInput } from './auth.schemas.ts';

const usuarioPublico = {
  id: true,
  nombre: true,
  email: true,
  moneda: true,
  creadoEn: true,
} satisfies Prisma.UsuarioSelect;

export const registrar = async ({ nombre, email, password }: RegistroInput) => {
  try {
    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash: await hash(password, 12),
        categorias: { create: categoriasIniciales },
      },
      select: usuarioPublico,
    });
    return { usuario, token: firmarToken(usuario.id) };
  } catch (err) {
    if (esDuplicado(err)) throw new HttpError(409, 'El email ya está registrado');
    throw err;
  }
};

export const login = async ({ email, password }: LoginInput) => {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !(await compare(password, usuario.passwordHash))) {
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }

  const { passwordHash: _, ...datos } = usuario;
  return { usuario: datos, token: firmarToken(usuario.id) };
};

export const obtenerUsuario = async (id: string) => {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: usuarioPublico });
  if (!usuario) throw new HttpError(401, 'Sesión inválida o expirada');
  return usuario;
};
