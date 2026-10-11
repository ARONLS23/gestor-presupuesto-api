import { rateLimit } from 'express-rate-limit';

// Intentos fallidos de login por email. Se cuenta por email y no por IP porque todas las
// peticiones llegan desde el servidor de Next.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => String(req.body?.email ?? ''),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' },
});
