import { Injectable, Logger } from "@nestjs/common";
import { GhlWebhookDto } from "./dto/ghl-webhook.dto";
import { GhlPlatformMessage } from "../types";
import {
	EvolutionWebhook,
	EvolutionMessageType,
	isConversationMessage,
	isExtendedTextMessage,
	isImageMessage,
	isVideoMessage,
	isAudioMessage,
	isDocumentMessage,
} from "./types/evolution-webhook.types";

@Injectable()
export class GhlTransformer {
	private readonly logger = new Logger(GhlTransformer.name);

	/**
	 * Extracts clean phone number from WhatsApp JID format
	 * @param jid - WhatsApp JID (e.g., "5511999999999@s.whatsapp.net" or "5511999999999@g.us")
	 * @returns Clean phone number without suffix (e.g., "5511999999999")
	 */
	private extractPhoneFromJid(jid: string): string {
		if (!jid) {
			return "";
		}
		// Remove @s.whatsapp.net (individual) or @g.us (group) suffix
		return jid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "");
	}

	/**
	 * Checks if a message is from a group chat
	 * @param jid - WhatsApp JID (e.g., "5511999999999@s.whatsapp.net" or "120363123456789012@g.us")
	 * @returns true if the JID indicates a group chat, false otherwise
	 */
	private isGroupMessage(jid: string): boolean {
		if (!jid) {
			return false;
		}
		return jid.endsWith("@g.us");
	}

	toPlatformMessage(webhook: EvolutionWebhook): GhlPlatformMessage {
		this.logger.debug(`Transforming Evolution API webhook to GHL Platform Message: ${JSON.stringify(webhook)}`);
		let messageText = "";
		const attachments: GhlPlatformMessage["attachments"] = [];

		if (webhook.event === "messages.upsert") {
			const { data } = webhook;
			const remoteJid = data.key.remoteJid;
			const isGroup = this.isGroupMessage(remoteJid);
			const senderName = data.pushName || "Unknown";
			const senderNumber = this.extractPhoneFromJid(remoteJid);
			const messageType = data.messageType;
			const message = data.message;

			switch (messageType) {
				case "conversation":
					if (isConversationMessage(message)) {
						messageText = message.conversation || "";
					}
					break;
				case "extendedTextMessage":
					if (isExtendedTextMessage(message)) {
						messageText = message.extendedTextMessage?.text || "";
					}
					break;
				case "imageMessage":
					if (isImageMessage(message)) {
						messageText = message.imageMessage?.caption || "Received an image";
						if (message.imageMessage?.url) {
							attachments.push({
								url: message.imageMessage.url,
								type: message.imageMessage.mimetype,
							});
						}
					}
					break;
				case "videoMessage":
					if (isVideoMessage(message)) {
						messageText = message.videoMessage?.caption || "Received a video";
						if (message.videoMessage?.url) {
							attachments.push({
								url: message.videoMessage.url,
								type: message.videoMessage.mimetype,
							});
						}
					}
					break;
				case "audioMessage":
					if (isAudioMessage(message)) {
						messageText = "Received an audio message";
						if (message.audioMessage?.url) {
							attachments.push({
								url: message.audioMessage.url,
								type: message.audioMessage.mimetype,
							});
						}
					}
					break;
				case "documentMessage":
					if (isDocumentMessage(message)) {
						messageText = message.documentMessage?.caption || "Received a document";
						if (message.documentMessage?.url) {
							attachments.push({
								url: message.documentMessage.url,
								fileName: message.documentMessage.fileName,
								type: message.documentMessage.mimetype,
							});
						}
					}
					break;
				default:
					this.logger.warn(`Unsupported Evolution API message type: ${messageType}`);
					messageText = "User sent an unsupported message type";
			}

			if (isGroup) {
				messageText = `${senderName} (+${senderNumber}):\n\n ${messageText}`;
			}

			return {
				contactId: "placeholder_ghl_contact_id",
				locationId: "placeholder_ghl_location_id",
				message: messageText.trim(),
				direction: "inbound",
				attachments: attachments.length > 0 ? attachments : undefined,
				timestamp: new Date(data.messageTimestamp * 1000),
			};
		}

		this.logger.error(`Cannot transform unsupported Evolution API webhook event: ${webhook.event}`);
		return {
			contactId: "error_contact_id",
			locationId: "error_location_id",
			message: `Error: Unsupported Evolution API webhook event ${webhook.event}`,
			direction: "inbound",
		};
	}

	/**
	 * Transforms GHL webhook to Evolution API message format
	 * TODO: Will be fully implemented in phase 4 (subtask-4-1, subtask-4-2)
	 */
	toEvolutionMessage(ghlWebhook: GhlWebhookDto): { number: string; text: string } | { number: string; mediatype: string; media: string; caption?: string } {
		this.logger.debug(`Transforming GHL Webhook to Evolution API Message: ${JSON.stringify(ghlWebhook)}`);

		if (ghlWebhook.type === "SMS" && ghlWebhook.phone) {
			// Extract phone number (remove any formatting)
			const number = ghlWebhook.phone.replace(/\D/g, "");

			if (ghlWebhook.attachments && ghlWebhook.attachments.length > 0) {
				const attachmentUrl = ghlWebhook.attachments[0];
				this.logger.debug(`GHL webhook has attachments. Processing as media. Attachment URL: ${attachmentUrl}`);

				// Determine media type from URL extension
				const extension = attachmentUrl.split(".").pop()?.toLowerCase() || "";
				let mediatype = "document";
				if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) {
					mediatype = "image";
				} else if (["mp4", "mov", "avi", "mkv"].includes(extension)) {
					mediatype = "video";
				} else if (["mp3", "ogg", "wav", "aac", "m4a"].includes(extension)) {
					mediatype = "audio";
				}

				return {
					number,
					mediatype,
					media: attachmentUrl,
					caption: ghlWebhook.message || undefined,
				};
			} else if (ghlWebhook.message) {
				this.logger.debug(`GHL webhook has a text message. Processing as text. Message: "${ghlWebhook.message}"`);
				return {
					number,
					text: ghlWebhook.message,
				};
			} else {
				this.logger.warn(`GHL SMS webhook for ${ghlWebhook.phone} has no text content and no attachments. Ignoring.`);
				throw new Error(`GHL SMS webhook has no message content or attachments for ${ghlWebhook.phone}`);
			}
		}

		this.logger.error(`Cannot transform GHL webhook. Type: ${ghlWebhook.type}, Phone: ${ghlWebhook.phone}, Msg: ${ghlWebhook.message}`);
		throw new Error(`Unsupported GHL webhook for Evolution API. Type: ${ghlWebhook.type}, Phone: ${ghlWebhook.phone}`);
	}
}