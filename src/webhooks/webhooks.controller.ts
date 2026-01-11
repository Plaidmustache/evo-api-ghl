import {
	Controller,
	Post,
	Body,
	UseGuards,
	HttpCode,
	HttpStatus, Res, BadRequestException,
	Headers,
	Req,
} from "@nestjs/common";
import { GhlService } from "../ghl/ghl.service";
import { GreenApiLogger, GreenApiWebhook } from "@green-api/greenapi-integration";
import { GhlWebhookDto } from "../ghl/dto/ghl-webhook.dto";
import { GreenApiWebhookGuard } from "./guards/greenapi-webhook.guard";
import { EvolutionWebhookGuard } from "./guards/evolution-webhook.guard";
import { Response, Request } from "express";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowActionDto } from "../ghl/dto/workflow-action.dto";
import { WorkflowTokenGuard } from "./guards/workflow-token.guard";
import {
	EvolutionWebhookDto,
	EvolutionMessagesUpsertWebhookDto,
	EvolutionMessageContent,
} from "./dto/evolution-webhook.dto";
import type { Instance, User } from "@prisma/client";

@Controller("webhooks")
export class WebhooksController {
	private readonly logger = GreenApiLogger.getInstance(WebhooksController.name);

	constructor(private readonly ghlService: GhlService, private configService: ConfigService, private prisma: PrismaService) {}

	@Post("green-api")
	@UseGuards(GreenApiWebhookGuard)
	@HttpCode(HttpStatus.OK)
	async handleGreenApiWebhook(@Body() webhook: GreenApiWebhook, @Res() res: Response): Promise<void> {
		this.logger.debug(`Green API Webhook Body: ${JSON.stringify(webhook)}`);
		res.status(HttpStatus.OK).send();
		try {
			await this.ghlService.handleGreenApiWebhook(webhook, ["incomingMessageReceived", "stateInstanceChanged", "incomingCall"]);
		} catch (error) {
			this.logger.error(`Error processing Green API webhook`, error);
		}
	}

	@Post("evolution")
	@UseGuards(EvolutionWebhookGuard)
	@HttpCode(HttpStatus.OK)
	async handleEvolutionWebhook(
		@Body() webhook: EvolutionWebhookDto,
		@Req() req: Request & { instance?: Instance & { user: User } },
		@Res() res: Response,
	): Promise<void> {
		this.logger.debug(`Evolution API Webhook Body: ${JSON.stringify(webhook)}`);
		res.status(HttpStatus.OK).send();

		try {
			const instance = req.instance;
			if (!instance) {
				this.logger.error("Instance not attached to request by EvolutionWebhookGuard");
				return;
			}

			if (webhook.event === "messages.upsert") {
				await this.handleEvolutionMessagesUpsert(webhook as EvolutionMessagesUpsertWebhookDto, instance);
			} else {
				this.logger.warn(`Unhandled Evolution API event type: ${webhook.event}`);
			}
		} catch (error) {
			this.logger.error(`Error processing Evolution API webhook`, error);
		}
	}

	private async handleEvolutionMessagesUpsert(
		webhook: EvolutionMessagesUpsertWebhookDto,
		instance: Instance & { user: User },
	): Promise<void> {
		const { data } = webhook;

		// Skip messages from self to avoid echo loops
		if (data.key.fromMe) {
			this.logger.debug(`Skipping message from self (fromMe: true) for instance ${webhook.instance}`);
			return;
		}

		const remoteJid = data.key.remoteJid;
		const isGroup = remoteJid.endsWith("@g.us");
		const contactIdentifier = this.extractPhoneFromRemoteJid(remoteJid);

		if (!contactIdentifier) {
			this.logger.warn(`Could not extract phone/identifier from remoteJid: ${remoteJid}`);
			return;
		}

		// Extract message content
		const messageContent = this.extractMessageContent(data.message);
		if (!messageContent) {
			this.logger.warn(`Empty or unsupported message content for message ${data.key.id}`);
			return;
		}

		// Determine contact name
		const contactName = isGroup
			? `[Group] ${data.pushName || "Unknown Group"}`
			: data.pushName || `WhatsApp ${contactIdentifier}`;

		const logContext = isGroup
			? `group "${data.pushName || "Unknown"}" (${contactIdentifier})`
			: `individual ${contactName} (${contactIdentifier})`;

		this.logger.log(`Processing Evolution message from ${logContext}`);

		// Find or create GHL contact
		const ghlContact = await this.ghlService.getGhlContact(instance.userId, contactIdentifier);
		if (!ghlContact?.id) {
			this.logger.error(`Failed to find/create GHL contact for ${contactIdentifier}`);
			return;
		}

		// Build GHL platform message
		const ghlMessage = {
			contactId: ghlContact.id,
			locationId: instance.userId,
			message: messageContent,
			attachments: [] as { url: string }[],
		};

		// Send to GHL platform
		await this.ghlService.sendToPlatform(ghlMessage, instance);
		this.logger.log(`Evolution message ${data.key.id} routed to GHL for contact ${ghlContact.id}`);
	}

