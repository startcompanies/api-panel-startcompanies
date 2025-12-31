# 📊 Sistema de Logging de Endpoints

## ✅ Logging Mejorado Implementado

Se ha mejorado el `LoggingInterceptor` para mostrar información detallada de todas las peticiones y respuestas HTTP.

---

## 📋 Información Registrada

### Request (Entrada)
- ✅ **Timestamp** - Fecha y hora de la petición
- ✅ **Método HTTP** - GET, POST, PATCH, DELETE, etc.
- ✅ **URL/Endpoint** - Ruta completa del endpoint
- ✅ **IP del Cliente** - Dirección IP del solicitante
- ✅ **Usuario** - ID y email del usuario autenticado (si aplica)
- ✅ **Rol** - Tipo de usuario (admin, partner, client, editor, user)
- ✅ **Query Parameters** - Parámetros de consulta (si existen)
- ✅ **Route Parameters** - Parámetros de ruta (si existen)
- ✅ **Body** - Cuerpo de la petición (sanitizado, sin contraseñas)

### Response (Salida)
- ✅ **Timestamp** - Fecha y hora de la respuesta
- ✅ **Status Code** - Código de estado HTTP
- ✅ **Duración** - Tiempo de procesamiento en milisegundos
- ✅ **Response Data** - Datos de la respuesta (formateado)
- ✅ **Emoji de Estado** - ✅ para éxito, ⚠️ para advertencias

### Error (Errores)
- ✅ **Timestamp** - Fecha y hora del error
- ✅ **Status Code** - Código de error HTTP
- ✅ **Duración** - Tiempo hasta el error
- ✅ **Mensaje de Error** - Descripción del error
- ✅ **Stack Trace** - Traza del error (primeros 500 caracteres)

---

## 📝 Ejemplo de Logs

### Request Exitoso

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 [2024-01-20T10:30:45.123Z] POST /panel/requests
   IP: ::1 | User: 1 (admin@startcompanies.us) | Role: admin
   Body: {
     "type": "apertura-llc",
     "clientId": 5,
     "currentStepNumber": 1,
     "aperturaLlcData": {
       "llcType": "single",
       "companyName": "Mi Empresa LLC"
     }
   }
📤 [2024-01-20T10:30:45.456Z] POST /panel/requests
   ✅ Status: 201 | Duration: 333ms
   Response: {
     "id": 123,
     "type": "apertura-llc",
     "status": "pending",
     "createdAt": "2024-01-20T10:30:45.123Z"
   }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Request con Query Parameters

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 [2024-01-20T10:30:45.123Z] GET /panel/requests
   IP: ::1 | User: 2 (partner@example.com) | Role: partner
   Query: {"status":"pending","page":"1","limit":"10"}
📤 [2024-01-20T10:30:45.234Z] GET /panel/requests
   ✅ Status: 200 | Duration: 111ms
   Response: Array[5]: [{"id":1,"type":"apertura-llc",...},{"id":2,...}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Request con Error

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 [2024-01-20T10:30:45.123Z] DELETE /panel/requests/999
   IP: ::1 | User: 3 (client@example.com) | Role: client
📤 [2024-01-20T10:30:45.234Z] DELETE /panel/requests/999
   ❌ Status: 404 | Duration: 111ms
   Error: Request not found
   Stack: NotFoundException: Request not found...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔒 Seguridad

### Campos Sanitizados
Los siguientes campos se ocultan automáticamente en los logs:
- `password`
- `oldPassword`
- `newPassword`
- `token`
- `accessToken`
- `refreshToken`
- `authorization`

**Ejemplo:**
```json
{
  "email": "user@example.com",
  "password": "***REDACTED***"
}
```

---

## ⚙️ Configuración

### Rutas Excluidas
Las siguientes rutas no generan logs:
- `/api/explorer` - Swagger UI
- `/api` - Ruta raíz de API
- `/favicon.ico` - Favicon

### Límites de Tamaño
- **Body Request**: Máximo 500 caracteres (se trunca si es mayor)
- **Response**: Máximo 800 caracteres (se trunca si es mayor)
- **Stack Trace**: Primeros 500 caracteres

### Arrays
Para respuestas que son arrays, se muestra:
- Cantidad de elementos
- Primeros 2 elementos como ejemplo
- Indicador si hay más elementos

**Ejemplo:**
```
Response: Array[25]: [{"id":1,...},{"id":2,...}]...
```

---

## 📊 Formato de Logs

### Separadores Visuales
- `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` - Separador entre requests
- `📥` - Emoji para Request
- `📤` - Emoji para Response
- `✅` - Emoji para éxito (2xx)
- `⚠️` - Emoji para advertencia (3xx, 4xx)
- `❌` - Emoji para error (5xx)

---

## 🎯 Beneficios

1. **Debugging**: Fácil identificar problemas en endpoints específicos
2. **Monitoreo**: Ver qué endpoints se usan más frecuentemente
3. **Performance**: Identificar endpoints lentos (duración)
4. **Seguridad**: Rastrear accesos y actividades de usuarios
5. **Auditoría**: Historial completo de todas las peticiones

---

## 📝 Notas

- Los logs se muestran en la consola donde se ejecuta el servidor
- Para producción, considera redirigir los logs a un archivo o servicio de logging
- Los logs incluyen información sensible (excepto contraseñas), ten cuidado en producción
- El formato es legible y fácil de parsear si necesitas procesar los logs






