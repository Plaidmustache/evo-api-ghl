import { Injectable, HttpException, HttpStatus, BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance, AxiosError } from "axios";
import { GhlTransformer } from "./ghl.transformer";
import { PrismaService } from "../prisma/prisma.service";
import { GhlWebhookDto } from "./dto/ghl-webhook.dto";
import type { Instance, User, InstanceState } from "@prisma/client";
import { InstanceState as InstanceStateEnum } from "@prisma/client";
import { randomBytes } from "crypto";
import {
	GhlContact,
	GhlContactUpsertRequest,
	GhlContactUpsertResponse,
	GhlPlatformMessage,
	MessageStatusPayload, WorkflowActionData, WorkflowActionResult,
} from "../types";

// Type definitions for Evolution API webhooks and responses
type EvolutionWebhookType = "incomingMessageReceived" | "stateInstanceChanged" | "incomingCall" | "outgoingMessageSent" | "messageDelivered" | "messageRead";

interface EvolutionWebhook {
	typeWebhook: EvolutionWebhookType;
	instanceData: {
		idInstance: number | string;
		wid?: string;
	};
	timestamp: number;
	senderData?: {
		chatId: string;
		chatName?: string;
		sender?: string;
		senderName?: string;
		senderContactName?: string;
	};
	messageData?: any;
	from?: string;
	status?: string;
	stateInstance?: string;
}

interface StateInstanceWebhook extends EvolutionWebhook {
	stateInstance: string;
}

interface SendResponse {
	idMessage: string;
}

interface SendInteractiveButtonsReply {
	buttons: Array<{ buttonId: string; buttonText: string }>;
}

interface SendInteractiveButtons {
	buttons: Array<{
		type: "copy" | "call" | "url";
		buttonId: string;
		buttonText: string;
		copyCode?: string;
		phoneNumber?: string;
		url?: string;
	}>;
}

interface WaSettings {
	phone?: string;
	stateInstance?: string;
}

interface Settings {
	webhookUrl: string;
	webhookUrlToken: string;
	incomingWebhook: string;
	incomingCallWebhook: string;
	stateWebhook: string;
	wid?: string;
}

// Evolution API client interface
interface EvolutionClient {
	sendMessage(params: { chatId: string; message: string; linkPreview?: boolean }): Promise<SendResponse>;
	sendFileByUrl(params: { chatId: string; file: { url: string; fileName: string }; caption?: string }): Promise<SendResponse>;
	sendInteractiveButtons(params: { chatId: string; header?: string; body: string; footer?: string; buttons: SendInteractiveButtons["buttons"] }): Promise<SendResponse>;
	sendInteractiveButtonsReply(params: { chatId: string; header?: string; body: string; footer?: string; buttons: SendInteractiveButtonsReply["buttons"] }): Promise<SendResponse>;
	getWaSettings(): Promise<WaSettings>;
	setSettings(settings: Settings): Promise<void>;
}

// Helper function to format phone number for chat ID
function formatPhoneNumber(phone: string, type: "private" | "group" = "private"): string {
	const cleaned = phone.replace(/\D/g, "");
	return type === "group" ? `${cleaned}@g.us` : `${cleaned}@c.us`;
}

// Helper to convert string state to InstanceState enum
function parseInstanceState(state: string | undefined): InstanceState | null {
	if (!state) return null;
	switch (state.toLowerCase()) {
		case "open":
		case "authorized":
			return InstanceStateEnum.open;
		case "close":
		case "closed":
		case "notauthorized":
			return InstanceStateEnum.close;
		case "connecting":
			return InstanceStateEnum.connecting;
		default:
			return null;
	}
}

@Injectable()
export class GhlService {
	private readonly logger = new Logger(GhlService.name);
	private readonly ghlApiBaseUrl = "https://services.leadconnectorhq.com";
	private readonly ghlApiVersion = "2021-07-28";

	constructor(
		private readonly ghlTransformer: GhlTransformer,
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
	) {}

