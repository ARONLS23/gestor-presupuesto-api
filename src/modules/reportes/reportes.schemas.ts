import { z } from 'zod';
import { anio, periodoSchema } from '../../utils/esquemas.ts';

export const reporteAnualSchema = z.object({ anio });

export const historicoSchema = periodoSchema.extend({
  meses: z.coerce.number().int().min(1).max(24).default(6),
});
