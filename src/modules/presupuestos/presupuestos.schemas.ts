import { z } from 'zod';
import { anio, mes, monto } from '../../utils/esquemas.ts';

export const periodoSchema = z.object({ anio, mes });

export const guardarPresupuestosSchema = periodoSchema.extend({
  limites: z
    .array(z.object({ categoriaId: z.string().min(1), limite: monto.nullable() }))
    .min(1, 'Indica al menos un límite'),
});

export type Periodo = z.infer<typeof periodoSchema>;
export type GuardarPresupuestosInput = z.infer<typeof guardarPresupuestosSchema>;
