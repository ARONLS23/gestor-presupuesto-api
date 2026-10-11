import { z } from 'zod';
import { anio, mes, monto } from '../../utils/esquemas.ts';

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
  anio: anio.optional(),
  mes: mes.optional(),
  tipo: z.enum(['INGRESO', 'GASTO', 'AHORRO']).optional(),
  categoriaId: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  orden: z.enum(['fecha_desc', 'fecha_asc', 'monto_desc', 'monto_asc']).default('fecha_desc'),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export const exportarMovimientosSchema = listarMovimientosSchema.omit({ page: true, size: true });

export const totalesMovimientosSchema = listarMovimientosSchema.pick({
  anio: true,
  mes: true,
  tipo: true,
  categoriaId: true,
  q: true,
});

export type CrearMovimientoInput = z.infer<typeof crearMovimientoSchema>;
export type ActualizarMovimientoInput = z.infer<typeof actualizarMovimientoSchema>;
export type FiltrosMovimientos = z.infer<typeof listarMovimientosSchema>;
export type FiltrosTotales = z.infer<typeof totalesMovimientosSchema>;
export type FiltrosExportar = z.infer<typeof exportarMovimientosSchema>;
