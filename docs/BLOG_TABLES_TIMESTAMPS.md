# Tablas del blog: createdAt y updatedAt

## Validación (después de la migración 1769303000000)

| Tabla       | createdAt | updatedAt | description |
|------------|-----------|-----------|-------------|
| **posts**  | Sí        | Sí        | Sí (nuevo)  |
| **categories** | Sí    | Sí        | Sí (nuevo)  |
| **tags**   | Sí        | Sí        | —           |
| **post_categories** | No (tabla join) | No | — |
| **post_tags**      | No (tabla join) | No | — |

Las tablas de relación many-to-many (`post_categories`, `post_tags`) no tienen `createdAt` ni `updatedAt` por diseño; solo relacionan IDs. Las entidades principales del blog (posts, categories, tags) quedan con timestamps tras la migración `AddDescriptionAndTimestampsToBlog`.
