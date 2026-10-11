import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const rutaNoEncontrada: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'Ruta no encontrada'));
};

export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      mensaje: 'Datos inválidos',
      errores: z.flattenError(err).fieldErrors,
    });
    return;
  }

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ mensaje: 'JSON inválido' });
    return;
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({ mensaje: 'El archivo supera el tamaño máximo permitido (5 MB)' });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ mensaje: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ mensaje: 'Error interno del servidor' });
};
