import { Injectable, HttpException, HttpStatus, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance, AxiosError } from "axios";
import { GhlTransformer } from "./ghl.transformer";
import { PrismaService } from "../prisma/prisma.service";
import { GhlWebhookDto } from "./dto/ghl-webhook.dto";
import type { Instance, User } from "@prisma/client";
import { randomBytes } from "crypto";
import {
	GhlContact,
	GhlContactUpsertRequest,
	GhlContactUpsertResponse,
	GhlPlatformMessage,
	MessageStatusPayload, WorkflowActionData, WorkflowActionResult,
} from "../types";
import { EvolutionApiClient } from "../evolution/evolution-api.client";
import type { EvolutionWebhook } from "./types/evolution-webhook.types";

@Injectable()
export class GhlService {
	private readonly logger = new Logger(GhlService.name);
	private readonly ghlApiBaseUrl = "https://services.leadconnectorhq.com";
	private readonly ghlApiVersion = "2021-07-28";

	constructor(
		protected readonly ghlTransformer: GhlTransformer,
		protected readonly prisma: PrismaService,
		private readonly configService: ConfigService,
	) {
	}

	private async getHttpClient(ghlUserId: string): Promise<AxiosInstance> {
		const userWithTokens = await this.prisma.getUserWithTokens(ghlUserId);
		if (!userWithTokens || !userWithTokens.accessToken || !userWithTokens.refreshToken) {
			this.logger.error(`No tokens found for GHL User (Location ID): ${ghlUserId}`);
			throw new HttpException(`GHL auth tokens not found for User ${ghlUserId}. Re-authorize.`, HttpStatus.UNAUTHORIZED);
		}

		let currentAccessToken = userWithTokens.accessToken;

		if (userWithTokens.tokenExpiresAt && new Date(userWithTokens.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000) {
			this.logger.log(`GHL Access token for User ${ghlUserId} expiring. Refreshing...`);
			try {
				const newTokens = await this.refreshGhlAccessToken(userWithTokens.refreshToken);
				await this.prisma.updateUserTokens(
					ghlUserId, newTokens.access_token, newTokens.refresh_token,
					new Date(Date.now() + newTokens.expires_in * 1000),
				);
				currentAccessToken = newTokens.access_token;
				this.logger.log(`GHL Access token refreshed for User ${ghlUserId}`);
			} catch (error) {
				this.logger.error(`Failed to refresh GHL access token for User ${ghlUserId}: ${error.message}`);
				throw new HttpException(`Failed to refresh GHL token for User ${ghlUserId}. Re-authorize.`, HttpStatus.UNAUTHORIZED);
			}
		}

		const httpClient = axios.create({
			baseURL: this.ghlApiBaseUrl,
			headers: {
				Authorization: `Bearer ${currentAccessToken}`,
				Version: this.ghlApiVersion,
				"Content-Type": "application/json",
			},
		});

		httpClient.interceptors.response.use((response) => response, async (error: AxiosError) => {
			const originalRequest = error.config;
			const userForRetry = await this.prisma.getUserWithTokens(ghlUserId);
			if (!userForRetry?.refreshToken) {
				this.logger.error(`User ${ghlUserId} or refresh token disappeared during retry logic.`);
				throw error;
			}

			if (error.response?.status === 401 && originalRequest && !originalRequest.headers["_retry"]) {
				originalRequest.headers["_retry"] = true;
				this.logger.warn(`GHL API request 401 for User ${ghlUserId}. Retrying with token refresh.`);
				try {
					const newTokens = await this.refreshGhlAccessToken(userForRetry.refreshToken);
					await this.prisma.updateUserTokens(
						ghlUserId, newTokens.access_token, newTokens.refresh_token,
						new Date(Date.now() + newTokens.expires_in * 1000),
					);
					this.logger.log(`GHL Token refreshed after 401 for User ${ghlUserId}`);
					originalRequest.headers["Authorization"] = `Bearer ${newTokens.access_token}`;
					return httpClient(originalRequest);
				} catch (refreshError) {
					this.logger.error(`Failed to refresh GHL token after 401 for User ${ghlUserId}: ${refreshError.message}`);
					throw new HttpException(`GHL token refresh failed for User ${ghlUserId} after 401. Re-authorize.`, HttpStatus.UNAUTHORIZED);
				}
			}
			const status = error.response?.status;
			const data = error.response?.data;
			this.logger.error(`GHL API Error: [${originalRequest?.method?.toUpperCase()} ${originalRequest?.url}] ${status} – ${JSON.stringify(data)}`);
			throw new HttpException((data as any)?.message || "GHL API request failed", status || HttpStatus.INTERNAL_SERVER_ERROR);
		});
		return httpClient;
	}

	private async refreshGhlAccessToken(refreshToken: string): Promise<{
		access_token: string; refresh_token: string; expires_in: number;
		token_type: string; scope: string; userType: string; companyId: string;
	}> {
		const body = new URLSearchParams({
			client_id: this.configService.get<string>("GHL_CLIENT_ID")!,
			client_secret: this.configService.get<string>("GHL_CLIENT_SECRET")!,
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			user_type: "Location",
		});
		try {
			const response = await axios.post(`${this.ghlApiBaseUrl}/oauth/token`, body.toString(),
				{headers: {"Content-Type": "application/x-www-form-urlencoded"}});
			return response.data;
		} catch (error) {
			this.logger.error(`GHL Token Refresh Error: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
			throw new Error(`Failed to refresh GHL token: ${error.response?.data?.message || error.message}`);
		}
	}

	public async getGhlContact(
		ghlUserId: string,
		phone: string,
	): Promise<GhlContact | null> {
		const httpClient = await this.getHttpClient(ghlUserId);
		const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

		try {
			const {data}: { data: GhlContactUpsertResponse } = await httpClient.post("/contacts/upsert", {
				locationId: ghlUserId,
				phone: formattedPhone,
			});

			if (data && data.contact) {
				return data.contact;
			}
			return null;
		} catch (error) {
			this.logger.error(`Error getting GHL contact by phone ${formattedPhone} in Location ${ghlUserId}: ${error.message}`, error.response?.data);
			throw error;
		}
	}

	private async findOrCreateGhlContact(
		ghlUserId: string,
		phone: string,
		name?: string,
		instanceId?: string,
		isGroup?: boolean,
	): Promise<{ id: string; [key: string]: any }> {
		const httpClient = await this.getHttpClient(ghlUserId);

		let contactName: string;
		let tags = [`whatsapp-instance-${instanceId}`];
		const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

		if (isGroup) {
			contactName = `[Group] ${name || "Unknown Group"}`;
			tags.push("whatsapp-group");
		} else {
			contactName = name || `WhatsApp ${phone}`;
		}

		const upsertPayload: GhlContactUpsertRequest = {
			locationId: ghlUserId,
			phone: formattedPhone,
			name: contactName,
			source: "GREEN-API",
			tags: instanceId ? tags : undefined,
		};

		this.logger.log(`Upserting GHL contact for ${isGroup ? "group" : "phone"} ${formattedPhone} in Location ${ghlUserId} with payload:`, upsertPayload);

		try {
			const {data} = await httpClient.post("/contacts/upsert", upsertPayload);

			if (data && data.contact && data.contact.id) {
				this.logger.log(`Successfully upserted GHL contact. ID: ${data.contact.id} for ${isGroup ? "group" : "phone"} ${formattedPhone} in Location ${ghlUserId}`);
				return data.contact;
			} else {
				this.logger.error("Failed to upsert contact or get ID from response. Response data:", data);
				throw new Error("Could not get ID from GHL contact upsert response.");
			}
		} catch (error) {
			this.logger.error(`Error during GHL contact upsert for ${isGroup ? "group" : "phone"} ${phone} in Location ${ghlUserId}: ${error.message}`, error.response?.data);
			throw error;
		}
	}

	public async updateGhlMessageStatus(
		ghlLocationId: string,
		ghlMessageId: string,
		status: "delivered" | "read" | "failed" | "pending",
		errorDetails?: { code: string; type: string; message: string },
	): Promise<void> {
		this.logger.log(`Attempting to update GHL message ${ghlMessageId} to status ${status} for location ${ghlLocationId}`);

		try {
			const httpClient = await this.getHttpClient(ghlLocationId);
			const apiUrl = `/conversations/messages/${ghlMessageId}/status`;

			const payload: MessageStatusPayload = {status};

			if (status === "failed") {
				payload.error = errorDetails || {
					code: "1",
					type: "delivery_failed",
					message: "Message delivery failed",
				};
			}

			await httpClient.put(apiUrl, payload);
			this.logger.log(`Successfully updated GHL message ${ghlMessageId} to status ${status} for location ${ghlLocationId}`);
		} catch (error) {
			this.logger.error(
				`Failed to update GHL message status for message ${ghlMessageId} in location ${ghlLocationId} to ${status}: ${error.message}`,
				error.response?.data,
			);
			if (error instanceof HttpException) {
				throw error;
			}
			throw new IntegrationError(
				`GHL API call to update message status failed for message ${ghlMessageId}`,
				"GHL_API_ERROR",
				error.response?.status || 500,
				error.response?.data,
			);
		}
	}

	public async postOutboundMessageToGhl(
		locationId: string,
		contactId: string,
		messageContent: string,
		attachments?: string[],
	): Promise<void> {
		const httpClient = await this.createPlatformClient(locationId);
		const payload: any = {
			type: "Custom",
			contactId,
			message: messageContent + "\f\f\f\f\f",
			conversationProviderId: this.configService.get<string>("GHL_CONVERSATION_PROVIDER_ID")!,
		};

		this.logger.log(`Posting outbound message to GHL for contact ${contactId}`, payload);

		if (attachments && attachments.length > 0) {
			payload.attachments = attachments;
		}

		try {
			const {data: msgRes} = await httpClient.post("/conversations/messages", payload);
			this.logger.log(`Successfully posted outbound message to GHL for contact ${contactId}`, msgRes);

			const messageId = msgRes.messageId;

			setTimeout(async () => {
				try {
					await this.updateGhlMessageStatus(locationId, messageId, "delivered");
					this.logger.log(`Updated GHL message status to delivered`, {messageId});
				} catch (statusError) {
					this.logger.warn(`Failed to update GHL message status, but message was posted successfully`, {
						messageId,
						error: statusError.message,
					});
				}
			}, 5000);
		} catch (error) {
			this.logger.error(`Error posting outbound GHL message for contact ${contactId}`, error);
			throw error;
		}
	}

	private async postInboundMessageToGhl(
		ghlUserId: string,
		contactId: string,
		messageContent: string,
		attachments: GhlPlatformMessage["attachments"],
	): Promise<void> {
		const httpClient = await this.getHttpClient(ghlUserId);
		let conversationId: string;

		try {
			const {data: search} = await httpClient.get("/conversations/search", {
				params: {
					locationId: ghlUserId,
					contactId,
					limit: 1,
				},
			});
			if (search.conversations?.length > 0) {
				conversationId = search.conversations[0].id;
				this.logger.log(`Found existing GHL conversation ${conversationId} for contact ${contactId} in Location ${ghlUserId}`);
			} else {
				this.logger.log(`No existing GHL conversation for contact ${contactId} in Location ${ghlUserId}. Creating new one.`);
				const {data: create} = await httpClient.post("/conversations/", {
					locationId: ghlUserId,
					contactId,
				});
				conversationId = create.conversation?.id ?? create.id;
				if (!conversationId) {
					this.logger.error("Failed to get conversationId from create conversation response", create);
					throw new Error("Failed to create or retrieve conversation ID.");
				}
				this.logger.log(`Created new GHL conversation ${conversationId} for contact ${contactId} in Location ${ghlUserId}`);
			}
		} catch (error) {
			this.logger.error(`Error during get/create GHL conversation for contact ${contactId} in Location ${ghlUserId}: ${error.message}`, error.response?.data);
			throw error;
		}

		const payload: any = {
			type: "Custom",
			conversationId,
			message: messageContent,
			direction: "inbound",
			conversationProviderId: this.configService.get<string>("GHL_CONVERSATION_PROVIDER_ID"),
		};

		if (attachments && attachments.length > 0) {
			payload.attachments = attachments.map(att => att.url);
			this.logger.warn(`Sending attachments to GHL for custom inbound. Payload (array of URLs):`, payload.attachments);
		}

		this.logger.log(`Attempting to post inbound message to GHL for convo ${conversationId}. Payload:`, payload);
		try {
			const {data: msgRes} = await httpClient.post(
				`/conversations/messages/inbound`,
				payload,
			);
			this.logger.log(`Successfully posted inbound message to GHL conversation ${conversationId}. Response:`, msgRes);
			return msgRes;
		} catch (error) {
			this.logger.error(`Error posting inbound GHL message to convo ${conversationId}: ${error.message}. Payload sent:`, payload);
			this.logger.error("Error data:", error.response?.data);
			throw error;
		}
	}

	public async createPlatformClient(ghlUserId: string): Promise<AxiosInstance> {
		this.logger.log(`Creating platform client (AxiosInstance) for GHL User (Location): ${ghlUserId}.`);
		return this.getHttpClient(ghlUserId);
	}

	public async sendToPlatform(
		ghlMessageDto: GhlPlatformMessage,
		instance: Instance & { user: User },
	): Promise<void> {
		this.logger.log(`Sending message to GHL for instance ${instance.idInstance} linked to User (Loc) ${instance.userId}`);
		this.logger.debug(`GHL DTO: ${JSON.stringify(ghlMessageDto)}`);

		if (!instance.userId) throw new IntegrationError("Instance not linked to User (GHL Location).", "CONFIGURATION_ERROR");
		if (!ghlMessageDto.contactId) throw new IntegrationError("GHL Contact ID missing.", "DATA_ERROR");

		ghlMessageDto.locationId = instance.userId;

		try {
			await this.postInboundMessageToGhl(
				instance.userId,
				ghlMessageDto.contactId,
				ghlMessageDto.message,
				ghlMessageDto.attachments,
			);
			this.logger.log(`Message sent to GHL for contact ${ghlMessageDto.contactId} in User (Loc) ${instance.userId}.`);
		} catch (error) {
			this.logger.error(`Failed to send message to GHL: ${error.message}`, error.stack);
			throw error;
		}
	}

	public async handlePlatformWebhook(
		ghlWebhook: GhlWebhookDto,
		idInstance: number | bigint,
	): Promise<SendResponse> {
		const locationId = ghlWebhook.locationId;
		const messageId = ghlWebhook.messageId;

		let gaResponse: SendResponse;
		this.logger.log(`Handling GHL webhook for Green API Instance ID: ${idInstance}`);
		this.logger.debug(`GHL Webhook DTO: ${JSON.stringify(ghlWebhook)}`);

		const instance = await this.prisma.getInstance(BigInt(idInstance));
		if (!instance) throw new NotFoundError(`Instance ${idInstance} not found.`);
		if (!instance.user) throw new IntegrationError("Instance not linked to User.", "DATA_ERROR");
		if (instance.stateInstance !== "authorized") throw new IntegrationError("Instance is not authorized", "INSTANCE_NOT_AUTHORIZED");

		// TODO: Phase 4 (subtask-4-1) will implement Evolution API client for message sending
		// Get Evolution API credentials from instance settings
		const settings = instance.settings as { evolutionApiUrl?: string; evolutionApiKey?: string; instanceName?: string } | null;
		if (!settings?.evolutionApiUrl || !settings?.evolutionApiKey || !settings?.instanceName) {
			throw new IntegrationError("Instance missing Evolution API credentials", "CONFIGURATION_ERROR", 500);
		}

		const evolutionClient = new EvolutionApiClient(settings.evolutionApiUrl, settings.evolutionApiKey);
		const transformedMessage = this.ghlTransformer.toGreenApiMessage(ghlWebhook);

		this.logger.log(`Transformed GHL message to Evolution API format for instance ${idInstance}`);
		this.logger.debug(`Evolution API Message: ${JSON.stringify(transformedMessage)}`);

		switch (transformedMessage.type) {
			case "text":
				gaResponse = await evolutionClient.sendText(settings.instanceName, ghlWebhook.phone, transformedMessage.message);
				break;
			case "url-file":
				gaResponse = await evolutionClient.sendMedia(settings.instanceName, ghlWebhook.phone, {
					mediatype: "document",
					media: transformedMessage.file.url,
					fileName: transformedMessage.file.fileName,
					caption: transformedMessage.caption,
				});
				break;
			default:
				this.logger.error(`Unsupported message type from GHL transform: ${transformedMessage.type}`);
				throw new IntegrationError(`Invalid message type: ${transformedMessage.type}`, "INVALID_MESSAGE_TYPE", 500);
		}
		await this.updateGhlMessageStatus(locationId, messageId, "delivered");
		return gaResponse;
	}

	public async handleGreenApiWebhook(
		webhook: GreenApiWebhook,
		allowedTypes: WebhookType[],
	): Promise<void> {
		const idInstance = BigInt(webhook.instanceData.idInstance);
		this.logger.log(`Handling Green API webhook type: ${webhook.typeWebhook} for Instance: ${idInstance}`, webhook);
		if (!allowedTypes.includes(webhook.typeWebhook)) {
			this.logger.warn(`Skipping Green API webhook: type ${webhook.typeWebhook} not in allowed: ${allowedTypes.join(", ")}`);
			return;
		}

		const instance = await this.prisma.getInstance(idInstance);
		if (!instance) throw new NotFoundError(`Instance ${idInstance} not found.`);
		if (!instance.user || !instance.userId) {
			throw new IntegrationError("Instance not linked to User (GHL Location).", "CONFIGURATION_ERROR", 500, {idInstance: idInstance});
		}
		const instanceWithUser = instance as Instance & { user: User };

		try {
			if (webhook.typeWebhook === "stateInstanceChanged") {
				await this.handleStateInstanceWebhook(webhook);
			} else if (webhook.typeWebhook === "incomingMessageReceived") {
				const isGroup = webhook.senderData?.chatId?.endsWith("@g.us") || false;

				const contactIdentifier = webhook.senderData.chatId.replace(/@[cg]\.us$/, "");
				let contactName: string;
				let logContext: string;

				if (isGroup) {
					contactName = webhook.senderData.chatName || "Unknown Group";
					logContext = `group "${contactName}" (${contactIdentifier}) sent by ${webhook.senderData.senderName || "Unknown"}`;
				} else {
					contactName = webhook.senderData.senderName || webhook.senderData.senderContactName || `WhatsApp ${contactIdentifier}`;
					logContext = `individual ${contactName} (${contactIdentifier})`;
				}

				this.logger.log(`Processing message from ${logContext}`);

				const ghlContact = await this.findOrCreateGhlContact(
					instanceWithUser.userId,
					contactIdentifier,
					contactName,
					webhook.instanceData.idInstance.toString(),
					isGroup,
				);
				if (!ghlContact?.id) throw new IntegrationError("Failed to resolve GHL contact.", "GHL_API_ERROR");

				const transformedMsg = this.ghlTransformer.toPlatformMessage(webhook);
				transformedMsg.contactId = ghlContact.id;
				transformedMsg.locationId = instanceWithUser.userId;

				await this.sendToPlatform(transformedMsg, instanceWithUser);
			} else if (webhook.typeWebhook === "incomingCall") {
				const callerPhoneRaw = webhook.from;
				const normalizedPhone = callerPhoneRaw.split("@")[0];
				const callerName = `WhatsApp ${normalizedPhone}`;

				const ghlContact = await this.findOrCreateGhlContact(
					instanceWithUser.userId,
					normalizedPhone,
					callerName,
					webhook.instanceData.idInstance.toString(),
				);
				if (!ghlContact.id) throw new IntegrationError("Failed to resolve GHL contact for call.", "GHL_API_ERROR");

				const transformedCallMsg = this.ghlTransformer.toPlatformMessage(webhook);
				transformedCallMsg.contactId = ghlContact.id;
				transformedCallMsg.locationId = instanceWithUser.userId;

				await this.sendToPlatform(transformedCallMsg, instanceWithUser);
			} else {
				this.logger.warn(`Unhandled allowed Green API webhook type: ${webhook.typeWebhook}`);
			}
		} catch (error) {
			this.logger.error(`Error in handleGreenApiWebhook for instance ${idInstance}, type ${webhook.typeWebhook}: ${error.message}`, error.stack);
			throw new IntegrationError("Failed to handle Green API webhook", "GA_WEBHOOK_ERROR", 500);
		}
	}

	public async handleStateInstanceWebhook(webhook: StateInstanceWebhook): Promise<void> {
		const idInstance = BigInt(webhook.instanceData.idInstance);
		this.logger.log(`StateInstanceWebhook for instance ${idInstance}. New state: ${webhook.stateInstance}`);
		try {
			const dbInstance = await this.prisma.updateInstanceState(idInstance, webhook.stateInstance);
			const currentSettings = dbInstance.settings || {};
			if (webhook.instanceData.wid && webhook.instanceData.wid !== currentSettings.wid) {
				await this.prisma.updateInstanceSettings(idInstance, {
					...currentSettings,
					wid: webhook.instanceData.wid,
				});
				this.logger.log(`Instance ${idInstance} WID updated to ${webhook.instanceData.wid}.`);
			}
			this.logger.log(`Instance ${idInstance} state updated to ${webhook.stateInstance}.`);
		} catch (error) {
			this.logger.error(`Failed to update instance state for ${idInstance}: ${error.message}`, error.stack);
			throw error;
		}
	}

	public async createEvolutionInstanceForUser(
		ghlUserId: string,
		instanceName: string,
		evolutionApiUrl: string,
		evolutionApiKey: string,
		name?: string,
	): Promise<Instance> {
		this.logger.log(`Creating Evolution API instance ${instanceName} for User (GHL Location) ${ghlUserId}`);

		const ghlUser = await this.prisma.findUser(ghlUserId);
		if (!ghlUser) {
			throw new HttpException(`User (GHL Location) ${ghlUserId} not found.`, HttpStatus.NOT_FOUND);
		}

		// Create Evolution API client with provided credentials
		const evolutionClient = new EvolutionApiClient(evolutionApiUrl, evolutionApiKey);

		// Verify connection by getting connection state
		let connectionState: { state: string; statusReason?: string };
		try {
			connectionState = await evolutionClient.getConnectionState(instanceName);
		} catch (error) {
			this.logger.warn(`Failed to get connection state for instance ${instanceName}: ${error.message}.`);
			throw new HttpException("Invalid instance credentials or instance not found", HttpStatus.BAD_REQUEST);
		}

		// Map Evolution state to database state: 'open' -> 'authorized', others -> 'notAuthorized'
		const mappedState = connectionState.state === "open" ? "authorized" : "notAuthorized";
		this.logger.log(`Instance ${instanceName} connection state: ${connectionState.state} -> ${mappedState}`);

		// Configure webhook URL
		const appBaseUrl = this.configService.get<string>("APP_URL");
		const webhookToken = randomBytes(16).toString("hex");
		const webhookUrl = `${appBaseUrl}/webhooks/evolution`;

		// Store Evolution API settings including credentials
		const settings = {
			webhookUrl,
			webhookUrlToken: webhookToken,
			evolutionApiUrl,
			evolutionApiKey,
			instanceName,
		};

		// Generate a unique idInstance from instanceName for database compatibility
		// Using a hash of the instanceName to create a consistent BigInt
		const instanceHash = BigInt("0x" + Buffer.from(instanceName).toString("hex").slice(0, 15).padEnd(15, "0"));

		try {
			const dbInstance = await this.prisma.createInstance({
				idInstance: instanceHash,
				apiTokenInstance: evolutionApiKey, // Store API key for compatibility
				user: {
					connect: { id: ghlUserId },
				},
				settings,
				stateInstance: mappedState as "authorized" | "notAuthorized",
				name: name || `WhatsApp ${instanceName}`,
			});
			this.logger.log(`Instance ${instanceName} record created for User (Loc) ${ghlUserId}. DB ID: ${dbInstance.id}`);

			// Register webhook with Evolution API
			try {
				await evolutionClient.setWebhook(instanceName, {
					url: webhookUrl,
					webhookByEvents: true,
					webhookBase64: false,
					events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
				});
				this.logger.log(`Webhook registered for Evolution API instance ${instanceName}.`);
			} catch (error) {
				this.logger.error(`Failed to register webhook for Evolution API instance ${instanceName}: ${error.message}. DB record exists.`);
			}
			return dbInstance;
		} catch (error) {
			this.logger.error(`Failed to create Evolution API instance ${instanceName} for User ${ghlUserId}: ${error.message}`, error.stack);
			throw new HttpException("Failed to create instance", HttpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	public async handleWorkflowAction(
		locationId: string,
		contactPhone: string,
		data: WorkflowActionData,
		actionType: "message" | "file" | "interactive-buttons" | "reply-buttons",
	): Promise<WorkflowActionResult> {
		this.logger.log(`Processing ${actionType} workflow action for location ${locationId}`, {
			actionType,
			contactPhone,
			data,
		});

		const instance = await this.prisma.getInstance(BigInt(data.instanceId));
		if (!instance) {
			this.logger.error(`Instance ${data.instanceId} not found`, {data, locationId, contactPhone});
			throw new BadRequestException(`Instance ${data.instanceId} not found`);
		}
		if (!instance.user || instance.userId !== locationId) {
			this.logger.error(`Instance ${data.instanceId} does not belong to location ${locationId}`, {
				data,
				locationId,
				contactPhone,
			});
			throw new BadRequestException(`Instance ${data.instanceId} does not belong to location ${locationId}`);
		}
		if (instance.stateInstance !== "authorized") {
			this.logger.error(`Instance ${data.instanceId} is not authorized (state: ${instance.stateInstance})`, {
				data,
				locationId,
				contactPhone,
			});
			throw new BadRequestException(`Instance ${data.instanceId} is not authorized (state: ${instance.stateInstance})`);
		}

		const chatId = formatPhoneNumber(contactPhone);
		const cleanPhone = chatId.replace("@c.us", "");

		// Get Evolution API credentials from instance settings
		const settings = instance.settings as { evolutionApiUrl?: string; evolutionApiKey?: string; instanceName?: string } | null;
		if (!settings?.evolutionApiUrl || !settings?.evolutionApiKey || !settings?.instanceName) {
			throw new BadRequestException("Instance missing Evolution API credentials");
		}

		const evolutionClient = new EvolutionApiClient(settings.evolutionApiUrl, settings.evolutionApiKey);

		let sendResponse: { key: { id: string } };
		let ghlMessageContent: string;
		let ghlAttachments: string[] | undefined;

		switch (actionType) {
			case "message":
				if (!data.message) throw new Error("Message is required");
				sendResponse = await evolutionClient.sendText(settings.instanceName, cleanPhone, data.message);
				ghlMessageContent = data.message;
				this.logger.log(`Text message sent via Evolution API`, {
					instanceId: data.instanceId,
					messageId: sendResponse.key?.id,
				});
				break;

			case "file":
				if (!data.url || !data.fileName) throw new Error("URL and fileName are required for file messages");
				sendResponse = await evolutionClient.sendMedia(settings.instanceName, cleanPhone, {
					mediatype: "document",
					media: data.url,
					fileName: data.fileName,
					caption: data.caption,
				});
				ghlMessageContent = data.caption ? data.caption : `[File: ${data.fileName}]`;
				ghlAttachments = [data.url];
				this.logger.log(`File sent via Evolution API`, {
					instanceId: data.instanceId,
					messageId: sendResponse.key?.id,
					fileName: data.fileName,
				});
				break;

			case "interactive-buttons":
				// Evolution API doesn't support interactive buttons - convert to text message with button options
				if (!data.body) throw new Error("Body is required for interactive buttons");
				const buttons = this.buildInteractiveButtons(data);
				if (buttons.length === 0) throw new Error("At least one button is required");

				ghlMessageContent = this.formatInteractiveButtonsForGhl(data, buttons);
				sendResponse = await evolutionClient.sendText(settings.instanceName, cleanPhone, ghlMessageContent);
				this.logger.log(`Interactive buttons sent as text via Evolution API`, {
					instanceId: data.instanceId,
					messageId: sendResponse.key?.id,
					buttonCount: buttons.length,
				});
				break;

			case "reply-buttons":
				// Evolution API doesn't support reply buttons - convert to text message with button options
				if (!data.body) throw new Error("Body is required for reply buttons");
				const replyButtons = this.buildReplyButtons(data);
				if (replyButtons.length === 0) throw new Error("At least one button is required");

				ghlMessageContent = this.formatReplyButtonsForGhl(data, replyButtons);
				sendResponse = await evolutionClient.sendText(settings.instanceName, cleanPhone, ghlMessageContent);
				this.logger.log(`Reply buttons sent as text via Evolution API`, {
					instanceId: data.instanceId,
					messageId: sendResponse.key?.id,
					buttonCount: replyButtons.length,
				});
				break;

			default:
				throw new Error(`Unsupported action type: ${actionType}`);
		}

		const ghlContact = await this.getGhlContact(locationId, cleanPhone);
		if (!ghlContact) {
			this.logger.warn(`Could not find/create GHL contact for phone ${cleanPhone}`);
			return {
				success: true,
				messageId: sendResponse.key?.id,
				warning: `${actionType} sent but contact not found in GHL`,
			};
		}

		await this.postOutboundMessageToGhl(locationId, ghlContact.id, ghlMessageContent, ghlAttachments);

		this.logger.log(`Outbound ${actionType} posted to GHL conversation`, {
			contactId: ghlContact.id,
			locationId,
			data,
			contactPhone,
		});

		return {
			success: true,
			messageId: sendResponse.key?.id,
			contactId: ghlContact.id,
		};
	}

	private buildInteractiveButtons(data: WorkflowActionData): Array<{
		type: "copy" | "call" | "url";
		buttonId: string;
		buttonText: string;
		copyCode?: string;
		phoneNumber?: string;
		url?: string;
	}> {
		const buttons: SendInteractiveButtons["buttons"] = [];

		if (data.button1Type && data.button1Text && data.button1Value) {
			buttons.push({
				type: data.button1Type as "copy" | "call" | "url",
				buttonId: "1",
				buttonText: data.button1Text,
				...(data.button1Type === "copy" && {copyCode: data.button1Value}),
				...(data.button1Type === "call" && {phoneNumber: data.button1Value}),
				...(data.button1Type === "url" && {url: data.button1Value}),
			});
		}

		if (data.button2Type && data.button2Text && data.button2Value) {
			buttons.push({
				type: data.button2Type as "copy" | "call" | "url",
				buttonId: "2",
				buttonText: data.button2Text,
				...(data.button2Type === "copy" && {copyCode: data.button2Value}),
				...(data.button2Type === "call" && {phoneNumber: data.button2Value}),
				...(data.button2Type === "url" && {url: data.button2Value}),
			});
		}

		if (data.button3Type && data.button3Text && data.button3Value) {
			buttons.push({
				type: data.button3Type as "copy" | "call" | "url",
				buttonId: "3",
				buttonText: data.button3Text,
				...(data.button3Type === "copy" && {copyCode: data.button3Value}),
				...(data.button3Type === "call" && {phoneNumber: data.button3Value}),
				...(data.button3Type === "url" && {url: data.button3Value}),
			});
		}

		return buttons;
	}

	private buildReplyButtons(data: WorkflowActionData): Array<{
		buttonId: string;
		buttonText: string;
	}> {
		const buttons: SendInteractiveButtonsReply["buttons"] = [];

		if (data.button1Text) {
			buttons.push({buttonId: "1", buttonText: data.button1Text});
		}
		if (data.button2Text) {
			buttons.push({buttonId: "2", buttonText: data.button2Text});
		}
		if (data.button3Text) {
			buttons.push({buttonId: "3", buttonText: data.button3Text});
		}

		return buttons;
	}

	private formatInteractiveButtonsForGhl(data: WorkflowActionData, buttons: any[]): string {
		const buttonsList = buttons.map(btn => {
			let buttonDesc = `• ${btn.buttonText}`;
			if (btn.type === "url" && btn.url) buttonDesc += ` (${btn.url})`;
			else if (btn.type === "call" && btn.phoneNumber) buttonDesc += ` (📞 ${btn.phoneNumber})`;
			else if (btn.type === "copy" && btn.copyCode) buttonDesc += ` (📋 ${btn.copyCode})`;
			return buttonDesc;
		}).join("\n");

		return [
			data.header && `${data.header}`,
			data.body,
			data.footer && `${data.footer}`,
			`\nButtons:\n${buttonsList}`,
		].filter(Boolean).join("\n");
	}

	private formatReplyButtonsForGhl(data: WorkflowActionData, buttons: any[]): string {
		const buttonsList = buttons.map(btn => `• ${btn.buttonText}`).join("\n");

		return [
			data.header && `${data.header}`,
			data.body,
			data.footer && `${data.footer}`,
			`\nReply options:\n${buttonsList}`,
		].filter(Boolean).join("\n");
	}
}
