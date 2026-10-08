import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Variables de entorno inválidas:\n' + z.prettifyError(result.error));
  process.exit(1);
}

export const env = result.data;
