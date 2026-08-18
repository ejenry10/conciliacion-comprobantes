import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { ReporteComprobante } from '../conciliacion/comparador';
import { ComprobanteInterno } from '../types/comprobante';

function asegurarCarpetaHistorial(): void {
  if (!fs.existsSync(env.historialDir)) {
    fs.mkdirSync(env.historialDir, { recursive: true });
  }
}

function escaparCsv(valor: string): string {
  if (valor.includes(',') || valor.includes('"') || valor.includes('\n')) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/**
 * Guarda el resultado de una corrida de conciliacion, fuera de la BD
 * empresarial, en dos archivos dentro de env.historialDir:
 *
 * - consultas.jsonl: log completo, una linea JSON por comprobante
 *   consultado (append-only, sirve para auditoria/debug).
 * - discrepancias.csv: solo las discrepancias encontradas, para abrir
 *   directo en Excel y revisar rapido.
 */
export function registrarCorrida(reportes: ReporteComprobante[]): void {
  asegurarCarpetaHistorial();

  const timestamp = new Date().toISOString();

  const rutaJsonl = path.join(env.historialDir, 'consultas.jsonl');
  const lineasJsonl =
    reportes.map((r) => JSON.stringify({ timestamp, ...r })).join('\n') + '\n';
  fs.appendFileSync(rutaJsonl, lineasJsonl, 'utf-8');

  const discrepancias = reportes.filter((r) => r.resultado === 'DISCREPANCIA');
  if (discrepancias.length === 0) return;

  const rutaCsv = path.join(env.historialDir, 'discrepancias.csv');
  const encabezado =
    'timestamp,ruc,serie,numero,estadoInterno,estadoSunat,tipoDiscrepancia,detalle\n';
  const filas =
    discrepancias
      .map((r) =>
        [
          timestamp,
          r.ruc,
          r.serie,
          r.numero,
          r.estadoInterno,
          r.estadoSunat ?? '',
          r.tipoDiscrepancia ?? '',
          escaparCsv(r.detalle),
        ].join(',')
      )
      .join('\n') + '\n';

  if (!fs.existsSync(rutaCsv)) {
    fs.writeFileSync(rutaCsv, encabezado + filas, 'utf-8');
  } else {
    fs.appendFileSync(rutaCsv, filas, 'utf-8');
  }
}

/**
 * Guarda un CSV con los comprobantes que tu sistema marca como rechazados
 * (estadoInterno = 'R'), junto a su observacionesEnvio, para ver rapido el
 * motivo del rechazo sin tener que consultar SUNAT. Sobrescribe el archivo
 * completo en cada corrida (no es un log acumulativo como los demas).
 */
export function registrarRechazados(comprobantes: ComprobanteInterno[]): void {
  asegurarCarpetaHistorial();

  const rutaCsv = path.join(env.historialDir, 'rechazados.csv');
  const encabezado = 'ruc,serie,numero,fechaEmision,observacionesEnvio\n';
  const filas =
    comprobantes
      .map((c) =>
        [
          c.ruc,
          c.serie,
          c.numero,
          c.fechaEmision.toISOString().slice(0, 10),
          escaparCsv(c.observacionesEnvio ?? ''),
        ].join(',')
      )
      .join('\n') + '\n';

  fs.writeFileSync(rutaCsv, encabezado + filas, 'utf-8');
}