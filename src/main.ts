import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger, ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { ValidationExceptionFilter } from "./filters/validation-exception.filter";

declare global {
	namespace PrismaJson {
		// noinspection JSUnusedGlobalSymbols
		type InstanceSettings = Record<string, unknown>;
	}
}

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {});
	app.useGlobalFilters(new ValidationExceptionFilter());
	app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true, forbidNonWhitelisted: true}));
	app.use(helmet());
	app.enableShutdownHooks();
	await app.listen(3000);
}

void bootstrap();
