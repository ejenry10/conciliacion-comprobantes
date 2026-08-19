// Peru es UTC-5: hora UTC = hora local + 5. Los Date guardados en Mongo son
// UTC real, asi que para calcular "un dia calendario en Peru" hay que
// desplazar los limites 5 horas, no usar medianoche UTC tal cual.
const PERU_UTC_OFFSET_HORAS = 5;

/** Convierte YYYY-MM-DD (interpretado como dia calendario en Peru) al inicio de ese dia, en UTC. */
export function inicioDiaPeruUTC(fechaYYYYMMDD: string, nombreCampo: string): Date {
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
export function finDiaPeruUTC(fechaYYYYMMDD: string, nombreCampo: string): Date {
  const inicio = inicioDiaPeruUTC(fechaYYYYMMDD, nombreCampo);
  return new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** "Hoy" segun hora de Peru (no UTC), como YYYY-MM-DD. */
export function fechaHoyPeru(): string {
  const ahoraLocal = new Date(Date.now() - PERU_UTC_OFFSET_HORAS * 60 * 60 * 1000);
  return ahoraLocal.toISOString().slice(0, 10);
}

/** Fecha de ayer segun hora de Peru, como YYYY-MM-DD. */
export function fechaDeAyer(): string {
  return fechaHaceNDias(1);
}

/** Fecha de hace N dias (hora Peru), como YYYY-MM-DD. */
export function fechaHaceNDias(n: number): string {
  const hoy = new Date(`${fechaHoyPeru()}T00:00:00.000Z`);
  hoy.setUTCDate(hoy.getUTCDate() - n);
  return hoy.toISOString().slice(0, 10);
}