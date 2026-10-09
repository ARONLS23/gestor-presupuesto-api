import { hash } from 'bcryptjs';
import { prisma } from '../src/config/prisma.ts';
import { categoriasIniciales } from '../src/modules/categorias/categorias-iniciales.ts';

const EMAIL = 'aron@example.com';
const PASSWORD = 'MiClave123';

let semilla = 42;
const aleatorio = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
const entre = (min: number, max: number) => (min + aleatorio() * (max - min)).toFixed(2);

type Plantilla = { sub: string; descripcion: string; monto: () => string; dia: number; meses?: number[] };

const plantillas: Plantilla[] = [
  { sub: 'Salarios', descripcion: 'Sueldo mensual', monto: () => '4200.00', dia: 1 },
  { sub: 'Utilidades', descripcion: 'Reparto de utilidades', monto: () => '3500.00', dia: 15, meses: [4] },
  { sub: 'Varios', descripcion: 'Trabajo freelance', monto: () => entre(300, 900), dia: 20, meses: [1, 3, 6, 9, 11] },
  { sub: 'Pensión', descripcion: 'Pensión del departamento', monto: () => '1200.00', dia: 5 },
  { sub: 'Comestibles', descripcion: 'Supermercado', monto: () => entre(150, 320), dia: 7 },
  { sub: 'Comestibles', descripcion: 'Mercado', monto: () => entre(80, 180), dia: 21 },
  { sub: 'Gas/combustible', descripcion: 'Combustible', monto: () => entre(120, 220), dia: 10 },
  { sub: 'Consulta médica', descripcion: 'Consulta médica', monto: () => entre(80, 250), dia: 18, meses: [2, 5, 8, 11] },
  { sub: 'Viajes', descripcion: 'Viaje de vacaciones', monto: () => entre(1200, 2500), dia: 12, meses: [1, 7] },
  { sub: 'Salidas/Ropa', descripcion: 'Salidas y ropa', monto: () => entre(100, 400), dia: 25 },
  { sub: 'Servicios', descripcion: 'Luz, agua e internet', monto: () => entre(220, 290), dia: 8 },
  { sub: 'Ahorros', descripcion: 'Ahorro mensual', monto: () => '600.00', dia: 2 },
];

async function obtenerUsuario() {
  const existente = await prisma.usuario.findUnique({ where: { email: EMAIL } });
  if (existente) return existente;

  return prisma.usuario.create({
    data: { nombre: 'Aron', email: EMAIL, passwordHash: await hash(PASSWORD, 12) },
  });
}

async function main() {
  const usuario = await obtenerUsuario();

  if (await prisma.movimiento.count({ where: { usuarioId: usuario.id } })) {
    console.log(`${EMAIL} ya tiene movimientos; no se modifica nada.`);
    return;
  }

  if (!(await prisma.categoria.count({ where: { usuarioId: usuario.id } }))) {
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { categorias: { create: categoriasIniciales } },
    });
  }

  const categorias = await prisma.categoria.findMany({
    where: { usuarioId: usuario.id },
    include: { subcategorias: true },
  });
  const subcategorias = new Map(
    categorias.flatMap((c) =>
      c.subcategorias.map((s) => [c.tipo === 'GASTO' ? s.nombre : c.nombre, { id: s.id, tipo: c.tipo }] as const),
    ),
  );

  const hoy = new Date();
  const movimientos = [];
  for (let i = 11; i >= 0; i--) {
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const anio = inicioMes.getFullYear();
    const mes = inicioMes.getMonth() + 1;

    for (const p of plantillas) {
      if (p.meses && !p.meses.includes(mes)) continue;
      const sub = subcategorias.get(p.sub);
      if (!sub) continue;
      movimientos.push({
        usuarioId: usuario.id,
        subcategoriaId: sub.id,
        tipo: sub.tipo,
        fecha: new Date(Date.UTC(anio, mes - 1, p.dia)),
        descripcion: p.descripcion,
        monto: p.monto(),
      });
    }
  }

  await prisma.movimiento.createMany({ data: movimientos });
  console.log(`Usuario: ${EMAIL}`);
  console.log(`Movimientos creados: ${movimientos.length}`);
}

await main();
await prisma.$disconnect();
