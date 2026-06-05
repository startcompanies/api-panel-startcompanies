# Modo vista del panel del cliente

Permite a **partners**, **admin** y **user** (staff SC) navegar el panel como un cliente, en **solo lectura**.

## API

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| POST | `/panel/view-as/start` | partner, admin, user | Body: `{ clientId }` o `{ clientUserId }`. Intercambia `access_token` y guarda el token del operador en `view_as_actor_access`. |
| POST | `/panel/view-as/end` | (cookies) | Restaura `access_token` del operador. |

Durante el modo vista, el JWT incluye `viewAs: true`, `viewAsActorId`, `viewAsActorType`, `viewAsClientLabel`.  
`GET /auth/me` devuelve esos campos junto al perfil del cliente.

Las mutaciones (`POST`/`PUT`/`PATCH`/`DELETE`) devuelven **403** salvo `POST /panel/view-as/end` y `POST /auth/logout`.  
`POST /auth/refresh` está bloqueado hasta salir del modo vista.

## Frontend

- Botón **Ver panel** en Mis clientes (partner) y Clientes (admin/user).
- Banner azul en el layout del panel con **Salir del modo vista**.

## Cookies

- `view_as_actor_access`: token de acceso del operador (HttpOnly, 2 h).
- `access_token`: token del cliente en modo vista (2 h).
