import { z } from 'zod';

export const reporteAnualSchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100),
});
