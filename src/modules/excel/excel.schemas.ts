import { z } from 'zod';
import { anio, FORMATO_MONTO, mes } from '../../utils/esquemas.ts';
import { ALCANCES } from '../../utils/fechas.ts';

export const ALCANCES_IMPORTACION = ['anual', 'mensual'] as const;
export type AlcanceImportacion = (typeof ALCANCES_IMPORTACION)[number];

export const exportarSchema = z.object({
  anio,
  mes: mes.default(1),
  alcance: z.enum(ALCANCES).default('anual'),
});

export const plantillaSchema = exportarSchema.extend({ alcance: z.enum(ALCANCES_IMPORTACION) });

export const previaImportacionSchema = z.object({ anio, alcance: z.enum(ALCANCES_IMPORTACION) });

// Filas revisadas en la vista previa: subcategoría elegida y montos de Ene a Dic ("" = sin monto).
export const guardarImportacionSchema = previaImportacionSchema
  .extend({
    meses: z.array(mes).min(1).max(12),
    filas: z
      .array(
        z.object({
          subcategoriaId: z.string().min(1),
          montos: z.array(z.string().trim().refine((v) => !v || FORMATO_MONTO.test(v), 'Monto no válido')).length(12),
        }),
      )
      .max(1000),
  })
  .refine((d) => new Set(d.meses).size === d.meses.length, { message: 'Meses repetidos', path: ['meses'] })
  .refine((d) => d.alcance === 'mensual' || d.meses.length === 12, {
    message: 'La importación anual debe incluir los 12 meses',
    path: ['meses'],
  });

export type GuardarImportacion = z.infer<typeof guardarImportacionSchema>;