	/**
	 * Creates an Evolution API client for the given instance credentials
	 */
	private createEvolutionClient(instance: { instanceName: string; evolutionApiUrl: string; evolutionApiKey: string }): EvolutionClient {
		const client = axios.create({
			baseURL: `${instance.evolutionApiUrl}/message/sendText/${instance.instanceName}`,
			headers: {
				"apikey": instance.evolutionApiKey,
				"Content-Type": "application/json",
			},
		});

		const baseClient = axios.create({
			baseURL: instance.evolutionApiUrl,
			headers: {
				"apikey": instance.evolutionApiKey,
				"Content-Type": "application/json",
			},
		});

		return {
			async sendMessage(params): Promise<SendResponse> {
				const response = await baseClient.post(`/message/sendText/${instance.instanceName}`, {
					number: params.chatId,
					text: params.message,
					linkPreview: params.linkPreview,
				});
				return { idMessage: response.data?.key?.id || response.data?.messageId || "sent" };
			},
			async sendFileByUrl(params): Promise<SendResponse> {
				const response = await baseClient.post(`/message/sendMedia/${instance.instanceName}`, {
					number: params.chatId,
					mediatype: "document",
					media: params.file.url,
					fileName: params.file.fileName,
					caption: params.caption,
				});
				return { idMessage: response.data?.key?.id || response.data?.messageId || "sent" };
			},
			async sendInteractiveButtons(params): Promise<SendResponse> {
				const response = await baseClient.post(`/message/sendButtons/${instance.instanceName}`, {
					number: params.chatId,
					title: params.header,
					description: params.body,
					footer: params.footer,
					buttons: params.buttons,
				});
				return { idMessage: response.data?.key?.id || response.data?.messageId || "sent" };
			},
			async sendInteractiveButtonsReply(params): Promise<SendResponse> {
				const response = await baseClient.post(`/message/sendButtons/${instance.instanceName}`, {
					number: params.chatId,
					title: params.header,
					description: params.body,
					footer: params.footer,
					buttons: params.buttons,
				});
				return { idMessage: response.data?.key?.id || response.data?.messageId || "sent" };
			},
			async getWaSettings(): Promise<WaSettings> {
				const response = await baseClient.get(`/instance/connectionState/${instance.instanceName}`);
				return {
					stateInstance: response.data?.state,
				};
			},
			async setSettings(settings: Settings): Promise<void> {
				await baseClient.post(`/webhook/set/${instance.instanceName}`, {
					webhook: {
						url: settings.webhookUrl,
						headers: { token: settings.webhookUrlToken },
						events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "CALL"],
					},
				});
			},
		};
	}

	/**
	 * Creates a new Evolution API instance for a user
	 */
	async createEvolutionInstanceForUser(
		userId: string,
		instanceName: string,
		evolutionApiUrl: string,
		evolutionApiKey: string,
		name?: string,
	): Promise<Instance> {
		// Verify the Evolution API credentials by checking connection
		const testClient = this.createEvolutionClient({ instanceName, evolutionApiUrl, evolutionApiKey });
		
		try {
			await testClient.getWaSettings();
		} catch (error) {
			this.logger.error(`Failed to verify Evolution API credentials: ${error.message}`);
			const err = new Error("Invalid Evolution API credentials or instance not found");
			(err as any).code = "INVALID_CREDENTIALS";
			throw err;
		}

		// Create instance in database
		const instance = await this.prisma.createInstance({
			instanceName,
			evolutionApiUrl,
			evolutionApiKey,
			userId,
			stateInstance: InstanceStateEnum.connecting,
			name,
		});

		// Set up webhook for this instance
		const webhookUrl = this.configService.get<string>("WEBHOOK_URL") || 
			`${this.configService.get<string>("APP_URL")}/webhooks/evolution`;
		const webhookToken = randomBytes(32).toString("hex");

		try {
			await testClient.setSettings({
				webhookUrl,
				webhookUrlToken: webhookToken,
				incomingWebhook: "yes",
				incomingCallWebhook: "yes", 
				stateWebhook: "yes",
			});

			await this.prisma.updateInstanceSettings(instance.id, { webhookToken });
		} catch (error) {
			this.logger.warn(`Failed to set webhook for instance ${instanceName}: ${error.message}`);
		}

		return instance;
	}

	/**
	 * Creates an authenticated GHL API client for a user
	 */
	private createGhlClient(user: User): AxiosInstance {
		return axios.create({
			baseURL: this.ghlApiBaseUrl,
			headers: {
				Authorization: `Bearer ${user.accessToken}`,
				Version: this.ghlApiVersion,
				"Content-Type": "application/json",
			},
		});
	}

	/**
	 * Refreshes OAuth tokens for a user
	 */
	async refreshUserTokens(user: User): Promise<User> {
		const clientId = this.configService.get<string>("GHL_CLIENT_ID");
		const clientSecret = this.configService.get<string>("GHL_CLIENT_SECRET");

		try {
			const response = await axios.post(
				"https://services.leadconnectorhq.com/oauth/token",
				new URLSearchParams({
					client_id: clientId!,
					client_secret: clientSecret!,
					grant_type: "refresh_token",
					refresh_token: user.refreshToken!,
				}),
				{
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
				},
			);

			const { access_token, refresh_token, expires_in } = response.data;
			const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

			return await this.prisma.updateUserTokens(
				user.id,
				access_token,
				refresh_token,
				tokenExpiresAt,
			);
		} catch (error) {
			this.logger.error(`Failed to refresh tokens for user ${user.id}: ${error.message}`);
			throw new HttpException("Failed to refresh authentication", HttpStatus.UNAUTHORIZED);
		}
	}

	/**
	 * Gets or refreshes a valid GHL client for a user
	 */
	private async getValidGhlClient(user: User): Promise<{ client: AxiosInstance; user: User }> {
		let currentUser = user;

		if (currentUser.tokenExpiresAt && new Date(currentUser.tokenExpiresAt) <= new Date()) {
			currentUser = await this.refreshUserTokens(currentUser);
		}

		return { client: this.createGhlClient(currentUser), user: currentUser };
	}

	/**
	 * Upserts a contact in GHL
	 */
	async upsertContact(
		user: User,
		contactData: GhlContactUpsertRequest,
	): Promise<GhlContactUpsertResponse> {
		const { client } = await this.getValidGhlClient(user);

		try {
			const response = await client.post<GhlContactUpsertResponse>(
				"/contacts/upsert",
				contactData,
			);
			return response.data;
		} catch (error) {
			this.logger.error(`Failed to upsert contact: ${error.message}`);
			throw new HttpException("Failed to create/update contact", HttpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Gets a contact by ID from GHL
	 */
	async getContact(user: User, contactId: string): Promise<GhlContact | null> {
		const { client } = await this.getValidGhlClient(user);

		try {
			const response = await client.get<{ contact: GhlContact }>(`/contacts/${contactId}`);
			return response.data.contact;
		} catch (error) {
			if ((error as AxiosError).response?.status === 404) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Searches for a contact by phone in GHL
	 */
	async findContactByPhone(user: User, phone: string): Promise<GhlContact | null> {
		const { client } = await this.getValidGhlClient(user);

		try {
			const response = await client.get<{ contacts: GhlContact[] }>("/contacts/", {
				params: {
					locationId: user.id,
					query: phone,
				},
			});

			const contacts = response.data.contacts || [];
			return contacts.find(c => c.phone === phone) || contacts[0] || null;
		} catch (error) {
			this.logger.error(`Failed to search contacts: ${error.message}`);
			return null;
		}
	}

	/**
	 * Handles incoming Evolution API webhook
	 */
	async handleEvolutionWebhook(
		instance: Instance & { user: User },
		webhook: EvolutionWebhook,
	): Promise<void> {
		this.logger.log(`Handling Evolution webhook: ${webhook.typeWebhook} for instance ${instance.instanceName}`);

		switch (webhook.typeWebhook) {
			case "stateInstanceChanged":
				await this.handleStateChange(instance, webhook as StateInstanceWebhook);
				break;
			case "incomingMessageReceived":
				await this.handleIncomingMessage(instance, webhook);
				break;
			case "outgoingMessageSent":
				await this.handleOutgoingMessage(instance, webhook);
				break;
			case "messageDelivered":
			case "messageRead":
				await this.handleMessageStatus(instance, webhook);
				break;
			case "incomingCall":
				this.logger.log(`Incoming call from ${webhook.from} - not forwarding to GHL`);
				break;
			default:
				this.logger.warn(`Unknown webhook type: ${webhook.typeWebhook}`);
		}
	}

	/**
	 * Handles instance state changes
	 */
	private async handleStateChange(
		instance: Instance & { user: User },
		webhook: StateInstanceWebhook,
	): Promise<void> {
		const newState = parseInstanceState(webhook.stateInstance);
		if (newState) {
			await this.prisma.updateInstanceState(instance.id, newState);
			this.logger.log(`Instance ${instance.instanceName} state changed to ${newState}`);
		}
	}

	/**
	 * Handles incoming WhatsApp messages
	 */
	private async handleIncomingMessage(
		instance: Instance & { user: User },
		webhook: EvolutionWebhook,
	): Promise<void> {
		if (!webhook.senderData) {
			this.logger.warn("Incoming message webhook missing senderData");
			return;
		}

		const { chatId, senderName, senderContactName } = webhook.senderData;
		const phone = chatId.replace("@c.us", "").replace("@g.us", "");
		const name = senderContactName || senderName || phone;

		// Transform to GHL format
		const ghlMessage = this.ghlTransformer.transformEvolutionToGhl(webhook, instance);
		if (!ghlMessage) {
			this.logger.warn("Failed to transform Evolution message to GHL format");
			return;
		}

		// Upsert contact in GHL
		const contactResponse = await this.upsertContact(instance.user, {
			locationId: instance.user.id,
			phone,
			name,
			source: "WhatsApp",
		});

		// Send message to GHL conversation
		await this.sendMessageToGhlConversation(
			instance.user,
			contactResponse.contact.id,
			ghlMessage,
		);
	}

	/**
	 * Handles outgoing WhatsApp messages (for tracking)
	 */
	private async handleOutgoingMessage(
		instance: Instance & { user: User },
		webhook: EvolutionWebhook,
	): Promise<void> {
		this.logger.debug(`Outgoing message tracked for instance ${instance.instanceName}`);
	}

	/**
	 * Handles message status updates (delivered/read)
	 */
	private async handleMessageStatus(
		instance: Instance & { user: User },
		webhook: EvolutionWebhook,
	): Promise<void> {
		this.logger.debug(`Message status update: ${webhook.status} for instance ${instance.instanceName}`);
	}

	/**
	 * Sends a message to a GHL conversation
	 */
	private async sendMessageToGhlConversation(
		user: User,
		contactId: string,
		message: GhlPlatformMessage,
	): Promise<void> {
		const { client } = await this.getValidGhlClient(user);

		try {
			// Create or get conversation
			const convResponse = await client.post("/conversations/", {
				locationId: user.id,
				contactId,
			});

			const conversationId = convResponse.data.conversation?.id;
			if (!conversationId) {
				throw new Error("Failed to create conversation");
			}

			// Send inbound message
			await client.post(`/conversations/${conversationId}/messages/inbound`, {
				type: message.type || "Custom",
				message: message.text || message.body,
				attachments: message.attachments,
			});

			this.logger.log(`Message sent to GHL conversation ${conversationId}`);
		} catch (error) {
			this.logger.error(`Failed to send message to GHL: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handles outbound messages from GHL to WhatsApp
	 */
	async handleGhlOutboundMessage(
		instance: Instance & { user: User },
		webhookData: GhlWebhookDto,
	): Promise<void> {
		this.logger.log(`Handling GHL outbound message for instance ${instance.instanceName}`);

		if (instance.stateInstance !== InstanceStateEnum.open) {
			throw new HttpException("WhatsApp instance not connected", HttpStatus.SERVICE_UNAVAILABLE);
		}

		const client = this.createEvolutionClient(instance);
		const phone = webhookData.phone;
		
		if (!phone) {
			throw new BadRequestException("No phone number provided");
		}

		const chatId = formatPhoneNumber(phone);

		try {
			if (webhookData.attachments?.length) {
				for (const attachmentUrl of webhookData.attachments) {
					// Extract filename from URL or use default
					const fileName = attachmentUrl.split('/').pop() || "file";
					await client.sendFileByUrl({
						chatId,
						file: {
							url: attachmentUrl,
							fileName,
						},
						caption: webhookData.message,
					});
				}
			} else if (webhookData.message) {
				await client.sendMessage({
					chatId,
					message: webhookData.message,
				});
			}

			this.logger.log(`Message sent to WhatsApp: ${chatId}`);
		} catch (error) {
			this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
			throw new HttpException("Failed to send WhatsApp message", HttpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Handles GHL conversation provider webhook
	 */
	async handleGhlWebhook(webhookData: GhlWebhookDto): Promise<{ success: boolean }> {
		this.logger.log(`Received GHL webhook: ${webhookData.type}`);

		const locationId = webhookData.locationId;
		if (!locationId) {
			throw new BadRequestException("Missing locationId");
		}

		const user = await this.prisma.findUser(locationId);
		if (!user) {
			throw new NotFoundException(`Location ${locationId} not found`);
		}

		const instances = await this.prisma.getInstancesByUserId(locationId);
		const activeInstance = instances.find(i => i.stateInstance === InstanceStateEnum.open);

		if (!activeInstance) {
			this.logger.warn(`No active WhatsApp instance for location ${locationId}`);
			return { success: false };
		}

		const instanceWithUser = { ...activeInstance, user };

		switch (webhookData.type) {
			case "OutboundMessage":
				await this.handleGhlOutboundMessage(instanceWithUser, webhookData);
				break;
			default:
				this.logger.log(`Unhandled GHL webhook type: ${webhookData.type}`);
		}

		return { success: true };
	}

	/**
	 * Handles workflow actions from GHL
	 */
	async handleWorkflowAction(data: WorkflowActionData): Promise<WorkflowActionResult> {
		this.logger.log(`Handling workflow action: ${data.actionType}`);

		const locationId = data.locationId;
		const user = await this.prisma.findUser(locationId);
		if (!user) {
			return { success: false, error: "Location not found" };
		}

		const instances = await this.prisma.getInstancesByUserId(locationId);
		const activeInstance = instances.find(i => i.stateInstance === InstanceStateEnum.open);

		if (!activeInstance) {
			return { success: false, error: "No active WhatsApp instance" };
		}

		const client = this.createEvolutionClient(activeInstance);

		try {
			switch (data.actionType) {
				case "send_message":
					if (data.phone && data.message) {
						await client.sendMessage({
							chatId: formatPhoneNumber(data.phone),
							message: data.message,
						});
					}
					break;
				case "send_file":
					if (data.phone && data.fileUrl) {
						await client.sendFileByUrl({
							chatId: formatPhoneNumber(data.phone),
							file: {
								url: data.fileUrl,
								fileName: data.fileName || "file",
							},
							caption: data.message,
						});
					}
					break;
				default:
					return { success: false, error: `Unknown action type: ${data.actionType}` };
			}

			return { success: true };
		} catch (error) {
			this.logger.error(`Workflow action failed: ${error.message}`);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Gets the connection status of an instance
	 */
	async getInstanceStatus(instance: Instance): Promise<{ state: string; phone?: string }> {
		const client = this.createEvolutionClient(instance);

		try {
			const settings = await client.getWaSettings();
			return {
				state: settings.stateInstance || "unknown",
				phone: settings.phone,
			};
		} catch (error) {
			this.logger.error(`Failed to get instance status: ${error.message}`);
			return { state: "error" };
		}
	}
}
