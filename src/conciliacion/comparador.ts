import { ComprobanteInterno } from '../types/comprobante';
import { ResultadoConsultaSunat, EstadoComprobanteSunat } from '../sunat/types';

export type ResultadoConciliacion =
  | 'COINCIDE'
  | 'DISCREPANCIA'
  | 'ERROR_CONSULTA'
  | 'NO_VERIFICABLE';

export type TipoDiscrepancia =
  | 'ESTADO_DIFERENTE'
  | 'ANULACION_NO_PROCESADA'
  | 'RECHAZO_NO_REGISTRADO'
  | 'CDR_NO_PROCESADO'
  | 'OTRO';

export interface ReporteComprobante {
  ruc: string;
  serie: string;
  numero: string;
  estadoInterno: string;
  estadoSunat: EstadoComprobanteSunat | null;
  resultado: ResultadoConciliacion;
  tipoDiscrepancia?: TipoDiscrepancia;
  detalle: string;
}

function base(comprobante: ComprobanteInterno) {
  return {
    ruc: comprobante.ruc,
    serie: comprobante.serie,
    numero: comprobante.numero,
    estadoInterno: comprobante.estadoInterno,
  };
}

/**
 * Compara el estado interno (A/R/P/B) contra el estado real de SUNAT y
 * clasifica el resultado.
 *
 * SUPUESTO A VALIDAR: SUNAT no tiene un codigo explicito de "rechazado"
 * para comprobantes electronicos (los codigos son NO_EXISTE / ACEPTADO /
 * ANULADO / AUTORIZADO / NO_AUTORIZADO). Se asume que un comprobante
 * rechazado en el envio nunca queda registrado como valido, por lo que la
 * consulta deberia devolver NO_EXISTE. Si tienes un comprobante que sepas
 * con certeza que fue rechazado por SUNAT, consultalo y confirma que
 * efectivamente devuelve NO_EXISTE — si devuelve otra cosa, hay que ajustar
 * el caso 'R' de abajo.
 */
export function conciliar(
  comprobante: ComprobanteInterno,
  consulta: ResultadoConsultaSunat
): ReporteComprobante {
  if (!consulta.ok) {
    return {
      ...base(comprobante),
      estadoSunat: null,
      resultado: 'ERROR_CONSULTA',
      detalle: consulta.message,
    };
  }

  const { estadoCp } = consulta;
  const esValidoEnSunat = estadoCp === 'ACEPTADO' || estadoCp === 'AUTORIZADO';
  const noRegistradoEnSunat = estadoCp === 'NO_EXISTE' || estadoCp === 'NO_AUTORIZADO';

  switch (comprobante.estadoInterno) {
    case 'A':
      if (esValidoEnSunat) {
        return { ...base(comprobante), estadoSunat: estadoCp, resultado: 'COINCIDE', detalle: 'OK' };
      }
      if (estadoCp === 'ANULADO') {
        return {
          ...base(comprobante),
          estadoSunat: estadoCp,
          resultado: 'DISCREPANCIA',
          tipoDiscrepancia: 'ESTADO_DIFERENTE',
          detalle: 'Tu sistema lo marca como aceptado, pero SUNAT lo tiene como anulado.',
        };
      }
      return {
        ...base(comprobante),
        estadoSunat: estadoCp,
        resultado: 'DISCREPANCIA',
        tipoDiscrepancia: 'CDR_NO_PROCESADO',
        detalle: `Tu sistema lo marca como aceptado, pero SUNAT dice ${estadoCp} (posible CDR no procesado).`,
      };

    case 'R':
      if (noRegistradoEnSunat) {
        return { ...base(comprobante), estadoSunat: estadoCp, resultado: 'COINCIDE', detalle: 'OK' };
      }
      if (esValidoEnSunat) {
        return {
          ...base(comprobante),
          estadoSunat: estadoCp,
          resultado: 'DISCREPANCIA',
          tipoDiscrepancia: 'RECHAZO_NO_REGISTRADO',
          detalle: 'Tu sistema lo marca como rechazado, pero SUNAT lo tiene como valido.',
        };
      }
      return {
        ...base(comprobante),
        estadoSunat: estadoCp,
        resultado: 'DISCREPANCIA',
        tipoDiscrepancia: 'OTRO',
        detalle: `Tu sistema lo marca como rechazado, pero SUNAT dice ${estadoCp}.`,
      };

    case 'B':
      if (estadoCp === 'ANULADO') {
        return { ...base(comprobante), estadoSunat: estadoCp, resultado: 'COINCIDE', detalle: 'OK' };
      }
      if (esValidoEnSunat) {
        return {
          ...base(comprobante),
          estadoSunat: estadoCp,
          resultado: 'DISCREPANCIA',
          tipoDiscrepancia: 'ANULACION_NO_PROCESADA',
          detalle: 'Tu sistema lo marca como dado de baja, pero SUNAT todavia lo considera valido.',
        };
      }
      return {
        ...base(comprobante),
        estadoSunat: estadoCp,
        resultado: 'DISCREPANCIA',
        tipoDiscrepancia: 'OTRO',
        detalle: `Tu sistema lo marca como dado de baja, pero SUNAT dice ${estadoCp}.`,
      };

    case 'P':
      if (estadoCp === 'NO_EXISTE') {
        return { ...base(comprobante), estadoSunat: estadoCp, resultado: 'COINCIDE', detalle: 'OK' };
      }
      return {
        ...base(comprobante),
        estadoSunat: estadoCp,
        resultado: 'DISCREPANCIA',
        tipoDiscrepancia: 'ESTADO_DIFERENTE',
        detalle: `Tu sistema lo marca como pendiente, pero SUNAT ya tiene una respuesta: ${estadoCp}.`,
      };

    default:
      return {
        ...base(comprobante),
        estadoSunat: estadoCp,
        resultado: 'NO_VERIFICABLE',
        detalle: `Estado interno desconocido: "${comprobante.estadoInterno}".`,
      };
  }
}