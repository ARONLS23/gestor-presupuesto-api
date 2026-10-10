import { z } from 'zod';

const monto = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Ingresa un monto mayor a 0 con hasta 2 decimales');
const textoOpcional = z.string().trim().max(100).nullable().optional();

export const crearMovimientoSchema = z.object({
  subcategoriaId: z.string().min(1, 'Elige una subcategoría'),
  fecha: z.iso.date('Ingresa una fecha válida (AAAA-MM-DD)'),
  descripcion: z.string().trim().min(1, 'Ingresa una descripción').max(150),
  monto,
  comercio: textoOpcional,
  cuenta: textoOpcional,
  notas: z.string().trim().max(500).nullable().optional(),
});

export const actualizarMovimientoSchema = crearMovimientoSchema.partial();

export const listarMovimientosSchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  tipo: z.enum(['INGRESO', 'GASTO', 'AHORRO']).optional(),
  categoriaId: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  orden: z.enum(['fecha_desc', 'fecha_asc', 'monto_desc', 'monto_asc']).default('fecha_desc'),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export type CrearMovimientoInput = z.infer<typeof crearMovimientoSchema>;
export type ActualizarMovimientoInput = z.infer<typeof actualizarMovimientoSchema>;
export type FiltrosMovimientos = z.infer<typeof listarMovimientosSchema>;
