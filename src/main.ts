import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configService } from './config/config.service';
import * as express from 'express';
import cookieParser from 'cookie-parser';

import { LoggingInterceptor } from './shared/common/interceptors/logging.interceptor';
import { ResponseSanitizerInterceptor } from './shared/common/interceptors/response-sanitizer.interceptor';
import { SocketIoAdapter } from './socket-io.adapter';
import { createCorsOriginCallback } from './config/cors-origins';

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
  app.useWebSocketAdapter(new SocketIoAdapter(app));
  
  // Configurar cookie parser para SSO
  app.use(cookieParser());

  // Stripe webhook necesita body crudo para validar firma.
  app.use('/billing/webhook', express.raw({ type: 'application/json' }));
  
  // Configurar límite de tamaño de peticiones
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Logging + saneamiento global de campos sensibles en respuestas
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseSanitizerInterceptor(),
  );


  app.enableCors({
    origin: createCorsOriginCallback(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-Session-Refresh'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('API Start Companies')
    .setDescription(
      'Documentación de la API para Start Companies LLC - Blog y Panel Administrativo',
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
