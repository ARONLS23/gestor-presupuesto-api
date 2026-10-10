import type { RequestHandler } from 'express';
import * as categoriasService from './categorias.service.ts';

export const listar: RequestHandler = async (req, res) => {
  res.json(await categoriasService.listarCategorias(req.usuarioId!));
};

export const crear: RequestHandler = async (req, res) => {
  res.status(201).json(await categoriasService.crearCategoria(req.usuarioId!, req.body));
};

export const actualizar: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await categoriasService.actualizarCategoria(req.usuarioId!, req.params.id, req.body));
};

export const eliminar: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await categoriasService.eliminarCategoria(req.usuarioId!, req.params.id));
};
