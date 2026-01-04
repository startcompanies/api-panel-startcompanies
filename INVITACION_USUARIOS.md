# 📧 Sistema de Invitación de Usuarios

## Resumen

Se ha implementado un sistema completo de invitación de usuarios que incluye:
- Generación automática de contraseñas temporales
- Envío de emails de invitación usando Resend
- Pantalla para establecer contraseña inicial
- Integración con el flujo de reset de contraseña

## Configuración Requerida

### Variables de Entorno (.env)

Agregar las siguientes variables al archivo `.env`:

```env
# Resend Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=Start Companies <noreply@startcompanies.us>

# Frontend URL (para links en emails)
FRONTEND_URL=http://localhost:4200
# En producción:
# FRONTEND_URL=https://startcompanies.us
```

### Obtener API Key de Resend

1. Crear cuenta en [Resend](https://resend.com)
2. Verificar dominio o usar el dominio de prueba
3. Obtener API Key desde el dashboard
4. Agregar al `.env`

## Flujo de Invitación

### 1. Creación de Usuario por Admin

Cuando un administrador crea un usuario (partner o client) mediante `POST /users`:

1. **Generación de Contraseña Temporal**: Si no se proporciona contraseña, se genera una automáticamente (16 caracteres, incluye mayúsculas, minúsculas, números y caracteres especiales)

2. **Creación del Usuario**: El usuario se crea con la contraseña temporal encriptada

3. **Generación de Token**: Se genera un token JWT válido por 24 horas con tipo `password-setup`

4. **Envío de Email**: Se envía un email de bienvenida con:
   - Mensaje personalizado según tipo de usuario (Partner/Cliente/Admin)
   - Link para establecer contraseña: `${FRONTEND_URL}/panel/set-password?token=...`
   - Instrucciones claras
   - Advertencia de expiración (24 horas)

### 2. Establecimiento de Contraseña

El usuario recibe el email y hace clic en el link:

1. **Frontend**: Muestra el componente `SetPasswordComponent` en `/panel/set-password?token=...`

2. **Validación**: El usuario ingresa y confirma su nueva contraseña (mínimo 8 caracteres)

3. **Backend**: Se llama a `POST /auth/reset-password` con:
   - `token`: Token del email
   - `newPassword`: Nueva contraseña

4. **Verificación**: El backend verifica que el token sea válido y de tipo `password-setup` o `password-reset`

5. **Actualización**: Se actualiza la contraseña del usuario

6. **Redirección**: El usuario es redirigido al login

## Endpoints

### Crear Usuario (Admin)
```
POST /users
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "username": "partner1",
  "email": "partner@example.com",
  "password": "TempPass123!", // Opcional - si no se proporciona, se genera automáticamente
  "first_name": "Juan",
  "last_name": "Pérez",
  "type": "partner",
  "company": "Mi Empresa",
  "phone": "+1234567890"
}
```

### Establecer Contraseña
```
POST /auth/reset-password
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "MiNuevaContraseña123!"
}
```

## Componentes Frontend

### SetPasswordComponent
- **Ruta**: `/panel/set-password?token=...`
- **Funcionalidad**:
  - Valida token en URL
  - Formulario para nueva contraseña y confirmación
  - Validación de coincidencia
  - Integración con `AuthService.resetPassword()`
  - Redirección automática al login después del éxito

## Servicios Backend

### EmailService
- **Ubicación**: `src/shared/common/services/email.service.ts`
- **Métodos**:
  - `sendInvitationEmail()`: Envía email de bienvenida con link para establecer contraseña
  - `sendPasswordResetEmail()`: Envía email de recuperación de contraseña

### UserService
- **Método modificado**: `createUserByAdmin()`
  - Genera contraseña temporal si no se proporciona
  - Genera token de setup
  - Envía email de invitación

### AuthService
- **Método modificado**: `resetPassword()`
  - Ahora acepta tokens de tipo `password-setup` además de `password-reset`

## Email Templates

Los emails se envían con HTML formateado incluyendo:
- Header con logo/branding
- Mensaje personalizado según tipo de usuario
- Botón CTA para establecer contraseña
- Link alternativo (texto)
- Advertencia de expiración
- Footer con información de la empresa

## Seguridad

- ✅ Tokens JWT con expiración (24h para setup, 1h para reset)
- ✅ Contraseñas encriptadas con bcrypt
- ✅ Validación de tipo de token
- ✅ No se revela si el email existe (en forgot-password)
- ✅ Contraseñas temporales seguras (16 caracteres, caracteres especiales)

## Notas

- Si Resend no está configurado, el sistema no falla pero no envía emails (se loguea un warning)
- Las contraseñas temporales se generan automáticamente si no se proporcionan
- El email de invitación se envía de forma asíncrona y no bloquea la creación del usuario
- Los errores de email se loguean pero no impiden la creación del usuario







