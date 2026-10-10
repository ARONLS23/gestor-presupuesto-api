import { z } from 'zod';
import { anio } from '../../utils/esquemas.ts';

export const reporteAnualSchema = z.object({ anio });
