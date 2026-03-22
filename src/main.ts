import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configService } from './config/config.service';
import * as express from 'express';
import cookieParser from 'cookie-parser';

import { LoggingInterceptor } from './shared/common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Configurar cookie parser para SSO
  app.use(cookieParser());
  
  // Configurar límite de tamaño de peticiones
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Registrar interceptor de logging globalmente
  app.useGlobalInterceptors(new LoggingInterceptor());


  // Habilitar CORS para permitir peticiones desde dominios especificos
  const allowedOrigins = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'https://startcompanies.us',
    'https://admin-blog.startcompanies.us',
    'https://staging.startcompanies.io',
    'https://startcompanies.io',
  ];

  // Agregar dominios de Zoho si están configurados
  if (process.env.ZOHO_CRM_DOMAINS) {
    const zohoDomains = process.env.ZOHO_CRM_DOMAINS.split(',').map(d => d.trim());
    allowedOrigins.push(...zohoDomains);
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Authorization'],
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
