import fs from 'fs';
import { env } from './env';

interface CredencialSunat {
  clientId: string;
  clientSecret: string;
}

let credencialesPorRuc: Record<string, CredencialSunat> | null = null;

function cargarCredenciales(): Record<string, CredencialSunat> {
  if (!fs.existsSync(env.sunatCredentialsPath)) {
    throw new Error(
      `No se encontro el archivo de credenciales SUNAT en "${env.sunatCredentialsPath}". ` +
        `Copia sunat-credenciales.example.json a sunat-credenciales.json y completa tus client_id/client_secret por RUC.`
    );
  }
  const raw = fs.readFileSync(env.sunatCredentialsPath, 'utf-8');
  return JSON.parse(raw) as Record<string, CredencialSunat>;
}

/** Devuelve las credenciales SUNAT (client_id/client_secret) para un RUC dado. */
export function obtenerCredencialesPorRuc(ruc: string): CredencialSunat {
  if (!credencialesPorRuc) {
    credencialesPorRuc = cargarCredenciales();
  }
  const credencial = credencialesPorRuc[ruc];
  if (!credencial) {
    throw new Error(
      `No hay credenciales SUNAT configuradas para el RUC ${ruc} en ${env.sunatCredentialsPath}`
    );
  }
  return credencial;
}