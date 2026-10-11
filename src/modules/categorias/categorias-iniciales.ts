import { Prisma, TipoMovimiento } from '../../../generated/prisma/client.ts';

const iniciales: { nombre: string; tipo: TipoMovimiento; icono: string; subcategorias: string[] }[] = [
  { nombre: 'Sueldo', tipo: 'INGRESO', icono: 'payments', subcategorias: ['Sueldo mensual', 'Gratificación', 'CTS', 'Bonos'] },
  { nombre: 'Ingresos extra', tipo: 'INGRESO', icono: 'work', subcategorias: ['Trabajos independientes', 'Ventas', 'Utilidades'] },
  { nombre: 'Otros ingresos', tipo: 'INGRESO', icono: 'add_card', subcategorias: ['Intereses', 'Regalos recibidos', 'Otros'] },
  {
    nombre: 'Vivienda',
    tipo: 'GASTO',
    icono: 'home',
    subcategorias: ['Alquiler o hipoteca', 'Luz', 'Agua', 'Gas', 'Internet y teléfono', 'Mantenimiento'],
  },
  { nombre: 'Alimentación', tipo: 'GASTO', icono: 'shopping_cart', subcategorias: ['Supermercado', 'Mercado', 'Restaurantes y delivery'] },
  {
    nombre: 'Transporte',
    tipo: 'GASTO',
    icono: 'directions_car',
    subcategorias: ['Combustible', 'Transporte público y taxi', 'Mantenimiento del vehículo', 'Peajes y estacionamiento'],
  },
  { nombre: 'Salud', tipo: 'GASTO', icono: 'medical_services', subcategorias: ['Consultas', 'Medicinas', 'Seguro de salud'] },
  { nombre: 'Educación', tipo: 'GASTO', icono: 'school', subcategorias: ['Colegio o universidad', 'Cursos', 'Materiales'] },
  {
    nombre: 'Familia',
    tipo: 'GASTO',
    icono: 'family_restroom',
    subcategorias: ['Hijos', 'Apoyo a padres', 'Apoyo a hermanos', 'Cuidado de niños', 'Otros familiares'],
  },
  { nombre: 'Compras personales', tipo: 'GASTO', icono: 'checkroom', subcategorias: ['Ropa y calzado', 'Cuidado personal', 'Tecnología'] },
  { nombre: 'Ocio', tipo: 'GASTO', icono: 'theater_comedy', subcategorias: ['Salidas', 'Viajes', 'Pasatiempos'] },
  { nombre: 'Suscripciones', tipo: 'GASTO', icono: 'subscriptions', subcategorias: ['Streaming', 'Apps y software', 'Gimnasio'] },
  { nombre: 'Deudas', tipo: 'GASTO', icono: 'credit_card', subcategorias: ['Tarjeta de crédito', 'Préstamos'] },
  { nombre: 'Otros gastos', tipo: 'GASTO', icono: 'category', subcategorias: ['Regalos', 'Mascotas', 'Imprevistos'] },
  { nombre: 'Ahorro', tipo: 'AHORRO', icono: 'savings', subcategorias: ['Fondo de emergencia', 'Ahorro general', 'Inversiones'] },
];

export const categoriasIniciales = iniciales.map(
  ({ subcategorias, ...categoria }, orden) =>
    ({
      ...categoria,
      orden,
      subcategorias: { create: subcategorias.map((nombre) => ({ nombre })) },
    }) satisfies Prisma.CategoriaCreateWithoutUsuarioInput,
);
