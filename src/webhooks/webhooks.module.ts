import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { GhlModule } from "../ghl/ghl.module";

@Module({
	imports: [GhlModule],
	controllers: [WebhooksController],
	providers: [],
})
export class WebhooksModule {}
