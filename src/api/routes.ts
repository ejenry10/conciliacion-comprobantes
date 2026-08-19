import { Router, Request, Response } from 'express';
import { Filter, Document } from 'mongodb';
import { obtenerComprobantesParaVerificar } from '../db/comprobantesRepository';
import { ejecutarConciliacion } from '../conciliacion/ejecutarConciliacion';
import { fieldMapping } from '../config/fieldMapping';

export const router = Router();

// Tope duro: aunque Make (o un error) pida mas, nunca disparamos mas de
// esto en una sola llamada. Protege el cupo de consultas a SUNAT.
const LIMITE_MAX_VERIFICAR = 200;

// Peru es UTC-5: hora UTC = hora local + 5. Los Date guardados en Mongo son
// UTC real, asi que para calcular "el dia de ayer en hora de Peru" hay que
// desplazar los limites 5 horas, no usar medianoche UTC tal cual.
const PERU_UTC_OFFSET_HORAS = 5;

/** Convierte YYYY-MM-DD (interpretado como dia calendario en Peru) al inicio de ese dia, en UTC. */
function inicioDiaPeruUTC(fechaYYYYMMDD: string, nombreCampo: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYYYYMMDD)) {
    throw new Error(`${nombreCampo} debe tener formato YYYY-MM-DD`);
  }
  const fecha = new Date(`${fechaYYYYMMDD}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`${nombreCampo} no es una fecha valida`);
  }
  fecha.setUTCHours(fecha.getUTCHours() + PERU_UTC_OFFSET_HORAS);
  return fecha;
}

/** Fin de ese mismo dia calendario en Peru (23:59:59.999 local), en UTC. */
function finDiaPeruUTC(fechaYYYYMMDD: string, nombreCampo: string): Date {
  const inicio = inicioDiaPeruUTC(fechaYYYYMMDD, nombreCampo);
  return new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** "Hoy" segun hora de Peru (no UTC), como YYYY-MM-DD. */
function fechaHoyPeru(): string {
  const ahoraLocal = new Date(Date.now() - PERU_UTC_OFFSET_HORAS * 60 * 60 * 1000);
  return ahoraLocal.toISOString().slice(0, 10);
}

/** Fecha de ayer segun hora de Peru, como YYYY-MM-DD. */
function fechaDeAyer(): string {
  const hoy = new Date(`${fechaHoyPeru()}T00:00:00.000Z`);
  hoy.setUTCDate(hoy.getUTCDate() - 1);
  return hoy.toISOString().slice(0, 10);
}

/**
 * GET /api/conciliacion/pendientes?ruc=20600565321,20603618816&limit=50
 * Solo lee Mongo, no llama a SUNAT. Util para que Make vea cuantos hay
 * antes de decidir si dispara la verificacion.
 */
router.get('/api/conciliacion/pendientes', async (req: Request, res: Response) => {
  try {
    const rucsParam = typeof req.query.ruc === 'string' ? req.query.ruc : undefined;
    const limitParam =
      typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    if (limitParam !== undefined && (!Number.isFinite(limitParam) || limitParam <= 0)) {
      res.status(400).json({ error: 'limit debe ser un numero positivo' });
      return;
    }

    const filtro = rucsParam
      ? { [fieldMapping.ruc]: { $in: rucsParam.split(',').map((r) => r.trim()) } }
      : {};

    const comprobantes = await obtenerComprobantesParaVerificar(filtro);
    const limitados = limitParam ? comprobantes.slice(0, limitParam) : comprobantes;

    res.json({
      total: limitados.length,
      comprobantes: limitados.map((c) => ({
        ruc: c.ruc,
        tipoComprobante: c.tipoComprobante,
        serie: c.serie,
        numero: c.numero,
        fechaEmision: c.fechaEmision.toISOString().slice(0, 10),
        estadoInterno: c.estadoInterno,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' });
  }
});

/**
 * POST /api/conciliacion/verificar
 * body: {
 *   "rucs": ["20600565321"],       // opcional, default: todos con credenciales
 *   "limit": 50,                    // opcional, tope duro 200
 *   "fechaDesde": "2026-08-17",     // opcional, YYYY-MM-DD
 *   "fechaHasta": "2026-08-17",     // opcional, YYYY-MM-DD (incluye todo ese dia)
 *   "diaAnterior": true             // opcional, atajo: equivale a fechaDesde=fechaHasta=ayer
 * }
 * Ejecuta el flujo completo: Mongo -> SUNAT -> comparacion -> historial.
 */
router.post('/api/conciliacion/verificar', async (req: Request, res: Response) => {
  try {
    const { rucs, limit, fechaDesde, fechaHasta, diaAnterior } = req.body ?? {};

    if (
      rucs !== undefined &&
      (!Array.isArray(rucs) || rucs.some((r: unknown) => typeof r !== 'string'))
    ) {
      res.status(400).json({ error: 'rucs debe ser un arreglo de strings' });
      return;
    }
    if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
      res.status(400).json({ error: 'limit debe ser un numero positivo' });
      return;
    }
    if (diaAnterior !== undefined && typeof diaAnterior !== 'boolean') {
      res.status(400).json({ error: 'diaAnterior debe ser true o false' });
      return;
    }

    const tamanoMuestra = Math.min(limit ?? LIMITE_MAX_VERIFICAR, LIMITE_MAX_VERIFICAR);

    const condiciones: Filter<Document>[] = [];

    if (Array.isArray(rucs) && rucs.length > 0) {
      condiciones.push({ [fieldMapping.ruc]: { $in: rucs } });
    }

    // "diaAnterior" es un atajo; si ademas mandan fechaDesde/fechaHasta
    // explicitos, esos tienen prioridad.
    const desdeStr = fechaDesde ?? (diaAnterior ? fechaDeAyer() : undefined);
    const hastaStr = fechaHasta ?? (diaAnterior ? fechaDeAyer() : undefined);

    if (desdeStr || hastaStr) {
      const rangoFecha: Record<string, Date> = {};
      if (desdeStr) rangoFecha.$gte = inicioDiaPeruUTC(desdeStr, 'fechaDesde');
      if (hastaStr) rangoFecha.$lte = finDiaPeruUTC(hastaStr, 'fechaHasta');
      condiciones.push({ [fieldMapping.fechaEmision]: rangoFecha });
    }

    const filtro: Filter<Document> = condiciones.length > 0 ? { $and: condiciones } : {};

    const resultado = await ejecutarConciliacion(filtro, tamanoMuestra);

    res.json({
      resumen: resultado.resumen,
      discrepancias: resultado.reportes
        .filter((r) => r.resultado === 'DISCREPANCIA')
        .map((r) => ({
          ruc: r.ruc,
          serie: r.serie,
          numero: r.numero,
          estadoInterno: r.estadoInterno,
          estadoSunat: r.estadoSunat,
          tipoDiscrepancia: r.tipoDiscrepancia,
          detalle: r.detalle,
        })),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Error interno' });
  }
});