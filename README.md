# API Panel StartCompanies

API Backend para el Panel de Administración de Start Companies LLC, desarrollado con **NestJS** y **TypeORM**.

Este proyecto proporciona una API REST completa para gestionar:
- Sistema de blog con posts, categorías, tags y elementos reutilizables
- Panel administrativo para gestión de solicitudes (LLC, renovaciones, cuentas bancarias)
- Flujo wizard para nuevos usuarios
- Integración con Zoho CRM y WorkDrive
- Procesamiento de pagos con Stripe
- Almacenamiento de archivos en AWS S3

## Tecnologías Principales

- **NestJS 11.0.1** - Framework Node.js progresivo
- **TypeORM 0.3.26** - ORM para PostgreSQL
- **PostgreSQL** - Base de datos relacional
- **JWT** - Autenticación basada en tokens
- **Swagger** - Documentación de API
- **AWS SDK** - Integración con S3
- **Stripe** - Procesamiento de pagos
- **Resend** - Servicio de envío de emails

## Estructura del Proyecto

```
src/
  app.module.ts              # Módulo raíz de la aplicación
  main.ts                    # Punto de entrada de la aplicación
  data-source.ts             # Configuración de TypeORM para migraciones

  blog/                      # Módulo de Blog
    blog.module.ts
    posts/                   # Gestión de posts
      posts.controller.ts
      posts.service.ts
      entities/
      dtos/
    categories/              # Gestión de categorías
    tags/                    # Gestión de tags
    reusable-elements/       # Elementos reutilizables del blog

  panel/                     # Módulo del Panel Administrativo
    panel.module.ts
    requests/                # Gestión de solicitudes (LLC, renovaciones, cuentas bancarias)
      requests.controller.ts
      requests.service.ts
      entities/
        request.entity.ts
        apertura-llc-request.entity.ts
        renovacion-llc-request.entity.ts
        cuenta-bancaria-request.entity.ts
        member.entity.ts
        bank-account-validator.entity.ts
      dtos/
    clients/                 # Gestión de clientes
    process-steps/           # Pasos del proceso
    documents/               # Gestión de documentos
    notifications/           # Sistema de notificaciones
    settings/                # Configuraciones del panel
    reports/                 # Reportes

  wizard/                    # Módulo Wizard (flujo para nuevos usuarios)
    wizard.controller.ts
    wizard.service.ts
    wizard.module.ts
    dtos/

  shared/                    # Recursos compartidos
    auth/                    # Autenticación y autorización
      auth.controller.ts
      auth.service.ts
      auth.guard.ts
      roles.guard.ts
      dtos/
    user/                    # Gestión de usuarios
      user.controller.ts
      user.service.ts
      entities/
      dtos/
    common/                  # Utilidades comunes
      services/
        email.service.ts
      interceptors/
        logging.interceptor.ts
      utils/
    payments/                # Integración con Stripe
      stripe.service.ts
    upload-file/             # Gestión de subida de archivos
      upload-file.controller.ts
      upload-file.service.ts

  zoho-config/              # Integración con Zoho
    zoho-config.controller.ts
    zoho-config.service.ts
    zoho-crm.controller.ts
    zoho-crm.service.ts
    zoho-workdrive.service.ts
    zoho-sync.controller.ts
    zoho-sync.service.ts

  config/                    # Configuraciones
    config.service.ts
    aws.config.service.ts
```

## Requisitos Previos

- **Node.js**: Versión 18.x o superior
- **npm**: Versión 9.x o superior
- **PostgreSQL**: Versión 12 o superior
- **TypeScript**: 5.7.3

