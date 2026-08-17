import { ComprobanteInterno } from '../types/comprobante';
import { obtenerTokenParaRuc } from './tokenManager';
import { obtenerCodigoSunat } from './tipoComprobanteMap';
import { obtenerCredencialesPorRuc } from '../config/sunatCredentials';
import { ResultadoConsultaSunat, EstadoComprobanteSunat } from './types';

const CONSULTA_URL_BASE = 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes';

/** Mapeo oficial de estadoCp segun el manual de SUNAT. */
const ESTADO_CP_MAP: Record<string, EstadoComprobanteSunat> = {
  '0': 'NO_EXISTE',
  '1': 'ACEPTADO',
  '2': 'ANULADO',
  '3': 'AUTORIZADO',
  '4': 'NO_AUTORIZADO',
};

const MAX_REINTENTOS = 3;
const ESPERA_BASE_MS = 1000;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatearFechaSunat(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = fecha.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

interface RespuestaSunat {
  success: boolean;
  message: string;
  data?: {
    estadoCp: number | string;
    estadoRuc?: string;
    condDomiRuc?: string;
    Observaciones?: string[];
  };
  errorCode?: string;
}

/**
 * Consulta un comprobante contra el servicio oficial de SUNAT.
 * Reintenta con backoff simple ante errores de red o respuestas 429/5xx
 * (transitorios). Un 4xx que no sea 429 no se reintenta: es un error de
 * los datos enviados, no de disponibilidad del servicio.
 */
export async function consultarComprobanteEnSunat(
  comprobante: ComprobanteInterno
): Promise<ResultadoConsultaSunat> {
  let codComp: string;
  try {
    codComp = obtenerCodigoSunat(comprobante.tipoComprobante);
  } catch (err) {
    // No es un error transitorio de red, no tiene sentido reintentar.
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Tipo de comprobante no mapeado',
    };
  }

  // Fallar rapido si no hay credenciales para este RUC, en vez de
  // reintentar 3 veces algo que nunca va a funcionar.
  try {
    obtenerCredencialesPorRuc(comprobante.ruc);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Sin credenciales SUNAT para este RUC',
    };
  }

  // El monto es obligatorio para comprobantes electronicos. Sin el, SUNAT
  // va a rechazar la consulta de todos modos - mejor fallar rapido y claro.
  if (comprobante.importeTotal === null) {
    return {
      ok: false,
      message: `Comprobante sin importeTotal (campo ${comprobante.serie}-${comprobante.numero}), no se puede consultar sin monto.`,
    };
  }

  let ultimoError: unknown;

  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    try {
      const token = await obtenerTokenParaRuc(comprobante.ruc);

      const response = await fetch(
        `${CONSULTA_URL_BASE}/${comprobante.ruc}/validarcomprobante`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            numRuc: comprobante.ruc,
            codComp,
            numeroSerie: comprobante.serie,
            numero: comprobante.numero,
            fechaEmision: formatearFechaSunat(comprobante.fechaEmision),
            monto: comprobante.importeTotal ?? undefined,
          }),
        }
      );

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`SUNAT respondio HTTP ${response.status} (reintentable)`);
      }

      const data = (await response.json()) as RespuestaSunat;

      if (!data.success || !data.data) {
        // Esto es una respuesta valida de SUNAT diciendo que algo esta mal
        // con la consulta (no es un error de red), asi que no reintentamos.
        return { ok: false, message: data.message, errorCode: data.errorCode };
      }

      const estadoCp = ESTADO_CP_MAP[String(data.data.estadoCp)];
      if (!estadoCp) {
        return {
          ok: false,
          message: `Estado de comprobante desconocido devuelto por SUNAT: ${data.data.estadoCp}`,
        };
      }

      return {
        ok: true,
        estadoCp,
        estadoRuc: data.data.estadoRuc,
        condDomiRuc: data.data.condDomiRuc,
        observaciones: data.data.Observaciones,
      };
    } catch (err) {
      ultimoError = err;
      if (intento < MAX_REINTENTOS) {
        await esperar(ESPERA_BASE_MS * intento);
      }
    }
  }

  return {
    ok: false,
    message:
      ultimoError instanceof Error
        ? ultimoError.message
        : 'Error desconocido consultando SUNAT',
  };
}