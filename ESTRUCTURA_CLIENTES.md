# 🏗️ Estructura de Clientes - Análisis y Propuesta

## 📊 Situación Actual

### Estructura Actual:
- **Tabla `users`**: Contiene todos los usuarios (admin, partner, client, editor, user)
- **Tabla `requests`**: 
  - `clientId` → apunta a `users.id` (User con type='client')
  - `partnerId` → apunta a `users.id` (User con type='partner')

### Problema Identificado:
- Los partners gestionan clientes que **NO necesitan acceso al portal**
- Actualmente se crean usuarios (User) para cada cliente, incluso si no acceden
- Esto genera usuarios innecesarios en la base de datos
- No hay separación entre "clientes con acceso" y "clientes sin acceso"

## 🎯 Propuesta: Estructura Escalable

### Nueva Tabla: `clients`

```sql
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Si pertenece a un partner
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,    -- Si tiene acceso al portal (opcional)
  
  -- Datos del cliente
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(255),
  address JSONB, -- Para direcciones estructuradas
  
  -- Estado
  status BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_clients_partner_id ON clients(partner_id);
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_email ON clients(email);
CREATE UNIQUE INDEX idx_clients_email_partner_unique ON clients(email, partner_id) WHERE partner_id IS NOT NULL;
```

### Ventajas de esta Estructura:

1. **Separación de Responsabilidades**:
   - `clients`: Datos de clientes (con o sin acceso)
   - `users`: Solo usuarios con acceso al sistema

2. **Flexibilidad**:
   - Cliente puede existir sin usuario (solo datos)
   - Si necesita acceso después, se crea `User` y se relaciona
   - Un cliente puede pertenecer a un partner O ser independiente (admin)

3. **Escalabilidad**:
   - Partners pueden gestionar muchos clientes sin crear usuarios
   - Fácil migración: si un cliente necesita acceso, crear User y relacionar
   - Mantiene integridad referencial

4. **Relaciones**:
   - `clients.partner_id` → `users.id` (partner)
   - `clients.user_id` → `users.id` (usuario con acceso, opcional)
   - `requests.client_id` → `clients.id` (en lugar de users.id)

## 🔄 Migración de `requests`

### Cambio en `Request` Entity:
```typescript
// Antes:
@ManyToOne(() => User)
@JoinColumn({ name: 'client_id' })
client: User;

// Después:
@ManyToOne(() => Client)
@JoinColumn({ name: 'client_id' })
client: Client;
```

### Impacto:
- Las requests existentes necesitarán migración
- Crear `Client` para cada `User` con type='client' existente
- Actualizar `requests.client_id` para apuntar a `clients.id`

## 📋 Módulo: Partner Clients

### Endpoints Propuestos:

#### Para Partners:
- `GET /panel/partner-clients` - Listar mis clientes
- `POST /panel/partner-clients` - Crear cliente
- `GET /panel/partner-clients/:id` - Ver detalle
- `PATCH /panel/partner-clients/:id` - Actualizar cliente
- `DELETE /panel/partner-clients/:id` - Eliminar cliente
- `PATCH /panel/partner-clients/:id/status` - Activar/Desactivar

#### Para Admin:
- `GET /panel/clients` - Listar todos los clientes
- `GET /panel/clients?partnerId=X` - Filtrar por partner
- `POST /panel/clients` - Crear cliente (puede asignar partner)
- Resto igual que partners

## 🎨 Frontend

### Componente: `my-clients` (Partner)
- Lista de clientes del partner actual
- CRUD completo
- **NO crea usuarios**, solo clientes

### Componente: `clients` (Admin)
- Lista todos los clientes
- Puede filtrar por partner
- Puede crear clientes con o sin partner asignado

## ✅ Beneficios Finales

1. ✅ Partners gestionan clientes sin crear usuarios innecesarios
2. ✅ Escalable: fácil agregar acceso después
3. ✅ Mantenible: separación clara de responsabilidades
4. ✅ Flexible: soporta clientes con y sin acceso
5. ✅ Compatible: puede coexistir con estructura actual durante migración






