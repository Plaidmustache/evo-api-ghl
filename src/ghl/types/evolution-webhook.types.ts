/**
 * Evolution API Webhook TypeScript interfaces
 * These types define the inbound webhook payload structures from Evolution API
 * for message transformation to GHL Platform format
 */

// ============================================================================
// Message Key Types
// ============================================================================

/**
 * Unique identifier for a WhatsApp message
 * remoteJid format: {phone}@s.whatsapp.net (individual) or {phone}@g.us (group)
 */
export interface EvolutionMessageKey {
	remoteJid: string;
	fromMe: boolean;
	id: string;
}

// ============================================================================
// Message Content Types
// ============================================================================

/**
 * Text message content for conversation type
 */
export interface EvolutionConversationMessage {
	conversation: string;
}

/**
 * Extended text message with additional metadata
 */
export interface EvolutionExtendedTextMessage {
	extendedTextMessage: {
		text: string;
		matchedText?: string;
		canonicalUrl?: string;
		description?: string;
		title?: string;
		previewType?: number;
		contextInfo?: EvolutionContextInfo;
	};
}

/**
 * Image message with optional caption and media URL
 */
export interface EvolutionImageMessage {
	imageMessage: {
		url?: string;
		mimetype?: string;
		caption?: string;
		fileSha256?: string;
		fileLength?: number;
		height?: number;
		width?: number;
		mediaKey?: string;
		fileEncSha256?: string;
		directPath?: string;
		mediaKeyTimestamp?: number;
		jpegThumbnail?: string;
		contextInfo?: EvolutionContextInfo;
	};
}

/**
 * Video message with optional caption and media URL
 */
export interface EvolutionVideoMessage {
	videoMessage: {
		url?: string;
		mimetype?: string;
		caption?: string;
		fileSha256?: string;
		fileLength?: number;
		height?: number;
		width?: number;
		seconds?: number;
		mediaKey?: string;
		fileEncSha256?: string;
		directPath?: string;
		mediaKeyTimestamp?: number;
		jpegThumbnail?: string;
		contextInfo?: EvolutionContextInfo;
	};
}

/**
 * Audio message (voice note or audio file)
 */
export interface EvolutionAudioMessage {
	audioMessage: {
		url?: string;
		mimetype?: string;
		fileSha256?: string;
		fileLength?: number;
		seconds?: number;
		ptt?: boolean;
		mediaKey?: string;
		fileEncSha256?: string;
		directPath?: string;
		mediaKeyTimestamp?: number;
		contextInfo?: EvolutionContextInfo;
	};
}

/**
 * Document message with optional caption and filename
 */
export interface EvolutionDocumentMessage {
	documentMessage: {
		url?: string;
		mimetype?: string;
		caption?: string;
		fileSha256?: string;
		fileLength?: number;
		fileName?: string;
		mediaKey?: string;
		fileEncSha256?: string;
		directPath?: string;
		mediaKeyTimestamp?: number;
		title?: string;
		pageCount?: number;
		jpegThumbnail?: string;
		contextInfo?: EvolutionContextInfo;
	};
}

/**
 * Context information for quoted/replied messages
 */
export interface EvolutionContextInfo {
	stanzaId?: string;
	participant?: string;
	quotedMessage?: Record<string, unknown>;
}

/**
 * Union type of all possible message content structures
 */
export type EvolutionMessageContent =
	| EvolutionConversationMessage
	| EvolutionExtendedTextMessage
	| EvolutionImageMessage
	| EvolutionVideoMessage
	| EvolutionAudioMessage
	| EvolutionDocumentMessage;

// ============================================================================
// Message Type Literals
// ============================================================================

/**
 * Supported message types from Evolution API
 */
export type EvolutionMessageType =
	| "conversation"
	| "extendedTextMessage"
	| "imageMessage"
	| "videoMessage"
	| "audioMessage"
	| "documentMessage";

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * Webhook event types for incoming messages
 */
export type EvolutionWebhookEvent =
	| "messages.upsert"
	| "messages.update"
	| "messages.delete"
	| "connection.update"
	| "qrcode.updated"
	| "send.message";

// ============================================================================
// Message Data Types
// ============================================================================

/**
 * Message data structure within webhook payload
 * Contains the message content, metadata, and sender information
 */
export interface EvolutionMessageData {
	key: EvolutionMessageKey;
	pushName?: string;
	message: EvolutionMessageContent;
	messageType: EvolutionMessageType;
	messageTimestamp: number;
	owner?: string;
	source?: string;
}

// ============================================================================
// Webhook Payload Types
// ============================================================================

/**
 * Complete webhook payload from Evolution API
 * This is the top-level structure received by the webhook endpoint
 *
 * @example
 * ```json
 * {
 *   "event": "messages.upsert",
 *   "instance": "my-instance",
 *   "data": {
 *     "key": {
 *       "remoteJid": "5511999999999@s.whatsapp.net",
 *       "fromMe": false,
 *       "id": "ABC123"
 *     },
 *     "pushName": "John Doe",
 *     "message": {
 *       "conversation": "Hello!"
 *     },
 *     "messageType": "conversation",
 *     "messageTimestamp": 1704067200
 *   }
 * }
 * ```
 */
export interface EvolutionWebhook {
	event: EvolutionWebhookEvent;
	instance: string;
	data: EvolutionMessageData;
	destination?: string;
	date_time?: string;
	sender?: string;
	server_url?: string;
	apikey?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if message is a conversation type
 */
export function isConversationMessage(
	message: EvolutionMessageContent,
): message is EvolutionConversationMessage {
	return "conversation" in message;
}

/**
 * Type guard to check if message is an extended text type
 */
export function isExtendedTextMessage(
	message: EvolutionMessageContent,
): message is EvolutionExtendedTextMessage {
	return "extendedTextMessage" in message;
}

/**
 * Type guard to check if message is an image type
 */
export function isImageMessage(
	message: EvolutionMessageContent,
): message is EvolutionImageMessage {
	return "imageMessage" in message;
}

/**
 * Type guard to check if message is a video type
 */
export function isVideoMessage(
	message: EvolutionMessageContent,
): message is EvolutionVideoMessage {
	return "videoMessage" in message;
}

/**
 * Type guard to check if message is an audio type
 */
export function isAudioMessage(
	message: EvolutionMessageContent,
): message is EvolutionAudioMessage {
	return "audioMessage" in message;
}

/**
 * Type guard to check if message is a document type
 */
export function isDocumentMessage(
	message: EvolutionMessageContent,
): message is EvolutionDocumentMessage {
	return "documentMessage" in message;
}
