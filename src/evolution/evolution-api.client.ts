import { Logger } from "@nestjs/common";
import axios, { AxiosInstance, AxiosError } from "axios";

/**
 * Evolution API Response Types
 */
export interface EvolutionSendResponse {
	key: {
		remoteJid: string;
		fromMe: boolean;
		id: string;
	};
	message?: Record<string, unknown>;
	messageTimestamp?: string;
	status?: string;
}

export interface EvolutionConnectionState {
	state: string;
	statusReason?: number;
}

export interface EvolutionWebhookConfig {
	url: string;
	webhookByEvents: boolean;
	webhookBase64: boolean;
	events: string[];
}

export interface EvolutionMediaOptions {
	mediatype: "image" | "video" | "audio" | "document";
	media: string;
	fileName?: string;
	caption?: string;
	mimetype?: string;
}

/**
 * Evolution API Client
 * HTTP client for interacting with Evolution API server
 */
export class EvolutionApiClient {
	private readonly logger = new Logger(EvolutionApiClient.name);
	private readonly httpClient: AxiosInstance;

	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
	) {
		this.httpClient = axios.create({
			baseURL: this.baseUrl,
			headers: {
				"Content-Type": "application/json",
				"apikey": this.apiKey,
			},
		});

		// Add response interceptor for error handling
		this.httpClient.interceptors.response.use(
			(response) => response,
			(error: AxiosError) => {
				const status = error.response?.status;
				const data = error.response?.data;
				this.logger.error(
					`Evolution API Error: [${error.config?.method?.toUpperCase()} ${error.config?.url}] ${status} – ${JSON.stringify(data)}`,
				);
				throw error;
			},
		);
	}

	/**
	 * Send a text message via Evolution API
	 */
	async sendText(
		instanceName: string,
		phone: string,
		text: string,
	): Promise<EvolutionSendResponse> {
		const formattedPhone = this.formatPhone(phone);
		this.logger.log(`Sending text message to ${formattedPhone} via instance ${instanceName}`);

		const { data } = await this.httpClient.post<EvolutionSendResponse>(
			`/message/sendText/${instanceName}`,
			{
				number: formattedPhone,
				text,
			},
		);

		this.logger.log(`Text message sent successfully, ID: ${data.key?.id}`);
		return data;
	}

	/**
	 * Send a media message via Evolution API
	 */
	async sendMedia(
		instanceName: string,
		phone: string,
		options: EvolutionMediaOptions,
	): Promise<EvolutionSendResponse> {
		const formattedPhone = this.formatPhone(phone);
		this.logger.log(`Sending ${options.mediatype} to ${formattedPhone} via instance ${instanceName}`);

		const { data } = await this.httpClient.post<EvolutionSendResponse>(
			`/message/sendMedia/${instanceName}`,
			{
				number: formattedPhone,
				mediatype: options.mediatype,
				media: options.media,
				fileName: options.fileName,
				caption: options.caption,
				mimetype: options.mimetype,
			},
		);

		this.logger.log(`Media message sent successfully, ID: ${data.key?.id}`);
		return data;
	}

	/**
	 * Get connection state of an instance
	 */
	async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
		this.logger.log(`Getting connection state for instance ${instanceName}`);

		const { data } = await this.httpClient.get<EvolutionConnectionState>(
			`/instance/connectionState/${instanceName}`,
		);

		this.logger.log(`Instance ${instanceName} connection state: ${data.state}`);
		return data;
	}

	/**
	 * Configure webhook for an instance
	 */
	async setWebhook(
		instanceName: string,
		config: EvolutionWebhookConfig,
	): Promise<{ webhook: EvolutionWebhookConfig }> {
		this.logger.log(`Setting webhook for instance ${instanceName}: ${config.url}`);

		const { data } = await this.httpClient.post<{ webhook: EvolutionWebhookConfig }>(
			`/webhook/set/${instanceName}`,
			config,
		);

		this.logger.log(`Webhook configured for instance ${instanceName}`);
		return data;
	}

	/**
	 * Format phone number for Evolution API
	 * Evolution API expects phone numbers without @ suffixes
	 * Handles all JID formats: @s.whatsapp.net, @c.us, @g.us, @lid
	 */
	private formatPhone(phone: string): string {
		// Remove any JID suffix by splitting on '@'
		return phone.split("@")[0];
	}
}