	/**
	 * Extracts phone number or group ID from Evolution API remoteJid
	 * Handles formats: 5511999999999@s.whatsapp.net, 5511999999999@c.us, groupid@g.us
	 */
	private extractPhoneFromRemoteJid(remoteJid: string): string | null {
		if (!remoteJid) return null;
		// Remove WhatsApp JID suffixes: @s.whatsapp.net, @c.us, @g.us
		return remoteJid.replace(/@(s\.whatsapp\.net|c\.us|g\.us)$/, "") || null;
	}

	/**
	 * Extracts text content from Evolution API message object
	 */
	private extractMessageContent(message?: EvolutionMessageContent): string | null {
		if (!message) return null;

		// Text message (conversation)
		if (message.conversation) {
			return message.conversation;
		}

		// Extended text message
		if (message.extendedTextMessage?.text) {
			return message.extendedTextMessage.text;
		}

		// Image with caption
		if (message.imageMessage?.caption) {
			return `[Image] ${message.imageMessage.caption}`;
		}
		if (message.imageMessage) {
			return "[Image]";
		}

		// Video with caption
		if (message.videoMessage?.caption) {
			return `[Video] ${message.videoMessage.caption}`;
		}
		if (message.videoMessage) {
			return "[Video]";
		}

		// Audio/Voice message
		if (message.audioMessage) {
			return message.audioMessage.ptt ? "[Voice Message]" : "[Audio]";
		}

		// Document
		if (message.documentMessage) {
			return `[Document: ${message.documentMessage.fileName || message.documentMessage.title || "file"}]`;
		}

		// Sticker
		if (message.stickerMessage) {
			return "[Sticker]";
		}

		// Contact
		if (message.contactMessage) {
			return `[Contact: ${message.contactMessage.displayName || "Unknown"}]`;
		}

		// Location
		if (message.locationMessage) {
			const name = message.locationMessage.name || message.locationMessage.address || "Location";
			return `[Location: ${name}]`;
		}

		return null;
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

			let actionType: "message" | "file" | "interactive-buttons" | "reply-buttons";
			if (workflowAction.data.url) {
				actionType = "file";
			} else if (workflowAction.data.button1Type) {
				actionType = "interactive-buttons";
			} else if (workflowAction.data.button1Text) {
				actionType = "reply-buttons";
			} else {
				actionType = "message";
			}

			const result = await this.ghlService.handleWorkflowAction(
				locationId,
				contactPhone,
				workflowAction.data,
				actionType,
			);

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
					this.logger.info(`Skipping workflow message with marker for location ${locationId}`);
					res.status(HttpStatus.OK).send();
					return;
				}
				this.logger.info(`Processing message without userId (likely bot message) for location ${locationId}`);
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
			let instanceId: string | bigint | null = null;
			const contact = await this.ghlService.getGhlContact(locationId, ghlWebhook.phone);
			if (contact?.tags) {
				instanceId = this.extractInstanceIdFromTags(contact.tags);
				if (instanceId) {
					this.logger.log(`Found instance ID from tags: ${instanceId}`);
				}
			}
			if (!instanceId) {
				this.logger.warn(
					`WhatsApp instance ID not found in contact custom fields for phone ${ghlWebhook.phone}, falling back to location instances`,
					{ghlWebhook, contact},
				);

				const instances = await this.prisma.getInstancesByUserId(locationId);

				if (instances.length === 0) {
					this.logger.error(`No instances found for location ${locationId}`);
					res.status(HttpStatus.OK).send();
					return;
				}
				if (instances.length === 1) {
					this.logger.log(`Using single instance ${instances[0].idInstance} for location ${locationId}`);
					instanceId = instances[0].idInstance;
				} else {
					const oldestInstance = instances.sort((a, b) =>
						a.createdAt.getTime() - b.createdAt.getTime(),
					)[0];
					this.logger.warn(`Multiple instances found for location ${locationId}, using oldest: ${oldestInstance.idInstance}`);
					instanceId = oldestInstance.idInstance;
				}
			}

			res.status(HttpStatus.OK).send();
			if (ghlWebhook.type === "SMS" && (ghlWebhook.message || (ghlWebhook.attachments && ghlWebhook.attachments.length > 0))) {
				await this.ghlService.handlePlatformWebhook(ghlWebhook, BigInt(instanceId));
			} else {
				this.logger.log(`Ignoring GHL webhook type ${ghlWebhook.type}.`);
			}
		} catch (error) {
			this.logger.error(`Error processing GHL webhook for location ${locationId}`, error);
			if (locationId && messageId) {
				try {
					await this.ghlService.updateGhlMessageStatus(locationId, messageId, "failed", {
						code: "500",
						type: "message_processing_error",
						message: error.message || "Failed to process outbound message",
					});
				} catch (statusUpdateError) {
					this.logger.error(
						`Failed to update GHL message ${messageId} status to "failed" for location ${locationId}. Error: ${statusUpdateError.message}`,
						statusUpdateError,
					);
				}
			}
			res.status(HttpStatus.OK).send();
		}
	}

	private extractInstanceIdFromTags(tags: string[]): string | null {
		if (!tags || tags.length === 0) return null;

		const instanceTag = tags.find(tag => tag.startsWith("whatsapp-instance-"));
		if (instanceTag) {
			return instanceTag.replace("whatsapp-instance-", "");
		}
		return null;
	}
}
