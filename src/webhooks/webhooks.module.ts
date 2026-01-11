import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { GhlModule } from "../ghl/ghl.module";
import { EvolutionWebhookGuard } from "./guards/evolution-webhook.guard";

@Module({
	imports: [GhlModule],
	controllers: [WebhooksController],
	providers: [EvolutionWebhookGuard],
})
export class WebhooksModule {}
