import { rateLimit, type Options, type Store } from 'express-rate-limit';
import { prisma } from '../config/prisma.ts';

// Guarda el conteo en la base para que se comparta entre todas las instancias de la API.
class IntentosEnBase implements Store {
  localKeys = false;
  private ventanaMs = 0;

  init(opciones: Options) {
    this.ventanaMs = opciones.windowMs;
  }

  // Las fechas se guardan en UTC, como el resto de fechas de Prisma.
  async increment(clave: string) {
    const segundos = this.ventanaMs / 1000;
    const [fila] = await prisma.$queryRaw<{ intentos: number; reiniciaEn: Date }[]>`
      INSERT INTO "IntentoLogin" ("clave", "intentos", "reiniciaEn")
      VALUES (${clave}, 1, timezone('utc', now()) + make_interval(secs => ${segundos}))
      ON CONFLICT ("clave") DO UPDATE SET
        "intentos" = CASE WHEN "IntentoLogin"."reiniciaEn" <= timezone('utc', now()) THEN 1 ELSE "IntentoLogin"."intentos" + 1 END,
        "reiniciaEn" = CASE WHEN "IntentoLogin"."reiniciaEn" <= timezone('utc', now())
          THEN timezone('utc', now()) + make_interval(secs => ${segundos}) ELSE "IntentoLogin"."reiniciaEn" END
      RETURNING "intentos", "reiniciaEn"`;
    return { totalHits: fila!.intentos, resetTime: fila!.reiniciaEn };
  }

  async decrement(clave: string) {
    await prisma.intentoLogin.updateMany({ where: { clave, intentos: { gt: 0 } }, data: { intentos: { decrement: 1 } } });
  }

  async resetKey(clave: string) {
    await prisma.intentoLogin.deleteMany({ where: { clave } });
  }
}

// Intentos fallidos de login por email. Se cuenta por email y no por IP porque todas las
// peticiones llegan desde el servidor de Next.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => String(req.body?.email ?? ''),
  store: new IntentosEnBase(),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' },
});
