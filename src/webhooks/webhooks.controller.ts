import {
	Controller,
	Post,
	Body,
	UseGuards,
	HttpCode,
	HttpStatus, Res, BadRequestException,
	Headers,
	Logger,
	Req,
} from "@nestjs/common";
import { GhlService } from "../ghl/ghl.service";
import { GhlWebhookDto } from "../ghl/dto/ghl-webhook.dto";
import { EvolutionWebhookGuard } from "./guards/evolution-webhook.guard";
import { Response, Request } from "express";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowActionDto } from "../ghl/dto/workflow-action.dto";
import { WorkflowTokenGuard } from "./guards/workflow-token.guard";
import { Instance, User } from "@prisma/client";

// Extend Express Request to include instance from guard
interface EvolutionRequest extends Request {
	instance: Instance & { user: User };
}

@Controller("webhooks")
export class WebhooksController {
	private readonly logger = new Logger(WebhooksController.name);

	constructor(private readonly ghlService: GhlService, private configService: ConfigService, private prisma: PrismaService) {}

	@Post("evolution")
	@UseGuards(EvolutionWebhookGuard)
	@HttpCode(HttpStatus.OK)
	async handleEvolutionWebhook(
		@Body() webhook: Record<string, unknown>,
		@Req() req: EvolutionRequest,
		@Res() res: Response,
	): Promise<void> {
		this.logger.debug(`Evolution Webhook Body: ${JSON.stringify(webhook)}`);
		res.status(HttpStatus.OK).send();
		try {
			// Instance is attached by EvolutionWebhookGuard
			const instance = req.instance;
			if (!instance) {
				this.logger.error("No instance found in request - guard may have failed");
				return;
			}
			await this.ghlService.handleEvolutionWebhook(instance, webhook as any);
		} catch (error) {
			this.logger.error(`Error processing Evolution webhook`, error);
		}
	}

	@Post("workflow-action")
	@UseGuards(WorkflowTokenGuard)
	@HttpCode(HttpStatus.OK)
	async handleWorkflowAction(
		@Body() workflowAction: WorkflowActionDto,
		@Headers() headers: Record<string, string>,
		@Res() res: Response,
	): Promise<void> {
		try {
			const locationId = headers["locationid"];
			const contactPhone = headers["contactphone"];

			if (!locationId) {
				throw new BadRequestException("Location ID is required in headers");
			}
			if (!contactPhone) {
				throw new BadRequestException("Contact phone is required in headers");
			}
			if (!workflowAction.data.instanceId) {
				throw new BadRequestException("Instance ID is required");
			}

			const result = await this.ghlService.handleWorkflowAction({
				locationId,
				phone: contactPhone,
				actionType: workflowAction.data.url ? "send_file" : "send_message",
				message: workflowAction.data.message,
				fileUrl: workflowAction.data.url,
				fileName: workflowAction.data.caption,
			});

			res.status(HttpStatus.OK).json(result);
		} catch (error) {
			this.logger.error(`Error processing workflow action`, error);
			if (error instanceof BadRequestException) {
				res.status(error.getStatus()).json({
					success: false,
					error: error.message,
				});
			} else {
				res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
					success: false,
					error: error.message || "Internal server error while processing workflow action",
				});
			}
		}
	}

	@Post("ghl")
	@HttpCode(HttpStatus.OK)
	async handleGhlWebhook(@Body() ghlWebhook: GhlWebhookDto, @Res() res: Response): Promise<void> {
		this.logger.debug(`GHL Webhook Body: ${JSON.stringify(ghlWebhook)}`);

		const locationId = ghlWebhook.locationId;
		const messageId = ghlWebhook.messageId;
		try {
			if (!ghlWebhook.userId) {
				if (ghlWebhook.message && ghlWebhook.message.endsWith("\f\f\f\f\f")) {
					this.logger.log(`Skipping workflow message with marker for location ${locationId}`);
					res.status(HttpStatus.OK).send();
					return;
				}
				this.logger.log(`Processing message without userId (likely bot message) for location ${locationId}`);
			}
			const conversationProviderId = ghlWebhook.conversationProviderId === this.configService.get("GHL_CONVERSATION_PROVIDER_ID");

			if (!conversationProviderId) {
				this.logger.error("Conversation provider ID is wrong", ghlWebhook);
				throw new BadRequestException("Conversation provider ID is wrong");
			}

			if (!locationId) {
				this.logger.error("GHL Location ID is missing", ghlWebhook);
				throw new BadRequestException("Location ID is missing");
			}

			// Find active instance for this location
			const instances = await this.prisma.getInstancesByUserId(locationId);

			if (instances.length === 0) {
				this.logger.error(`No instances found for location ${locationId}`);
				res.status(HttpStatus.OK).send();
				return;
			}

			// Use the first (or only) instance
			const instance = instances[0];
			const user = await this.prisma.findUser(locationId);
			
			if (!user) {
				this.logger.error(`User not found for location ${locationId}`);
				res.status(HttpStatus.OK).send();
				return;
			}

			res.status(HttpStatus.OK).send();
			
			if (ghlWebhook.type === "SMS" && (ghlWebhook.message || (ghlWebhook.attachments && ghlWebhook.attachments.length > 0))) {
				const instanceWithUser = { ...instance, user };
				await this.ghlService.handleGhlOutboundMessage(instanceWithUser, ghlWebhook);
			} else {
				this.logger.log(`Ignoring GHL webhook type ${ghlWebhook.type}.`);
			}
		} catch (error) {
			this.logger.error(`Error processing GHL webhook for location ${locationId}`, error);
			res.status(HttpStatus.OK).send();
		}
	}
}
