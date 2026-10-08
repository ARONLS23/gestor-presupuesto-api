import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Ingresa un email válido'));

export const registroSchema = z.object({
  nombre: z.string().trim().min(1, 'Ingresa tu nombre').max(100),
  email,
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña no puede superar 72 caracteres'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

export type RegistroInput = z.infer<typeof registroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
