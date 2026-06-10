/**
 * Convierte la respuesta de error de Zoho CRM en un mensaje legible para la UI.
 */
export function formatZohoApiErrorPayload(payload: unknown): string {
  if (!payload) {
    return 'Error desconocido en Zoho CRM';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload !== 'object') {
    return String(payload);
  }

  const body = payload as { data?: unknown[]; message?: string };
  const items = Array.isArray(body.data) ? body.data : null;

  if (items && items.length > 0) {
    return items
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return String(item);
        }
        const err = item as {
          code?: string;
          message?: string;
          details?: { api_name?: string; expected_data_type?: string };
        };
        const parts = [
          err.code,
          err.details?.api_name,
          err.message,
          err.details?.expected_data_type
            ? `tipo esperado: ${err.details.expected_data_type}`
            : null,
        ].filter(Boolean);
        return parts.join(' — ');
      })
      .join('; ');
  }

  if (body.message) {
    return body.message;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return 'Error en Zoho CRM';
  }
}

export function formatZohoHttpError(error: {
  response?: { data?: unknown };
  message?: string;
}): string {
  if (error.response?.data) {
    return formatZohoApiErrorPayload(error.response.data);
  }
  return error.message || 'Error en Zoho CRM';
}
