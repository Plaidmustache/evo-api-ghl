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

// Import Evolution API v2 types
import {
	EvolutionWebhook,
	EvolutionConnectionState,
	EvolutionMessage,
	isMessagesUpsertData,
	isConnectionUpdateData,
} from "./types/evolution-webhook.types";

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
	 * Handles incoming Evolution API v2 webhook
	 */
	async handleEvolutionWebhook(
		instance: Instance & { user: User },
		webhook: EvolutionWebhook,
	): Promise<void> {
		// Normalize event name: messages.upsert → MESSAGES_UPSERT
		const normalizedEvent = webhook.event.replace(/\./g, '_').toUpperCase();
		
		this.logger.log(`Handling Evolution webhook: ${normalizedEvent} for instance ${instance.instanceName}`);

		switch (normalizedEvent as any) {
			case "CONNECTION_UPDATE":
				if (isConnectionUpdateData(webhook.data)) {
					await this.handleConnectionUpdate(instance, webhook.data.state);
				}
				break;
			case "MESSAGES_UPSERT":
				// Evolution API can send messages in two formats:
				// 1. data.messages array (multiple messages)
				// 2. data is the message itself (single message)
				let messages: EvolutionMessage[] = [];
				
				if (isMessagesUpsertData(webhook.data) && webhook.data.messages) {
					messages = webhook.data.messages;
				} else if ('key' in webhook.data && 'message' in webhook.data) {
					// Single message format - wrap it in an array
					messages = [webhook.data as any];
				}
				
				if (messages.length > 0) {
					await this.handleMessagesUpsert(instance, messages);
				}
				break;
			case "MESSAGES_UPDATE":
				this.logger.debug(`Message status update for instance ${instance.instanceName}`);
				break;
			case "SEND_MESSAGE":
				this.logger.debug(`Outgoing message tracked for instance ${instance.instanceName}`);
				break;
			default:
				this.logger.warn(`Unhandled webhook event: ${webhook.event}`);
		}
	}

	/**
	 * Handles connection state changes
	 */
	private async handleConnectionUpdate(
		instance: Instance & { user: User },
		state: EvolutionConnectionState,
	): Promise<void> {
		const dbState = parseInstanceState(state);
		if (dbState) {
			await this.prisma.updateInstanceState(instance.id, dbState);
			this.logger.log(`Instance ${instance.instanceName} state changed to ${state}`);
		}
	}

	/**
	 * Handles incoming WhatsApp messages (Evolution API v2 format)
	 */
	private async handleMessagesUpsert(
		instance: Instance & { user: User },
		messages: EvolutionMessage[],
	): Promise<void> {
		for (const msg of messages) {
			// Skip outgoing messages
			if (msg.key.fromMe) {
				this.logger.debug("Skipping outgoing message");
				continue;
			}

			// Extract phone number from remoteJid (format: 31612345678@s.whatsapp.net)
			const remoteJid = msg.key.remoteJid;
			const phone = remoteJid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "");
			const name = msg.pushName || phone;
			const isGroup = remoteJid.endsWith("@g.us");

			// Extract message text
			let messageText = "";
			const attachments: Array<{ url: string; fileName?: string; type?: string }> = [];

			if (msg.message) {
				if (msg.message.conversation) {
					messageText = msg.message.conversation;
				} else if (msg.message.extendedTextMessage?.text) {
					messageText = msg.message.extendedTextMessage.text;
				} else if (msg.message.imageMessage) {
					messageText = msg.message.imageMessage.caption || "Image received";
					if (msg.message.imageMessage.url) {
						attachments.push({
							url: msg.message.imageMessage.url,
							type: msg.message.imageMessage.mimetype,
						});
					}
				} else if (msg.message.videoMessage) {
					messageText = msg.message.videoMessage.caption || "Video received";
					if (msg.message.videoMessage.url) {
						attachments.push({
							url: msg.message.videoMessage.url,
							type: msg.message.videoMessage.mimetype,
						});
					}
				} else if (msg.message.audioMessage) {
					messageText = "Voice message received";
					if (msg.message.audioMessage.url) {
						attachments.push({
							url: msg.message.audioMessage.url,
							type: msg.message.audioMessage.mimetype,
						});
					}
				} else if (msg.message.documentMessage) {
					messageText = msg.message.documentMessage.caption || `Document: ${msg.message.documentMessage.fileName || "file"}`;
					if (msg.message.documentMessage.url) {
						attachments.push({
							url: msg.message.documentMessage.url,
							fileName: msg.message.documentMessage.fileName,
							type: msg.message.documentMessage.mimetype,
						});
					}
				} else if (msg.message.stickerMessage) {
					messageText = "Sticker received";
				} else if (msg.message.locationMessage) {
					const loc = msg.message.locationMessage;
					messageText = `📍 Location shared: ${loc.name || ""} ${loc.address || ""}\nhttps://maps.google.com/?q=${loc.degreesLatitude},${loc.degreesLongitude}`;
				} else if (msg.message.contactMessage) {
					messageText = `👤 Contact shared: ${msg.message.contactMessage.displayName}`;
				} else {
					messageText = "Message received (unsupported type)";
					this.logger.warn(`Unsupported message type: ${JSON.stringify(Object.keys(msg.message))}`);
				}
			}

			if (!messageText && attachments.length === 0) {
				this.logger.warn("Message has no text content and no attachments, skipping");
				continue;
			}

			// Add group sender info if it's a group message
			if (isGroup && msg.key.participant) {
				const senderPhone = msg.key.participant.replace(/@s\.whatsapp\.net$/, "");
				messageText = `${name} (+${senderPhone}):\n${messageText}`;
			}

			this.logger.log(`Processing message from ${phone}: ${messageText.substring(0, 50)}...`);

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
				{
					contactId: contactResponse.contact.id,
					locationId: instance.user.id,
					message: messageText,
					text: messageText,
					direction: "inbound",
					attachments: attachments.length > 0 ? attachments : undefined,
				},
			);
		}
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

		let conversationId: string | undefined;

		// Step 1: Create or get existing conversation
		try {
			const convResponse = await client.post("/conversations/", {
				locationId: user.id,
				contactId,
			});
			conversationId = convResponse.data.conversation?.id;
		} catch (error) {
			// Handle "Conversation already exists" - GHL returns 400 with conversationId
			if (error.response?.status === 400 && error.response?.data?.conversationId) {
				conversationId = error.response.data.conversationId;
				this.logger.log(`Using existing conversation: ${conversationId}`);
			} else {
				this.logger.error(`Failed to create conversation: ${error.message}`);
				throw error;
			}
		}

		if (!conversationId) {
			throw new Error("Failed to get conversation ID");
		}

		// Step 2: Send inbound message
		try {
			await client.post(`/conversations/${conversationId}/messages/inbound`, {
				type: message.type || "Custom",
				message: message.text || message.body,
				attachments: message.attachments,
			});
			this.logger.log(`Message sent to GHL conversation ${conversationId}`);
		} catch (error) {
			this.logger.error(`Failed to send message to GHL conversation: ${error.message}`);
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
