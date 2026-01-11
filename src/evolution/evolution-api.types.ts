/**
 * Evolution API TypeScript interfaces
 * These types define the request and response structures for the Evolution API
 */

// ============================================================================
// Connection State Types
// ============================================================================

/**
 * Possible connection states for a WhatsApp instance
 */
export type ConnectionState = "open" | "close" | "connecting";

/**
 * Response from GET /instance/connectionState/{instance}
 */
export interface ConnectionStateResponse {
	instance: string;
	state: ConnectionState;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message key identifying a sent message
 */
export interface MessageKey {
	remoteJid: string;
	fromMe: boolean;
	id: string;
}

/**
 * Response from POST /message/sendText/{instance}
 * and POST /message/sendMedia/{instance}
 */
export interface SendMessageResponse {
	key: MessageKey;
	message: Record<string, unknown>;
	messageTimestamp: number;
	status: string;
}

/**
 * Request body for POST /message/sendText/{instance}
 */
export interface SendTextRequest {
	number: string;
	text: string;
}

/**
 * Supported media types for Evolution API
 */
export type MediaType = "image" | "video" | "audio" | "document";

/**
 * Request body for POST /message/sendMedia/{instance}
 */
export interface SendMediaRequest {
	number: string;
	mediatype: MediaType;
	media: string;
	caption?: string;
	fileName?: string;
}

// ============================================================================
// Instance Types
// ============================================================================

/**
 * Instance information returned by Evolution API
 */
export interface EvolutionInstance {
	instanceName: string;
	instanceId?: string;
	status: string;
	serverUrl?: string;
	apikey?: string;
	owner?: string;
	profileName?: string;
	profilePictureUrl?: string;
}

/**
 * Response from GET /instance/fetchInstances
 */
export type FetchInstancesResponse = EvolutionInstance[];

/**
 * Single instance response wrapper
 */
export interface InstanceResponse {
	instance: EvolutionInstance;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Available webhook event types for Evolution API
 */
export type WebhookEventType =
	| "QRCODE_UPDATED"
	| "CONNECTION_UPDATE"
	| "MESSAGES_SET"
	| "MESSAGES_UPSERT"
	| "MESSAGES_UPDATE"
	| "MESSAGES_DELETE"
	| "SEND_MESSAGE"
	| "CONTACTS_SET"
	| "CONTACTS_UPSERT"
	| "CONTACTS_UPDATE"
	| "PRESENCE_UPDATE"
	| "CHATS_SET"
	| "CHATS_UPSERT"
	| "CHATS_UPDATE"
	| "CHATS_DELETE"
	| "GROUPS_UPSERT"
	| "GROUPS_UPDATE"
	| "GROUP_PARTICIPANTS_UPDATE"
	| "CALL"
	| "NEW_JWT_TOKEN";

/**
 * Request body for POST /webhook/set/{instance}
 */
export interface SetWebhookRequest {
	url: string;
	events: WebhookEventType[];
	webhook_by_events: boolean;
	webhook_base64?: boolean;
}

/**
 * Response from POST /webhook/set/{instance}
 */
export interface SetWebhookResponse {
	webhook: {
		instanceName: string;
		url: string;
		events: WebhookEventType[];
		webhook_by_events: boolean;
		webhook_base64: boolean;
	};
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error response structure from Evolution API
 */
export interface EvolutionApiError {
	status: number;
	error: string;
	message: string;
	response?: {
		message?: string | string[];
	};
}
