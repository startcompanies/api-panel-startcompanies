import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configService } from './config/config.service';
import * as express from 'express';
import cookieParser from 'cookie-parser';

import { ResponseSanitizerInterceptor } from './shared/common/interceptors/response-sanitizer.interceptor';
import { ThrottlerExceptionFilter } from './shared/common/filters/throttler-exception.filter';
import { SocketIoAdapter } from './socket-io.adapter';
import { createCorsOriginCallback, logAllowedCorsOrigins, setRuntimeTenantCorsOrigins } from './config/cors-origins';
import {
  NOINDEX_ROBOTS_HEADER_VALUE,
  shouldSendNoIndexHeaders,
} from './config/noindex-headers.util';
import { PartnerTenantsService } from './panel/partner-tenants/partner-tenants.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpServer = app.getHttpAdapter().getInstance() as {
    set?: (key: string, val: unknown) => void;
    disable?: (key: string) => void;
  };
  if (typeof httpServer?.set === 'function') {
    httpServer.set('trust proxy', 1);
  }
  if (typeof httpServer?.disable === 'function') {
    httpServer.disable('x-powered-by');
  }

  // Staging / dev / local: impedir indexación en buscadores (todas las respuestas HTTP).
  app.use((req, res, next) => {
    const host =
      (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
    if (shouldSendNoIndexHeaders(host)) {
      res.setHeader('X-Robots-Tag', NOINDEX_ROBOTS_HEADER_VALUE);
    }
    next();
  });

  // Configurar cookie parser para SSO
  app.use(cookieParser());

  // Stripe webhook necesita body crudo para validar firma.
  app.use('/billing/webhook', express.raw({ type: 'application/json' }));
  app.use('/webhooks/plaid', express.raw({ type: 'application/json' }));
  
  // Configurar límite de tamaño de peticiones
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.useGlobalFilters(new ThrottlerExceptionFilter());
  app.useGlobalInterceptors(new ResponseSanitizerInterceptor());

  try {
    const tenantOrigins = await app
      .get(PartnerTenantsService)
      .listActiveFrontendOrigins();
    setRuntimeTenantCorsOrigins(tenantOrigins);
    if (tenantOrigins.length > 0) {
      console.log(
        `[CORS] Dominios white-label activos (BD): ${tenantOrigins.join(', ')}`,
      );
    }
  } catch (err) {
    console.warn(
      '[CORS] No se pudieron cargar orígenes de partner_tenants:',
      err,
    );
  }
  logAllowedCorsOrigins();

  app.useWebSocketAdapter(new SocketIoAdapter(app));

  app.enableCors({
    origin: createCorsOriginCallback(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Tenant-Host',
    ],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-Session-Refresh'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('API Start Companies')
    .setDescription(
      'Documentación de la API para Start Companies LLC - Panel Administrativo',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/explorer', app, document);

  //app.setGlobalPrefix('api');

  const port = configService.getPort() ?? 3000;
  // Escuchar en 0.0.0.0 para que sea accesible desde fuera del contenedor Docker
  await app.listen(port, '0.0.0.0');

  console.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap();
