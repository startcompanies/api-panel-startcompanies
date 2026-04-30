# Anthropic / IA en el panel — decisión de arquitectura

## Estado recomendado (producción)

- **No** exponer claves API de Anthropic en el navegador (el prototipo HTML usa BYOK con `anthropic-dangerous-direct-browser-access`, lo cual no debe replicarse tal cual).
- **Integración productiva con Anthropic:** posponer hasta definir compliance, retención de datos y costos; si se activa, usar **solo backend** con `ANTHROPIC_API_KEY` en servidor (o secreto gestionado), nunca la clave del usuario en el cliente.

## Implementación actual (Fase D)

- El botón **«Sugerir categoría»** en contabilidad usa **`POST /panel/accounting/suggest-category`**, que aplica **reglas por palabras clave** en el servidor (sin llamadas externas). No requiere variables de entorno de Anthropic.

## Si más adelante se desea Anthropic

1. Añadir `ANTHROPIC_API_KEY` solo en el entorno del API (Nest).
2. Endpoint sugerido: `POST /panel/accounting/suggest-category-ai` con cuerpo `{ "description": "..." }`, prompt acotado, **sin** enviar PII innecesaria; rate limiting y logging sin datos sensibles.
3. Documentar costos y política de retención; considerar cola de jobs para volúmenes altos.

## Proxy vs posponer

| Opción | Ventaja | Riesgo / coste |
|--------|---------|----------------|
| **Posponer** | Cero secretos, cero compliance extra | Menos automatización |
| **Proxy servidor** | Control, auditoría, sin CORS/BYOK en browser | Coste API, operación de claves |

La decisión por defecto del proyecto: **reglas en servidor + posponer Anthropic** hasta requisitos claros de producto y legal.