## Instalación

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia el archivo `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales y configuraciones.

## Variables de Entorno

### Base de Datos
- `DB_HOST` - Host de PostgreSQL (default: localhost)
- `DB_PORT` - Puerto de PostgreSQL (default: 5432)
- `DB_USER` - Usuario de PostgreSQL
- `DB_PASSWORD` - Contraseña de PostgreSQL
- `DB_NAME` - Nombre de la base de datos

### Servidor
- `PORT` - Puerto del servidor (default: 3000)
- `MODE` - Modo de ejecución (DEV o PROD)
- `NODE_ENV` - Entorno de Node.js
- `API_PUBLIC_URL` - URL pública de esta API (sin barra final), p. ej. `https://api-web.startcompanies.io`. El callback OAuth Zoho es `{API_PUBLIC_URL}/orgTk/callback` (registrar ese valor exacto en Zoho).
- `FRONTEND_URL` - URL pública del portal/panel para enlaces en correos (Resend)

### Autenticación
- `JWT_SECRET` - Secreto para firmar tokens JWT
- `JWT_EXPIRES_IN` - Tiempo de expiración del token (default: 24h)

### AWS S3 (Opcional)
- `AWS_ACCESS_KEY_ID` - Clave de acceso de AWS
- `AWS_SECRET_ACCESS_KEY` - Clave secreta de AWS
- `AWS_REGION` - Región de AWS (ej: us-east-1)
- `AWS_S3_BUCKET_NAME` - Nombre del bucket S3

### Stripe (Opcional)
- `STRIPE_SECRET_KEY` - Clave secreta de Stripe
- `STRIPE_WEBHOOK_SECRET` - Secreto del webhook de Stripe

### Zoho (Opcional)
- `ZOHO_CLIENT_ID` - Client ID de Zoho
- `ZOHO_CLIENT_SECRET` - Client Secret de Zoho
- `ZOHO_CRM_DOMAINS` - Dominios permitidos para Zoho (separados por comas)

### Email (Opcional)
- `RESEND_API_KEY` - API Key de Resend
- `RESEND_FROM_EMAIL` - Remitente (ver `email.service.ts`)

## Scripts Disponibles

### Desarrollo
```bash
# Iniciar servidor en modo desarrollo
npm run start:dev

# Iniciar servidor en modo debug
npm run start:debug

# Iniciar servidor en modo producción
npm run start:prod
```

### Build
```bash
# Compilar el proyecto
npm run build

# Iniciar servidor compilado
npm run start
```

### Testing
```bash
# Ejecutar tests unitarios
npm run test

# Ejecutar tests en modo watch
npm run test:watch

# Ejecutar tests con cobertura
npm run test:cov

# Ejecutar tests E2E
npm run test:e2e

# Ejecutar tests en modo debug
npm run test:debug
```

### Migraciones de Base de Datos
```bash
# Generar una nueva migración
npm run migration:generate -- NombreDeLaMigracion

# Crear una migración vacía
npm run migration:create -- NombreDeLaMigracion

# Ejecutar migraciones pendientes
npm run migration:run

# Revertir última migración
npm run migration:revert

# Ver estado de migraciones
npm run migration:show
```

### Code Quality
```bash
# Ejecutar linter
npm run lint

# Formatear código
npm run format
```

## Migraciones de Base de Datos

Este proyecto utiliza **TypeORM** para gestionar las migraciones de base de datos.

Las migraciones se encuentran en el directorio `migrations/` y se ejecutan mediante scripts personalizados.

### Comandos de Migración

- **Generar migración**: Crea una migración basada en los cambios de entidades
- **Crear migración**: Crea una migración vacía para escribir manualmente
- **Ejecutar migraciones**: Aplica todas las migraciones pendientes
- **Revertir migración**: Revierte la última migración ejecutada
- **Mostrar estado**: Muestra el estado de las migraciones

Ver `migrations/README.md` para más detalles sobre las migraciones disponibles.

## Documentación de API

El proyecto incluye documentación interactiva de la API mediante **Swagger**.

Una vez iniciado el servidor, accede a la documentación en:

```
http://localhost:3000/api/explorer
```

La documentación incluye:
- Todos los endpoints disponibles
- Esquemas de datos (DTOs)
- Autenticación JWT
- Ejemplos de peticiones y respuestas

## Módulos Principales

### Blog Module
Gestión completa del sistema de blog:
- **Posts**: CRUD de posts con estados (borrador, publicado, sandbox)
- **Categories**: Gestión de categorías
- **Tags**: Gestión de tags
- **Reusable Elements**: Elementos reutilizables para el editor

