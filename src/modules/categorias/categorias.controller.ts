import type { RequestHandler } from 'express';
import * as categoriasService from './categorias.service.ts';

export const listar: RequestHandler = async (req, res) => {
  res.json(await categoriasService.listarCategorias(req.usuarioId!));
};
