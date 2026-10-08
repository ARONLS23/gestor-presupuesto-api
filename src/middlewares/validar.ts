import type { RequestHandler } from 'express';
import { z } from 'zod';

z.config(z.locales.es());

export const validarBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
