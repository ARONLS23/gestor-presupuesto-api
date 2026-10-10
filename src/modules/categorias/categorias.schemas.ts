import { z } from 'zod';

const nombre = z.string().trim().min(1, 'Ingresa un nombre').max(50, 'Máximo 50 caracteres');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color en formato #RRGGBB');
const icono = z.string().trim().min(1).max(50);

export const crearCategoriaSchema = z.object({
  nombre,
  tipo: z.enum(['INGRESO', 'GASTO', 'AHORRO'], 'Elige un tipo válido'),
  icono: icono.optional(),
  color: color.optional(),
  subcategorias: z.array(nombre).min(1).optional(),
});

export const actualizarCategoriaSchema = z.object({
  nombre: nombre.optional(),
  icono: icono.nullable().optional(),
  color: color.nullable().optional(),
  orden: z.number().int().min(0).optional(),
  activa: z.boolean().optional(),
});

export type CrearCategoriaInput = z.infer<typeof crearCategoriaSchema>;
export type ActualizarCategoriaInput = z.infer<typeof actualizarCategoriaSchema>;