### Panel Module
Panel administrativo para gestión de solicitudes:
- **Requests**: Gestión de solicitudes (apertura LLC, renovación, cuenta bancaria)
- **Clients**: Gestión de clientes
- **Process Steps**: Pasos del proceso de cada solicitud
- **Documents**: Gestión de documentos asociados
- **Notifications**: Sistema de notificaciones
- **Settings**: Configuraciones del panel
- **Reports**: Generación de reportes

### Wizard Module
Flujo para nuevos usuarios que completan solicitudes:
- Registro de usuarios
- Creación de solicitudes
- Confirmación de email

### Zoho Config Module
Integración con Zoho CRM y WorkDrive:
- **OAuth**: Autenticación OAuth con Zoho
- **CRM**: Sincronización con Zoho CRM
- **WorkDrive**: Gestión de archivos en Zoho WorkDrive
- **SSO**: Single Sign-On con Zoho

### Shared Modules
Módulos compartidos utilizados por otros módulos:
- **Auth**: Autenticación y autorización (JWT, roles)
- **User**: Gestión de usuarios
- **Common**: Utilidades comunes (email, interceptors, utils)
- **Payments**: Integración con Stripe
- **Upload File**: Subida de archivos a S3

## Autenticación y Autorización

El proyecto utiliza **JWT (JSON Web Tokens)** para autenticación.

### Endpoints de Autenticación
- `POST /auth/signup` - Registro de usuario
- `POST /auth/signin` - Inicio de sesión
- `POST /auth/forgot-password` - Solicitar recuperación de contraseña
- `POST /auth/reset-password` - Restablecer contraseña
- `POST /auth/change-password` - Cambiar contraseña
- `POST /auth/sso` - Single Sign-On con Zoho

### Guards
- **AuthGuard**: Protege rutas que requieren autenticación
- **RolesGuard**: Protege rutas basadas en roles de usuario

### Uso en Controladores
```typescript
@UseGuards(AuthGuard)
@Roles('admin', 'editor')
@Get('protected')
getProtectedData() {
  // Solo usuarios autenticados con rol admin o editor
}
```

## Integraciones

### AWS S3
Almacenamiento de archivos en Amazon S3:
- Subida de archivos
- Generación de URLs pre-firmadas
- Gestión de buckets

### Stripe
Procesamiento de pagos:
- Creación de intenciones de pago
- Webhooks para eventos de pago
- Gestión de suscripciones

### Zoho CRM
Integración con Zoho CRM:
- Sincronización de datos
- Creación de leads y contactos
- Actualización de registros

### Zoho WorkDrive
Gestión de archivos en Zoho WorkDrive:
- Subida de documentos
- Compartir archivos
- Organización de carpetas

### Resend
Envío de emails transaccionales:
- Emails de confirmación
- Notificaciones
- Recuperación de contraseña

## CORS

El servidor está configurado para aceptar peticiones desde los siguientes orígenes:

- `http://localhost:4200` (Frontend desarrollo)
- `http://localhost:4000` (Frontend alternativo)
- `https://startcompanies.us` (Producción)
- `https://admin-blog.startcompanies.us` (Panel admin)
- `https://staging.startcompanies.io` (Staging)

Dominios adicionales de Zoho pueden configurarse mediante la variable `ZOHO_CRM_DOMAINS`.

## Estructura de Entidades Principales

### Request (Solicitud)
Entidad base para todas las solicitudes:
- Apertura LLC
- Renovación LLC
- Cuenta Bancaria

### Client (Cliente)
Información de los clientes que realizan solicitudes.

### User (Usuario)
Usuarios del sistema (administradores, editores, etc.).

### Post (Post del Blog)
Posts del blog con estados y metadatos.

## Testing

### Tests Unitarios
Los tests unitarios se encuentran junto a los archivos fuente con extensión `.spec.ts`.

### Tests E2E
Los tests end-to-end se encuentran en el directorio `test/`.

