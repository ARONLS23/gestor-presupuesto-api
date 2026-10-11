import { z } from 'zod';

export const anio = z.coerce.number().int().min(2000).max(2100);
export const mes = z.coerce.number().int().min(1).max(12);

export const periodoSchema = z.object({ anio, mes });
export type Periodo = z.infer<typeof periodoSchema>;

export const monto = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Ingresa un monto mayor a 0 con hasta 2 decimales');
