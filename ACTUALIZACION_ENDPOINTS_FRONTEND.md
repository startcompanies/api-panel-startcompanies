# 🔄 Actualización de Endpoints en Frontend

## ✅ Cambios Realizados

### 📝 panel-startcompanies (Blog)

#### Servicios Actualizados:
- ✅ `posts.service.ts`
  - `/posts` → `/blog/posts`
  - `/posts/${id}` → `/blog/posts/${id}`
  - `/posts/publish/${id}` → `/blog/posts/publish/${id}`

- ✅ `categories.service.ts`
  - `/categories` → `/blog/categories`
  - `/categories/${id}` → `/blog/categories/${id}`

- ✅ `tags.service.ts`
  - `/tags` → `/blog/tags`
  - `/tags/${id}` → `/blog/tags/${id}`

- ✅ `reusable-elements.service.ts`
  - `/reusable-elements` → `/blog/reusable-elements`
  - `/reusable-elements/${id}` → `/blog/reusable-elements/${id}`

#### Endpoints Sin Cambio (Compartidos):
- ✅ `/auth/*` - Sin cambios (módulo compartido)
- ✅ `/users/*` - Sin cambios (módulo compartido)
- ✅ `/upload-file` - Sin cambios (módulo compartido)

---

### 🎛️ portal-startcompanies (Panel)

#### Servicios Actualizados:
- ✅ `documents.service.ts`
  - `/upload-file` → `/panel/documents`
  - `/upload-file/request/${requestId}` → `/panel/documents/request/${requestId}`
  - `/upload-file/${documentId}` → `/panel/documents/${documentId}`

#### Endpoints Sin Cambio (Compartidos):
- ✅ `/auth/*` - Sin cambios (módulo compartido)
- ✅ `/users/*` - Sin cambios (módulo compartido)

#### Servicios Pendientes (Usan Mockup):
- ⚠️ `notifications.service.ts` - Usa datos mockup, necesita implementación real
  - Debería usar: `/panel/notifications/me`
  - Debería usar: `/panel/notifications/me/unread-count`
  - Debería usar: `/panel/notifications/:id/read`
  - Debería usar: `/panel/notifications/me/read-all`
  - Debería usar: `/panel/notifications/:id` (DELETE)

---

## 📋 Endpoints del Panel que Podrían Necesitar Servicios

Los siguientes endpoints del Panel están disponibles pero pueden no tener servicios implementados aún:

### Requests
- `/panel/requests` - GET, POST
- `/panel/requests/:id` - GET, PATCH, DELETE
- `/panel/requests/required-documents` - GET
- `/panel/requests/:requestId/members` - GET, POST
- `/panel/requests/:requestId/members/:id` - PATCH, DELETE
- `/panel/requests/:requestId/owners` - GET, POST, PATCH, DELETE
- `/panel/requests/:requestId/bank-account-validator` - GET, POST, PATCH, DELETE

### Process Steps
- `/panel/process-steps/request/:requestId` - GET
- `/panel/process-steps` - POST
- `/panel/process-steps/:id` - PATCH
- `/panel/process-steps/:id/assign` - PATCH

### Documents
- ✅ `/panel/documents/request/:requestId` - Implementado
- `/panel/documents/request/:requestId/field/:fieldName` - GET
- `/panel/documents` - POST
- `/panel/documents/multiple` - POST
- `/panel/documents/:id/download` - GET
- ✅ `/panel/documents/:id` - DELETE (implementado)

### Notifications
- ⚠️ `/panel/notifications/me` - Pendiente (usa mockup)
- ⚠️ `/panel/notifications/me/unread-count` - Pendiente (usa mockup)
- `/panel/notifications` - POST
- ⚠️ `/panel/notifications/:id/read` - Pendiente (usa mockup)
- ⚠️ `/panel/notifications/me/read-all` - Pendiente (usa mockup)
- ⚠️ `/panel/notifications/:id` - DELETE (usa mockup)

### Settings
- `/panel/settings/preferences` - GET, PATCH
- `/panel/settings/process-config` - GET, PATCH

### Reports
- `/panel/reports/partner-performance` - GET (solo admin)

---

## 🔍 Verificación

### ✅ Completado:
1. ✅ Todos los endpoints del Blog actualizados a `/blog/*`
2. ✅ Endpoints de documentos actualizados a `/panel/documents/*`
3. ✅ Endpoints compartidos (`/auth`, `/users`, `/upload-file`) sin cambios

### ⚠️ Pendiente:
1. ⚠️ Implementar servicios reales para notificaciones (actualmente usa mockup)
2. ⚠️ Crear servicios para requests, process-steps, settings, reports si se necesitan
3. ⚠️ Verificar que los componentes que usan estos servicios funcionen correctamente

---

## 📝 Notas

- Los endpoints públicos del blog (`/posts/get-from-portal/*`) no necesitan cambio ya que son endpoints especiales
- Los endpoints compartidos (`/auth`, `/users`, `/upload-file`) no tienen prefijo y funcionan igual
- Los servicios que usan datos mockup necesitarán implementación real cuando se integren con el backend

