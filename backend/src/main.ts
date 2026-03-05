import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';


async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Настройка шаблонизатора EJS
  app.setViewEngine('ejs');
  app.setBaseViewsDir(join(__dirname, '..', 'views'));

  app.useStaticAssets(join(__dirname, '..', 'views'));

  const config = new DocumentBuilder()
  .setTitle('Liquidity Bot API')
  .setDescription('API для управления ликвидностью на Raydium CLMM')
  .setVersion('1.0')
  .addTag('swap', 'Операции обмена токенов')
  .addTag('liquidity', 'Управление ликвидностью')
  .addTag('monitoring', 'Мониторинг позиций')
  .addTag('transaction', 'История транзакций')
  .addTag('auth', 'Аутентификация')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'JWT',
      description: 'Enter JWT token',
      in: 'header',
    },
    'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controllers!
  )
  .build();
  
  const document = SwaggerModule.createDocument(app, config);

  // Write swagger.json to docs directory
  const swaggerPath = join(process.cwd(), 'docs', 'swagger.json');
  writeFileSync(swaggerPath, JSON.stringify(document, null, 2));
  console.log(`Swagger JSON generated at: ${swaggerPath}`);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Liquidity Bot API Docs',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
