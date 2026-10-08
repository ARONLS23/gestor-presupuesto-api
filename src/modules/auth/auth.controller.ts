import type { RequestHandler } from 'express';
import * as authService from './auth.service.ts';

export const registro: RequestHandler = async (req, res) => {
  res.status(201).json(await authService.registrar(req.body));
};

export const login: RequestHandler = async (req, res) => {
  res.json(await authService.login(req.body));
};

export const me: RequestHandler = async (req, res) => {
  res.json(await authService.obtenerUsuario(req.usuarioId!));
};
