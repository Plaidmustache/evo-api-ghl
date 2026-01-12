/**
 * Evolution API webhook types
 * These types represent the webhook payloads sent by Evolution API
 */

/**
 * Evolution API webhook event types
 */
export type EvolutionWebhookEvent =
	| "MESSAGES_UPSERT"
	| "CONNECTION_UPDATE"
	| "QRCODE_UPDATED"
	| "MESSAGES_UPDATE"
	| "SEND_MESSAGE"
	| "CONTACTS_UPDATE"
	| "CHATS_UPDATE"
	| "CALL";

/**
 * Evolution API connection states
 */
export type EvolutionConnectionState = "open" | "close" | "connecting";

/**
 * Instance data in Evolution webhooks
 */
export interface EvolutionInstanceData {
	instanceName: string;
	instanceId?: string;
	owner?: string;
	profileName?: string;
	profilePictureUrl?: string;
}

/**
 * Message key structure
 */
export interface EvolutionMessageKey {
	remoteJid: string;
	fromMe: boolean;
	id: string;
	participant?: string;
}

/**
 * Message content types
 */
export interface EvolutionTextMessage {
	text?: string;
	extendedTextMessage?: {
		text: string;
		matchedText?: string;
		canonicalUrl?: string;
		description?: string;
		title?: string;
		previewType?: number;
	};
}

export interface EvolutionMediaMessage {
	caption?: string;
	mimetype?: string;
	url?: string;
	directPath?: string;
	mediaKey?: string;
	fileLength?: number;
	fileName?: string;
}

export interface EvolutionImageMessage extends EvolutionMediaMessage {
	height?: number;
	width?: number;
	jpegThumbnail?: string;
}

export interface EvolutionVideoMessage extends EvolutionMediaMessage {
	height?: number;
	width?: number;
	seconds?: number;
	gifPlayback?: boolean;
	jpegThumbnail?: string;
}

export interface EvolutionAudioMessage extends EvolutionMediaMessage {
	seconds?: number;
	ptt?: boolean;
}

export interface EvolutionDocumentMessage extends EvolutionMediaMessage {
	title?: string;
	pageCount?: number;
}

export interface EvolutionStickerMessage extends EvolutionMediaMessage {
	isAnimated?: boolean;
	isAvatar?: boolean;
	height?: number;
	width?: number;
}

export interface EvolutionLocationMessage {
	degreesLatitude: number;
	degreesLongitude: number;
	name?: string;
	address?: string;
	url?: string;
	jpegThumbnail?: string;
}

export interface EvolutionContactMessage {
	displayName: string;
	vcard: string;
}

export interface EvolutionContactsArrayMessage {
	contacts: EvolutionContactMessage[];
}

/**
 * Message structure in Evolution webhooks
 */
export interface EvolutionMessage {
	key: EvolutionMessageKey;
	pushName?: string;
	messageTimestamp?: number | string;
	messageType?: string;
	message?: {
		conversation?: string;
		extendedTextMessage?: {
			text: string;
			matchedText?: string;
			canonicalUrl?: string;
			description?: string;
			title?: string;
		};
		imageMessage?: EvolutionImageMessage;
		videoMessage?: EvolutionVideoMessage;
		audioMessage?: EvolutionAudioMessage;
		documentMessage?: EvolutionDocumentMessage;
		stickerMessage?: EvolutionStickerMessage;
		locationMessage?: EvolutionLocationMessage;
		contactMessage?: EvolutionContactMessage;
		contactsArrayMessage?: EvolutionContactsArrayMessage;
	};
}

/**
 * MESSAGES_UPSERT webhook data
 */
export interface EvolutionMessagesUpsertData {
	messages?: EvolutionMessage[];
	type?: string;
}

/**
 * CONNECTION_UPDATE webhook data
 */
export interface EvolutionConnectionUpdateData {
	state: EvolutionConnectionState;
	statusReason?: number;
}

/**
 * Union type for all webhook data types
 */
export type EvolutionWebhookData =
	| EvolutionMessagesUpsertData
	| EvolutionConnectionUpdateData
	| Record<string, unknown>;

/**
 * Main Evolution webhook structure
 */
export interface EvolutionWebhook {
	event: EvolutionWebhookEvent;
	instance: EvolutionInstanceData;
	data: EvolutionWebhookData;
	destination?: string;
	date_time?: string;
	server_url?: string;
	apikey?: string;
}

/**
 * Type guard for MESSAGES_UPSERT data
 */
export function isMessagesUpsertData(data: EvolutionWebhookData): data is EvolutionMessagesUpsertData {
	return 'messages' in data || 'type' in data;
}

/**
 * Type guard for CONNECTION_UPDATE data
 */
export function isConnectionUpdateData(data: EvolutionWebhookData): data is EvolutionConnectionUpdateData {
	return 'state' in data;
}

/**
 * Allowed webhook event types for processing
 */
export const ALLOWED_EVOLUTION_EVENTS: EvolutionWebhookEvent[] = [
	"MESSAGES_UPSERT",
	"CONNECTION_UPDATE",
];
