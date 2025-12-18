# Migraciones de Base de Datos

Esta carpeta contiene las migraciones de TypeORM para el proyecto.

## Uso

### Generar una nueva migración

```bash
npm run migration:generate -- migrations/NombreDeLaMigracion
```

### Crear una migración vacía

```bash
npm run migration:create -- migrations/NombreDeLaMigracion
```

### Ejecutar migraciones

```bash
npm run migration:run
```

### Revertir última migración

```bash
npm run migration:revert
```

### Ver estado de migraciones

```bash
npm run migration:show
```

## Estructura

Las migraciones se nombran con el formato:
```
TIMESTAMP-NombreDescriptivo.ts
```

Ejemplo: `1734567890123-AddPhoneToUsers.ts`

## Notas

- Las migraciones se ejecutan en orden cronológico
- Siempre revisa las migraciones generadas antes de ejecutarlas
- Haz backup de la base de datos antes de ejecutar migraciones en producción


