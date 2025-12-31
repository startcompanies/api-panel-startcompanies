# Guía de Migraciones de Base de Datos

Este proyecto usa TypeORM para gestionar las migraciones de base de datos.

## Configuración

Las migraciones están configuradas en `src/data-source.ts` que utiliza las variables de entorno definidas en `.env`.

## Comandos Disponibles

### Generar una nueva migración automáticamente

```bash
npm run migration:generate -- NombreDeLaMigracion
```

Este comando compara las entidades con el estado actual de la base de datos y genera una migración automáticamente.

**Ejemplo:**
```bash
npm run migration:generate -- CreateRequestsTables
```

**Nota:** El comando generará un archivo con timestamp automático en `migrations/`, por ejemplo: `1734567890123-CreateRequestsTables.ts`

### Crear una migración vacía (manual)

```bash
npm run migration:create -- NombreDeLaMigracion
```

**Ejemplo:**
```bash
npm run migration:create -- AddPhoneToUsers
```

**Nota:** El comando generará un archivo con timestamp automático en `migrations/`, por ejemplo: `1734567890123-AddPhoneToUsers.ts`

### Ejecutar migraciones pendientes

```bash
npm run migration:run
```

Este comando ejecuta todas las migraciones que aún no se han aplicado a la base de datos.

### Revertir la última migración

```bash
npm run migration:revert
```

Este comando revierte la última migración ejecutada.

### Ver el estado de las migraciones

```bash
npm run migration:show
```

Muestra qué migraciones se han ejecutado y cuáles están pendientes.

## Flujo de Trabajo Recomendado

1. **Crear o modificar entidades** en `src/`
2. **Generar migración automáticamente:**
   ```bash
   npm run migration:generate -- DescripcionDelCambio
   ```
3. **Revisar la migración generada** en `migrations/`
4. **Ejecutar la migración:**
   ```bash
   npm run migration:run
   ```

## Estructura de Migraciones

Las migraciones se guardan en la carpeta `migrations/` con el formato:
- `TIMESTAMP-DescripcionDeLaMigracion.ts`

Ejemplo: `1734567890123-CreateRequestsTables.ts`

## Variables de Entorno Requeridas

Asegúrate de tener configuradas estas variables en tu `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=nombre_base_datos
```

## Notas Importantes

- ⚠️ **NUNCA** uses `synchronize: true` en producción
- Siempre revisa las migraciones generadas antes de ejecutarlas
- Haz backup de la base de datos antes de ejecutar migraciones en producción
- Las migraciones deben ser reversibles cuando sea posible







