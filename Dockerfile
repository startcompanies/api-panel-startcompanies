# ============================================
# Dockerfile optimizado para producción en Dokploy
# Backend NestJS - API Panel Start Companies
# ============================================

# Etapa 1: Build de la aplicación
FROM node:20-alpine AS builder

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copiar archivos de dependencias primero (para mejor cache de Docker)
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies para el build)
RUN npm install --legacy-peer-deps && \
    npm cache clean --force

# Copiar el resto del código fuente
COPY . .

# Construir la aplicación
RUN npm run build

# ============================================
# Etapa 2: Imagen de producción
# ============================================

FROM node:20-alpine AS production

# Instalar dumb-init para manejo correcto de señales
RUN apk add --no-cache dumb-init

WORKDIR /app

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copiar solo los archivos necesarios desde el builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# Instalar solo dependencias de producción
RUN npm install --only=production --legacy-peer-deps && \
    npm cache clean --force

# Script de wipe del panel (npm run db:wipe-panel / db:wipe-panel:prod) + SQL
COPY --from=builder --chown=nestjs:nodejs /app/scripts/db-wipe-panel.cjs ./scripts/db-wipe-panel.cjs
COPY --from=builder --chown=nestjs:nodejs /app/scripts/sql/panel-wipe-keep-blog-staff.sql ./scripts/sql/panel-wipe-keep-blog-staff.sql

# Cambiar al usuario no-root
USER nestjs

# Exponer el puerto (Dokploy puede configurar esto)
EXPOSE 3002

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3002

# Healthcheck para Dokploy
# Verifica que la API esté respondiendo (cualquier respuesta 2xx o 4xx indica que el servidor está activo)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/api', (r) => {process.exit(r.statusCode >= 200 && r.statusCode < 500 ? 0 : 1)})"

# Usar dumb-init para manejo correcto de señales
ENTRYPOINT ["dumb-init", "--"]

# Comando para iniciar la aplicación
CMD ["npm", "run", "start:prod"]

