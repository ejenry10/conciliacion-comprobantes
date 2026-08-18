import { Filter, Document } from 'mongodb';
import { obtenerComprobantesParaVerificar } from '../db/comprobantesRepository';
import { consultarComprobanteEnSunat } from '../sunat/sunatClient';
import { conciliar, ReporteComprobante } from './comparador';
import { registrarCorrida } from '../historial/historialStore';

const ESPERA_ENTRE_CONSULTAS_MS = 300;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ResumenConciliacion {
  revisados: number;
  coincidentes: number;
  discrepancias: number;
  errores: number;
  noVerificables: number;
}

export interface ResultadoEjecucion {
  resumen: ResumenConciliacion;
  reportes: ReporteComprobante[];
}

/**
 * Flujo completo: Mongo (lectura) -> SUNAT (consulta) -> comparacion ->
 * historial. Compartido entre los scripts de prueba y la API para Make,
 * para no duplicar esta logica.
 */
export async function ejecutarConciliacion(
  filtro: Filter<Document>,
  tamanoMuestra: number
): Promise<ResultadoEjecucion> {
  const comprobantes = await obtenerComprobantesParaVerificar(filtro);
  const muestra = comprobantes.slice(0, tamanoMuestra);

  const reportes: ReporteComprobante[] = [];
  for (const c of muestra) {
    const consulta = await consultarComprobanteEnSunat(c);
    reportes.push(conciliar(c, consulta));
    await esperar(ESPERA_ENTRE_CONSULTAS_MS);
  }

  registrarCorrida(reportes);

  const resumen: ResumenConciliacion = {
    revisados: reportes.length,
    coincidentes: reportes.filter((r) => r.resultado === 'COINCIDE').length,
    discrepancias: reportes.filter((r) => r.resultado === 'DISCREPANCIA').length,
    errores: reportes.filter((r) => r.resultado === 'ERROR_CONSULTA').length,
    noVerificables: reportes.filter((r) => r.resultado === 'NO_VERIFICABLE').length,
  };

  return { resumen, reportes };
}