### Ejecutar Tests
```bash
# Todos los tests
npm run test

# Tests con cobertura
npm run test:cov

# Tests E2E
npm run test:e2e
```

## Docker

El proyecto incluye configuración Docker para despliegue:

```bash
# Build de la imagen
docker build -t api-panel-startcompanies .

# Ejecutar contenedor
docker run -p 3000:3000 --env-file .env api-panel-startcompanies
```

Ver `Dockerfile` y `docker-compose.yml` para más detalles.

## Despliegue

### Producción

1. Configurar variables de entorno de producción
2. Compilar el proyecto: `npm run build`
3. Ejecutar migraciones: `npm run migration:run`
4. Iniciar servidor: `npm run start:prod`

### Consideraciones

- Asegúrate de tener todas las variables de entorno configuradas
- Ejecuta las migraciones antes de iniciar el servidor
- Configura HTTPS en producción
- Configura rate limiting para protección contra abuso
- Configura logging apropiado

## Convenciones de Código

### Nomenclatura
- **Controladores**: PascalCase con sufijo `Controller` (ej: `PostsController`)
- **Servicios**: PascalCase con sufijo `Service` (ej: `PostsService`)
- **Entidades**: PascalCase con sufijo `Entity` (ej: `PostEntity`)
- **DTOs**: PascalCase con sufijo `Dto` (ej: `CreatePostDto`)
- **Módulos**: PascalCase con sufijo `Module` (ej: `BlogModule`)

### Estructura de Archivos
Cada módulo debe incluir:
- `*.module.ts` - Definición del módulo
- `*.controller.ts` - Controlador con endpoints
- `*.service.ts` - Lógica de negocio
- `entities/` - Entidades de TypeORM
- `dtos/` - Data Transfer Objects

## Dependencias Principales

### Core
- `@nestjs/core` - Framework NestJS
- `@nestjs/common` - Utilidades comunes
- `@nestjs/platform-express` - Adaptador Express

### Base de Datos
- `@nestjs/typeorm` - Integración TypeORM
- `typeorm` - ORM
- `pg` - Driver de PostgreSQL

### Autenticación
- `@nestjs/jwt` - JWT para NestJS
- `bcrypt` - Hash de contraseñas

### Validación
- `class-validator` - Validación de DTOs
- `class-transformer` - Transformación de objetos

### Integraciones
- `@aws-sdk/client-s3` - Cliente AWS S3
- `stripe` - SDK de Stripe
- `axios` - Cliente HTTP
- `resend` - Servicio de emails

### Documentación
- `@nestjs/swagger` - Swagger para NestJS

## Troubleshooting

### Error de conexión a base de datos
- Verifica que PostgreSQL esté corriendo
- Verifica las credenciales en `.env`
- Verifica que la base de datos exista

### Error de migraciones
- Asegúrate de tener la última versión de las migraciones
- Verifica que la base de datos esté actualizada
- Revisa los logs para más detalles

### Error de CORS
- Verifica que el origen esté en la lista de permitidos
- Verifica la configuración de CORS en `main.ts`

## Contribución

1. Crea una rama desde `main` o `develop`
2. Realiza tus cambios siguiendo las convenciones del proyecto
3. Asegúrate de que los tests pasen
4. Ejecuta el linter: `npm run lint`
5. Crea un Pull Request

### Checklist antes de commitear
- [ ] El código sigue las convenciones de nomenclatura
- [ ] Los tests pasan correctamente
- [ ] El linter no muestra errores
- [ ] Las migraciones están actualizadas (si aplica)
- [ ] La documentación está actualizada

## Licencia

Este proyecto es privado y propiedad de Start Companies LLC.

## Recursos Adicionales

- [Documentación de NestJS](https://docs.nestjs.com)
- [Documentación de TypeORM](https://typeorm.io)
- [Documentación de Swagger](https://swagger.io/docs/)

---

**Última actualización:** Enero 2025  
**Versión NestJS:** 11.0.1  
**Versión del Proyecto:** 0.0.1
