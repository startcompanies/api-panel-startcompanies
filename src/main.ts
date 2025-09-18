import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS para permitir peticiones desde dominios especificos
  app.enableCors({
    origin: [
      'http://localhost:4200',
      'http://localhost:4000',
      'http://0.0.0.0:4000',
      'https://startcompanies.us'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
  });

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('API de Blog')
    .setDescription(
      'Documentación de la API de blog para el sitio de Start Companies LLC',
    )
    .setVersion('1.0')
    .addTag('posts') // Agrega un tag para agrupar endpoints relacionados
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
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
