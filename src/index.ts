import { obtenerComprobantesParaVerificar } from './db/comprobantesRepository';
import { closeDb } from './db/mongoClient';

declare const process: {
  exitCode?: number;
};

async function main() {
  console.log('Conectando a MongoDB (solo lectura)...');

  try {
    const comprobantes = await obtenerComprobantesParaVerificar();

    console.log(`Comprobantes obtenidos: ${comprobantes.length}\n`);
    for (const c of comprobantes.slice(0, 10)) {
      console.log(
        `${c.serie}-${c.numero} | RUC ${c.ruc} | tipo ${c.tipoComprobante} | estado interno: ${c.estadoInterno} | ${c.fechaEmision.toISOString().slice(0, 10)}`
      );
    }
    if (comprobantes.length > 10) {
      console.log(`... y ${comprobantes.length - 10} mas.`);
    }
  } catch (err) {
    console.error('Error al obtener comprobantes:', err);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main();
