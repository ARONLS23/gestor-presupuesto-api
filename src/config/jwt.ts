import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from './env.ts';

export const firmarToken = (usuarioId: string) =>
  jwt.sign({}, env.JWT_SECRET, {
    subject: usuarioId,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

export const verificarToken = (token: string) => {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === 'string' || !payload.sub) throw new Error('Token sin usuario');
  return payload.sub;
};
