import { obtenerComprobantesParaVerificar } from './db/comprobantesRepository';
import { closeDb } from './db/mongoClient';
import { registrarRechazados } from './historial/historialStore';
import { fieldMapping } from './config/fieldMapping';

/**
 * Este reporte NO consulta SUNAT: solo lista lo que tu sistema ya marco
 * como rechazado (estadoInterno = 'R'), junto al motivo guardado en
 * observacionesEnvio. Util para revisar por que no se enviaron sin gastar
 * cupo de consultas a SUNAT.
 */
async function main() {
  console.log('Buscando comprobantes rechazados en MongoDB...');

  const filtro = { [fieldMapping.estadoInterno]: 'R' };
  const rechazados = await obtenerComprobantesParaVerificar(filtro);

  console.log(`Encontrados: ${rechazados.length}\n`);
  for (const c of rechazados.slice(0, 10)) {
    console.log(
      `${c.serie}-${c.numero} | RUC ${c.ruc} | motivo: ${c.observacionesEnvio ?? '(sin observacion)'}`
    );
  }
  if (rechazados.length > 10) {
    console.log(`... y ${rechazados.length - 10} mas (ver historial/rechazados.csv).`);
  }

  registrarRechazados(rechazados);

  await closeDb();
}

main().catch(async (err) => {
  console.error('Error generando el reporte de rechazados:', err);
  await closeDb();
  process.exitCode = 1;
});