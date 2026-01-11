import { Module } from "@nestjs/common";
import { EvolutionApiClient } from "./evolution-api.client";

@Module({
	providers: [
		{
			provide: EvolutionApiClient,
			useFactory: () => {
				// EvolutionApiClient is instantiated per-instance with different credentials
				// This provider is for type availability; actual instances are created in GhlService
				return null;
			},
		},
	],
	exports: [EvolutionApiClient],
})
export class EvolutionModule {}
