import { z } from 'zod';
import { anio, periodoSchema } from '../../utils/esquemas.ts';
import { ALCANCES } from '../../utils/fechas.ts';

export const reporteAnualSchema = z.object({ anio });

export const historicoSchema = periodoSchema.extend({
  meses: z.coerce.number().int().min(1).max(24).default(6),
});

export const kpisSchema = periodoSchema.extend({
  alcance: z.enum(ALCANCES).default('mensual'),
});
