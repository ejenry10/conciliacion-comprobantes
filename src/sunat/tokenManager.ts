import { obtenerCredencialesPorRuc } from '../config/sunatCredentials';

interface TokenCacheEntry {
  accessToken: string;
  /** epoch ms en el que debemos considerar el token vencido (con margen). */
  expiraEn: number;
}

const cache = new Map<string, TokenCacheEntry>();

const TOKEN_URL_BASE = 'https://api-seguridad.sunat.gob.pe/v1/clientesextranet';
const SCOPE = 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes';

// Renovamos el token 60s antes de que expire realmente, para no arriesgarnos
// a que expire a mitad de una consulta.
const MARGEN_EXPIRACION_MS = 60_000;

/**
 * Devuelve un access_token valido para el RUC dado, generando uno nuevo
 * via OAu2 (client_credentials) solo si no hay uno en cache o ya vencio.
 */
export async function obtenerTokenParaRuc(ruc: string): Promise<string> {
  const cacheado = cache.get(ruc);
  if (cacheado && cacheado.expiraEn > Date.now()) {
    return cacheado.accessToken;
  }

  const { clientId, clientSecret } = obtenerCredencialesPorRuc(ruc);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: SCOPE,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(`${TOKEN_URL_BASE}/${clientId}/oauth2/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const textoError = await response.text();
    throw new Error(
      `Error al generar token SUNAT para RUC ${ruc} (HTTP ${response.status}): ${textoError}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };

  cache.set(ruc, {
    accessToken: data.access_token,
    expiraEn: Date.now() + data.expires_in * 1000 - MARGEN_EXPIRACION_MS,
  });

  return data.access_token;
}