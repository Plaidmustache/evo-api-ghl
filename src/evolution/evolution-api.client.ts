import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import axios, { AxiosInstance, AxiosError } from "axios";
import {
	ConnectionStateResponse,
	SendMessageResponse,
	SendTextRequest,
	SendMediaRequest,
	FetchInstancesResponse,
	SetWebhookRequest,
	SetWebhookResponse,
	EvolutionApiError,
} from "./evolution-api.types";

/**
 * HTTP client service for Evolution API communication.
 * Handles all API calls to the Evolution API server including sending messages,
 * checking connection states, configuring webhooks, and fetching instances.
 */
@Injectable()
export class EvolutionApiClient {
	private readonly logger = new Logger(EvolutionApiClient.name);
	private readonly httpClient: AxiosInstance;
	private readonly baseUrl: string;

	/**
	 * Creates an instance of EvolutionApiClient.
	 * @param baseUrl - The base URL of the Evolution API server (e.g., http://localhost:8080)
	 * @param apiKey - The global API key for Evolution API authentication
	 */
	constructor(baseUrl: string, apiKey: string) {
		this.baseUrl = baseUrl;

		this.httpClient = axios.create({
			baseURL: baseUrl,
			timeout: 30000,
			headers: {
				apikey: apiKey,
				"Content-Type": "application/json",
			},
		});

		this.setupInterceptors();
		this.logger.log(`EvolutionApiClient initialized with baseUrl: ${baseUrl}`);
	}

	/**
	 * Sets up axios response interceptors for error handling and logging.
	 */
	private setupInterceptors(): void {
		this.httpClient.interceptors.response.use(
			(response) => response,
			async (error: AxiosError<EvolutionApiError>) => {
				const originalRequest = error.config;
				const status = error.response?.status;
				const data = error.response?.data;
				const method = originalRequest?.method?.toUpperCase() || "UNKNOWN";
				const url = originalRequest?.url || "unknown";

				// Log detailed error information
				this.logger.error(
					`Evolution API Error: [${method} ${url}] ${status} – ${JSON.stringify(data)}`,
				);

				// Handle specific error cases
				if (status === 401) {
					this.logger.error("Evolution API authentication failed. Check API key.");
					throw new HttpException(
						"Evolution API authentication failed. Invalid API key.",
						HttpStatus.UNAUTHORIZED,
					);
				}

				if (status === 404) {
					const message = data?.message || "Instance or resource not found";
					this.logger.error(`Evolution API resource not found: ${message}`);
					throw new HttpException(message, HttpStatus.NOT_FOUND);
				}

				if (status === 429) {
					this.logger.warn("Evolution API rate limit exceeded. Consider implementing retry logic.");
					throw new HttpException(
						"Evolution API rate limit exceeded. Please try again later.",
						HttpStatus.TOO_MANY_REQUESTS,
					);
				}

				// Generic error handling
				const errorMessage =
					data?.message ||
					data?.error ||
					error.message ||
					"Evolution API request failed";

				throw new HttpException(
					errorMessage,
					status || HttpStatus.INTERNAL_SERVER_ERROR,
				);
			},
		);
	}

	/**
	 * Gets the configured axios HTTP client instance.
	 * Useful for testing or advanced usage scenarios.
	 */
	protected getHttpClient(): AxiosInstance {
		return this.httpClient;
	}

	/**
	 * Sends a text message to a WhatsApp number via Evolution API.
	 * @param instance - The Evolution API instance name
	 * @param request - The send text request containing number and text
	 * @returns The send message response with message details
	 * @throws HttpException if the API request fails
	 */
	async sendText(
		instance: string,
		request: SendTextRequest,
	): Promise<SendMessageResponse> {
		this.logger.log(
			`Sending text message via instance ${instance} to ${request.number}`,
		);

		try {
			const { data } = await this.httpClient.post<SendMessageResponse>(
				`/message/sendText/${instance}`,
				request,
			);

			this.logger.log(
				`Text message sent successfully via instance ${instance}. Message ID: ${data.key?.id}`,
			);

			return data;
		} catch (error) {
			// Error is already handled by the interceptor, just re-throw
			this.logger.error(
				`Failed to send text message via instance ${instance} to ${request.number}: ${error.message}`,
			);
			throw error;
		}
	}

	/**
	 * Sends a media message (image, video, audio, or document) to a WhatsApp number via Evolution API.
	 * @param instance - The Evolution API instance name
	 * @param request - The send media request containing number, mediatype, media URL/base64, and optional caption/filename
	 * @returns The send message response with message details
	 * @throws HttpException if the API request fails
	 */
	async sendMedia(
		instance: string,
		request: SendMediaRequest,
	): Promise<SendMessageResponse> {
		this.logger.log(
			`Sending ${request.mediatype} message via instance ${instance} to ${request.number}`,
		);

		try {
			const { data } = await this.httpClient.post<SendMessageResponse>(
				`/message/sendMedia/${instance}`,
				request,
			);

			this.logger.log(
				`Media message (${request.mediatype}) sent successfully via instance ${instance}. Message ID: ${data.key?.id}`,
			);

			return data;
		} catch (error) {
			// Error is already handled by the interceptor, just re-throw
			this.logger.error(
				`Failed to send ${request.mediatype} message via instance ${instance} to ${request.number}: ${error.message}`,
			);
			throw error;
		}
	}

	/**
	 * Gets the connection state of a WhatsApp instance.
	 * @param instance - The Evolution API instance name
	 * @returns The connection state response containing instance name and state (open, close, or connecting)
	 * @throws HttpException if the API request fails
	 */
	async getConnectionState(instance: string): Promise<ConnectionStateResponse> {
		this.logger.log(`Getting connection state for instance ${instance}`);

		try {
			const { data } = await this.httpClient.get<ConnectionStateResponse>(
				`/instance/connectionState/${instance}`,
			);

			this.logger.log(
				`Connection state for instance ${instance}: ${data.state}`,
			);

			return data;
		} catch (error) {
			// Error is already handled by the interceptor, just re-throw
			this.logger.error(
				`Failed to get connection state for instance ${instance}: ${error.message}`,
			);
			throw error;
		}
	}

	/**
	 * Configures the webhook URL and events for a WhatsApp instance.
	 * @param instance - The Evolution API instance name
	 * @param request - The webhook configuration containing URL and event types
	 * @returns The webhook configuration response
	 * @throws HttpException if the API request fails
	 */
	async setWebhook(
		instance: string,
		request: SetWebhookRequest,
	): Promise<SetWebhookResponse> {
		this.logger.log(
			`Setting webhook for instance ${instance} to URL: ${request.url}`,
		);

		try {
			const { data } = await this.httpClient.post<SetWebhookResponse>(
				`/webhook/set/${instance}`,
				request,
			);

			this.logger.log(
				`Webhook configured successfully for instance ${instance}. Events: ${data.webhook?.events?.join(", ")}`,
			);

			return data;
		} catch (error) {
			// Error is already handled by the interceptor, just re-throw
			this.logger.error(
				`Failed to set webhook for instance ${instance}: ${error.message}`,
			);
			throw error;
		}
	}
}
