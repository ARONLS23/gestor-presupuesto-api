import { Prisma, TipoMovimiento } from '../../../generated/prisma/client.ts';

const iniciales: { nombre: string; tipo: TipoMovimiento; icono: string; subcategorias: string[] }[] = [
  { nombre: 'Salarios', tipo: 'INGRESO', icono: 'payments', subcategorias: ['General'] },
  { nombre: 'Utilidades', tipo: 'INGRESO', icono: 'trending_up', subcategorias: ['General'] },
  { nombre: 'Varios', tipo: 'INGRESO', icono: 'add_card', subcategorias: ['General'] },
  { nombre: 'Hogar', tipo: 'GASTO', icono: 'home', subcategorias: ['Pensión'] },
  { nombre: 'Vida diaria', tipo: 'GASTO', icono: 'shopping_cart', subcategorias: ['Comestibles'] },
  { nombre: 'Transporte', tipo: 'GASTO', icono: 'directions_car', subcategorias: ['Gas/combustible'] },
  { nombre: 'Salud', tipo: 'GASTO', icono: 'medical_services', subcategorias: ['Consulta médica'] },
  { nombre: 'Vacaciones', tipo: 'GASTO', icono: 'flight', subcategorias: ['Viajes'] },
  { nombre: 'Ocio', tipo: 'GASTO', icono: 'theater_comedy', subcategorias: ['Salidas/Ropa'] },
  { nombre: 'Cuotas/suscripciones', tipo: 'GASTO', icono: 'subscriptions', subcategorias: ['Servicios'] },
  { nombre: 'Ahorros', tipo: 'AHORRO', icono: 'savings', subcategorias: ['General'] },
];

export const categoriasIniciales = iniciales.map(
  ({ subcategorias, ...categoria }, orden) =>
    ({
      ...categoria,
      orden,
      subcategorias: { create: subcategorias.map((nombre) => ({ nombre })) },
    }) satisfies Prisma.CategoriaCreateWithoutUsuarioInput,
);
