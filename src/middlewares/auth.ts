import type { RequestHandler } from 'express';
import { verificarToken } from '../config/jwt.ts';
import { HttpError } from './errores.ts';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'No autenticado');

  try {
    req.usuarioId = verificarToken(token);
  } catch {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }
  next();
};
