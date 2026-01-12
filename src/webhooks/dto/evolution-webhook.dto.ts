import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, ValidateNested, IsObject } from "class-validator";
import { Type } from "class-transformer";

// ============================================================================
// Connection State Types
// ============================================================================

/**
 * Possible connection states for a WhatsApp instance from Evolution API
 */
export type EvolutionConnectionState = "open" | "close" | "connecting";

// ============================================================================
// Message Key Types
// ============================================================================

/**
 * Message key identifying a message in Evolution API
 */
export class EvolutionMessageKey {
	@IsString()
	@IsNotEmpty()
	remoteJid: string;

	@IsBoolean()
	fromMe: boolean;

	@IsString()
	@IsNotEmpty()
	id: string;
}

// ============================================================================
// Message Content Types
// ============================================================================

/**
 * Message content structure - can contain various message types
 */
export interface EvolutionMessageContent {
	conversation?: string;
	extendedTextMessage?: {
		text: string;
		contextInfo?: Record<string, unknown>;
	};
	imageMessage?: {
		url?: string;
		mimetype?: string;
		caption?: string;
		fileSha256?: string;
		fileLength?: number;
		mediaKey?: string;
	};
	audioMessage?: {
		url?: string;
		mimetype?: string;
		fileSha256?: string;
		fileLength?: number;
		seconds?: number;
		ptt?: boolean;
		mediaKey?: string;
	};
	videoMessage?: {
		url?: string;
		mimetype?: string;
		caption?: string;
		fileSha256?: string;
		fileLength?: number;
		seconds?: number;
		mediaKey?: string;
	};
	documentMessage?: {
		url?: string;
		mimetype?: string;
		title?: string;
		fileSha256?: string;
		fileLength?: number;
		fileName?: string;
		mediaKey?: string;
	};
	stickerMessage?: {
		url?: string;
		mimetype?: string;
		fileSha256?: string;
		fileLength?: number;
		mediaKey?: string;
	};
	contactMessage?: {
		displayName?: string;
		vcard?: string;
	};
	locationMessage?: {
		degreesLatitude?: number;
		degreesLongitude?: number;
		name?: string;
		address?: string;
	};
}

// ============================================================================
// Messages Upsert Event Types
// ============================================================================

/**
 * Data structure for messages.upsert event
 */
export class EvolutionMessagesUpsertData {
	@ValidateNested()
	@Type(() => EvolutionMessageKey)
	key: EvolutionMessageKey;

	@IsString()
	@IsOptional()
	pushName?: string;

	@IsObject()
	@IsOptional()
	message?: EvolutionMessageContent;

	@IsString()
	@IsOptional()
	messageType?: string;

	@IsNumber()
	@IsOptional()
	messageTimestamp?: number;
}

/**
 * Evolution API webhook payload for messages.upsert event
 * Received when a new message arrives or is sent
 */
export class EvolutionMessagesUpsertWebhookDto {
	@IsString()
	@IsNotEmpty()
	event: "messages.upsert";

	@IsString()
	@IsNotEmpty()
	instance: string;

	@ValidateNested()
	@Type(() => EvolutionMessagesUpsertData)
	data: EvolutionMessagesUpsertData;
}

// ============================================================================
// Connection Update Event Types
// ============================================================================

/**
 * Data structure for connection.update event
 */
export class EvolutionConnectionUpdateData {
	@IsString()
	@IsNotEmpty()
	state: EvolutionConnectionState;

	@IsNumber()
	@IsOptional()
	statusReason?: number;
}

/**
 * Evolution API webhook payload for connection.update event
 * Received when the connection state changes (open, close, connecting)
 */
export class EvolutionConnectionUpdateWebhookDto {
	@IsString()
	@IsNotEmpty()
	event: "connection.update";

	@IsString()
	@IsNotEmpty()
	instance: string;

	@ValidateNested()
	@Type(() => EvolutionConnectionUpdateData)
	data: EvolutionConnectionUpdateData;
}

// ============================================================================
// Generic Webhook Types
// ============================================================================

/**
 * Supported Evolution API webhook event types for this integration
 */
export type EvolutionWebhookEventType = "messages.upsert" | "connection.update";

/**
 * Base interface for all Evolution API webhook payloads
 * Used for initial event type detection before parsing specific payload
 */
export class EvolutionWebhookDto {
	@IsString()
	@IsNotEmpty()
	event: EvolutionWebhookEventType;

	@IsString()
	@IsNotEmpty()
	instance: string;

	@IsObject()
	@IsNotEmpty()
	data: Record<string, unknown>;
}

// ============================================================================
// Union Type for All Webhook Payloads
// ============================================================================

/**
 * Union type representing all possible Evolution API webhook payloads
 * Use this when handling webhooks that could be any type
 */
export type EvolutionWebhookPayload =
	| EvolutionMessagesUpsertWebhookDto
	| EvolutionConnectionUpdateWebhookDto;
