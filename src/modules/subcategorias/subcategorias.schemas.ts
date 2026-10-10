import { z } from 'zod';

const nombre = z.string().trim().min(1, 'Ingresa un nombre').max(50, 'Máximo 50 caracteres');

export const crearSubcategoriaSchema = z.object({
  categoriaId: z.string().min(1, 'Indica la categoría'),
  nombre,
});

export const actualizarSubcategoriaSchema = z.object({
  nombre: nombre.optional(),
  activa: z.boolean().optional(),
});

export type CrearSubcategoriaInput = z.infer<typeof crearSubcategoriaSchema>;
export type ActualizarSubcategoriaInput = z.infer<typeof actualizarSubcategoriaSchema>;
