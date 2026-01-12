import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EvolutionApiClient } from "./evolution-api.client";

@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: EvolutionApiClient,
			useFactory: (configService: ConfigService) => {
				return new EvolutionApiClient(
					configService.get<string>("EVOLUTION_API_URL"),
					configService.get<string>("EVOLUTION_API_KEY"),
				);
			},
			inject: [ConfigService],
		},
	],
	exports: [EvolutionApiClient],
})
export class EvolutionModule {}
