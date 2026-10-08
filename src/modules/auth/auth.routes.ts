import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import { validarBody } from '../../middlewares/validar.ts';
import * as authController from './auth.controller.ts';
import { loginSchema, registroSchema } from './auth.schemas.ts';

export const authRouter = Router();

authRouter.post('/registro', validarBody(registroSchema), authController.registro);
authRouter.post('/login', validarBody(loginSchema), authController.login);
authRouter.get('/me', requireAuth, authController.me);
