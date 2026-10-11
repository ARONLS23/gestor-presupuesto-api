import { z } from 'zod';
import { monto, periodoSchema } from '../../utils/esquemas.ts';

export const guardarPresupuestosSchema = periodoSchema.extend({
  limites: z
    .array(z.object({ categoriaId: z.string().min(1), limite: monto.nullable() }))
    .min(1, 'Indica al menos un límite'),
});

export type GuardarPresupuestosInput = z.infer<typeof guardarPresupuestosSchema>;
