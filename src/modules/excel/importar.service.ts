import ExcelJS from 'exceljs';
import { Prisma } from '../../../generated/prisma/client.ts';
import { prisma } from '../../config/prisma.ts';
import { HttpError } from '../../middlewares/errores.ts';
import type { AlcanceImportacion, GuardarImportacion } from './excel.schemas.ts';
import { MESES } from './excel.service.ts';

type FilaExcel = {
  hoja: string;
  fila: number;
  categoria: string;
  subcategoria: string | null;
  montos: string[];
};

type Categoria = Prisma.CategoriaGetPayload<{ include: { subcategorias: true } }>;

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

const PREFIJOS_MES = MESES.map((m) => normalizar(m).slice(0, 3));

// Monto de la celda como texto: números con 2 decimales, vacío si no hay monto y el texto tal cual si no es número
// (así se puede corregir en la vista previa).
function textoMonto(celda: ExcelJS.Cell) {
  const valor = celda.value;
  if (valor === null || valor === undefined || valor === '') return '';
  const numero =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'object' && 'result' in valor && typeof valor.result === 'number'
        ? valor.result
        : null;
  if (numero === null) return celda.text.trim();
  if (numero === 0) return '';
  return numero > 0 ? numero.toFixed(2) : String(numero);
}

// Busca tablas con columna "Categoría" y al menos un mes; lee sus filas hasta "Total" o una fila vacía.
// Devuelve también los meses (0–11) que trae el archivo como columnas.
function leerTablas(libro: ExcelJS.Workbook) {
  const filas: FilaExcel[] = [];
  const meses = new Set<number>();

  libro.eachSheet((hoja) => {
    for (let n = 1; n <= hoja.rowCount; n++) {
      const encabezado = hoja.getRow(n);
      const textos = Array.from({ length: encabezado.cellCount }, (_, i) => normalizar(encabezado.getCell(i + 1).text));
      const columna = (prueba: (t: string) => boolean) => textos.findIndex(prueba) + 1;

      const colCategoria = columna((t) => t === 'categoria');
      const colMeses = PREFIJOS_MES.map((p) => columna((t) => t.startsWith(p)));
      if (!colCategoria || colMeses.every((c) => !c)) continue;
      const colSub = columna((t) => t === 'subcategoria');
      colMeses.forEach((c, m) => c && meses.add(m));

      for (n++; n <= hoja.rowCount; n++) {
        const fila = hoja.getRow(n);
        const categoria = fila.getCell(colCategoria).text.trim();
        if (!categoria || normalizar(categoria) === 'total') break;

        filas.push({
          hoja: hoja.name,
          fila: n,
          categoria,
          subcategoria: colSub ? fila.getCell(colSub).text.trim() || null : null,
          montos: colMeses.map((c) => (c ? textoMonto(fila.getCell(c)) : '')),
        });
      }
    }
  });
  return { filas, meses: [...meses].sort((a, b) => a - b) };
}

function subcategoriaPorDefecto(categoria: Categoria) {
  const activas = categoria.subcategorias.filter((s) => s.activa);
  return activas.find((s) => normalizar(s.nombre) === 'general') ?? (activas.length === 1 ? activas[0] : undefined);
}

// Relaciona la fila con una subcategoría del usuario por nombre. Si la categoría no existe pero hay
// una categoría con el nombre de la subcategoría (ej. "Pagos varios → Ahorro"), usa esa.
function relacionar(fila: FilaExcel, categorias: Categoria[]) {
  const buscar = (nombre: string) => categorias.find((c) => normalizar(c.nombre) === normalizar(nombre));
  const porSubcategoria = fila.subcategoria ? buscar(fila.subcategoria) : undefined;
  const categoria = buscar(fila.categoria) ?? porSubcategoria;

  if (!categoria) return { aviso: `La categoría "${fila.categoria}" no existe` };
  if (!categoria.activa) return { aviso: `La categoría "${categoria.nombre}" está desactivada` };

  const usarPorDefecto = !fila.subcategoria || categoria === porSubcategoria;
  const subcategoria = usarPorDefecto
    ? subcategoriaPorDefecto(categoria)
    : categoria.subcategorias.find((s) => normalizar(s.nombre) === normalizar(fila.subcategoria!));

  if (!subcategoria) {
    return {
      aviso: usarPorDefecto
        ? `La categoría "${categoria.nombre}" tiene varias subcategorías`
        : `La subcategoría "${fila.subcategoria}" no existe en "${categoria.nombre}"`,
    };
  }
  if (!subcategoria.activa) return { aviso: `La subcategoría "${subcategoria.nombre}" está desactivada` };
  return { subcategoriaId: subcategoria.id };
}

// Lee el archivo y devuelve cada fila con la subcategoría que le corresponde (o el aviso de por qué no hay una)
// y sus montos como texto, para revisarlos y corregirlos antes de guardar. No guarda nada.
export async function previaImportacion(usuarioId: string, anio: number, alcance: AlcanceImportacion, archivo: Buffer) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo as unknown as ExcelJS.Buffer);
  } catch {
    throw new HttpError(400, 'El archivo no es un Excel válido (.xlsx)');
  }

  const { filas, meses } = leerTablas(libro);
  if (!filas.length) {
    throw new HttpError(400, 'No se encontraron tablas con columna Categoría y al menos un mes (Ene, Feb, …)');
  }
  if (alcance === 'anual' && meses.length < 12) {
    throw new HttpError(400, 'La plantilla anual debe tener las columnas de Ene a Dic. Para cargar meses sueltos usa la plantilla mensual');
  }

  const categorias = await prisma.categoria.findMany({ where: { usuarioId }, include: { subcategorias: true } });

  return {
    anio,
    alcance,
    meses: meses.map((m) => m + 1),
    filas: filas.map((f) => ({ ...f, subcategoriaId: null, aviso: null, ...relacionar(f, categorias) })),
  };
}

// Guarda las filas revisadas: un movimiento por fila y mes del archivo, incluso con monto 0 (solo en la carga
// masiva; el registro manual exige monto mayor a 0). Solo agrega; no borra ni reemplaza nada.
export async function guardarImportacion(usuarioId: string, { anio, meses, filas }: GuardarImportacion) {
  if (!filas.length) throw new HttpError(400, 'No hay filas para importar');

  const ids = [...new Set(filas.map((f) => f.subcategoriaId))];
  const subcategorias = await prisma.subcategoria.findMany({
    where: { id: { in: ids }, activa: true, categoria: { usuarioId, activa: true } },
    include: { categoria: true },
  });
  if (subcategorias.length !== ids.length) {
    throw new HttpError(400, 'Hay filas con una categoría o subcategoría no válida');
  }

  const data = filas.flatMap((f) => {
    const { categoria } = subcategorias.find((s) => s.id === f.subcategoriaId)!;
    return meses.map((mes) => ({
      usuarioId,
      subcategoriaId: f.subcategoriaId,
      tipo: categoria.tipo,
      fecha: new Date(Date.UTC(anio, mes - 1, 1)),
      descripcion: '',
      monto: new Prisma.Decimal(f.montos[mes - 1] || 0),
    }));
  });

  const { count } = await prisma.movimiento.createMany({ data });
  return { creados: count, meses };
}
