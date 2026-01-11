import { Module } from "@nestjs/common";
import { EvolutionApiClient } from "./evolution-api.client";

@Module({
	providers: [EvolutionApiClient],
	exports: [EvolutionApiClient],
})
export class EvolutionModule {}
