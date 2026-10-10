import type { RequestHandler } from 'express';
import * as subcategoriasService from './subcategorias.service.ts';

export const crear: RequestHandler = async (req, res) => {
  res.status(201).json(await subcategoriasService.crearSubcategoria(req.usuarioId!, req.body));
};

export const actualizar: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await subcategoriasService.actualizarSubcategoria(req.usuarioId!, req.params.id, req.body));
};

export const eliminar: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await subcategoriasService.eliminarSubcategoria(req.usuarioId!, req.params.id));
};
