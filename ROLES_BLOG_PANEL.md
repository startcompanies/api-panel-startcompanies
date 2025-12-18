# 🔐 Roles del Sistema - Blog vs Panel

## 📋 Roles Disponibles

### Panel Administrativo
- **`admin`** - Administrador del panel (acceso completo)
- **`partner`** - Partner (gestión de clientes y solicitudes)
- **`client`** - Cliente (solo ver sus propias solicitudes)
- **`user`** - Usuario básico (por defecto)

### Blog
- **`admin`** - Administrador del blog (acceso completo)
- **`editor`** - Editor (puede crear y editar posts)
- **`user`** - Usuario básico (solo lectura)

---

## 🔄 Cambios Realizados

### Backend

1. **Entidad User** (`user.entity.ts`)
   - ✅ Agregado `'editor'` al tipo: `'user' | 'client' | 'partner' | 'admin' | 'editor'`

2. **DTOs Actualizados**
   - ✅ `SignUpDto` - Acepta `'editor'` como tipo válido
   - ✅ `CreateUserDto` - Acepta `'editor'` como tipo válido

3. **RolesGuard y Decorador**
   - ✅ Actualizado para aceptar `'editor'` y `'user'` además de los roles del panel

### Frontend Blog (`panel-startcompanies`)

1. **Componente Signup** (`signup.component.html`)
   - ✅ Cambiado valores de `ADMIN`, `EDITOR`, `USER` a `admin`, `editor`, `user` (minúsculas)
   - ✅ Mantiene las etiquetas en español: "Administrador", "Editor", "Usuario"

2. **Componente Signup** (`signup.component.ts`)
   - ✅ Valor por defecto cambiado de `'USER'` a `'user'`

---

## 📝 Mapeo de Roles

| Frontend (Blog) | Backend | Descripción |
|----------------|---------|-------------|
| Administrador | `admin` | Acceso completo al blog |
| Editor | `editor` | Puede crear y editar posts |
| Usuario | `user` | Usuario básico |

| Frontend (Panel) | Backend | Descripción |
|-----------------|---------|-------------|
| Admin | `admin` | Acceso completo al panel |
| Partner | `partner` | Gestión de clientes y solicitudes |
| Cliente | `client` | Solo ver sus solicitudes |
| Usuario | `user` | Usuario básico |

---

## ⚠️ Notas Importantes

1. **Roles Compartidos**:
   - `admin` y `user` son compartidos entre Blog y Panel
   - `editor` es exclusivo del Blog
   - `partner` y `client` son exclusivos del Panel

2. **Validación**:
   - El backend valida que el tipo sea uno de los valores permitidos
   - Los roles del panel (`admin`, `partner`, `client`) tienen permisos específicos en endpoints protegidos
   - Los roles del blog (`admin`, `editor`, `user`) se usan principalmente para control de acceso en el frontend del blog

3. **Seguridad**:
   - Los endpoints del Panel siguen usando solo `admin`, `partner`, `client` para autorización
   - El rol `editor` no tiene acceso a endpoints del Panel (solo del Blog)

---

## ✅ Verificación

- ✅ Código compila correctamente
- ✅ Frontend del blog actualizado para usar valores en minúsculas
- ✅ Backend acepta todos los roles (Blog + Panel)
- ✅ DTOs actualizados con validaciones correctas

