/** Estado del comprobante tal como lo devuelve el servicio oficial de SUNAT (estadoCp), normalizado. */
export type EstadoComprobanteSunat =
  | 'NO_EXISTE'
  | 'ACEPTADO'
  | 'ANULADO'
  | 'AUTORIZADO'
  | 'NO_AUTORIZADO';

export interface ConsultaSunatExitosa {
  ok: true;
  estadoCp: EstadoComprobanteSunat;
  estadoRuc?: string;
  condDomiRuc?: string;
  observaciones?: string[];
}

export interface ConsultaSunatError {
  ok: false;
  message: string;
  errorCode?: string;
}

export type ResultadoConsultaSunat = ConsultaSunatExitosa | ConsultaSunatError;