import { Injectable, Logger } from "@nestjs/common";
import {
	GreenApiWebhook,
	extractPhoneNumberFromVCard,
} from "@green-api/greenapi-integration";
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
	extractPhoneFromJid(jid: string): string {
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
	isGroupMessage(jid: string): boolean {
		if (!jid) {
			return false;
		}
		return jid.endsWith("@g.us");
	}

	/**
	 * Type guard to check if webhook is from Evolution API
	 */
	private isEvolutionWebhook(webhook: GreenApiWebhook | EvolutionWebhook): webhook is EvolutionWebhook {
		return 'event' in webhook && webhook.event === 'messages.upsert';
	}

	/**
	 * Transforms incoming webhook to GHL Platform Message format
	 * Supports both GREEN-API and Evolution API webhook formats
	 * @param webhook - Either GreenApiWebhook or EvolutionWebhook
	 * @returns GhlPlatformMessage for sending to GHL
	 */
	toPlatformMessage(webhook: GreenApiWebhook | EvolutionWebhook): GhlPlatformMessage {
		if (this.isEvolutionWebhook(webhook)) {
			return this.transformEvolutionWebhook(webhook);
		} else {
			return this.transformGreenApiWebhook(webhook);
		}
	}

	/**
	 * Transforms Evolution API webhook to GHL Platform Message format
	 * @param webhook - Evolution API webhook payload
	 * @returns GhlPlatformMessage for sending to GHL
	 */
	private transformEvolutionWebhook(webhook: EvolutionWebhook): GhlPlatformMessage {
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
	 * Transforms GREEN-API webhook to GHL Platform Message format
	 * @deprecated Use Evolution API for new integrations
	 * @param webhook - GREEN-API webhook payload
	 * @returns GhlPlatformMessage for sending to GHL
	 */
	private transformGreenApiWebhook(webhook: GreenApiWebhook): GhlPlatformMessage {
		this.logger.debug(`Transforming Green API webhook to GHL Platform Message: ${JSON.stringify(webhook)}`);
		let messageText = "";
		const attachments: GhlPlatformMessage["attachments"] = [];

		if (webhook.typeWebhook === "incomingMessageReceived") {
			const isGroup = webhook.senderData?.chatId?.endsWith("@g.us") || false;
			const senderName = webhook.senderData.senderName || webhook.senderData.senderContactName || "Unknown";
			const senderNumber = webhook.senderData.sender;
			const msgData = webhook.messageData;
			switch (msgData.typeMessage) {
				case "textMessage":
					messageText = msgData.textMessageData?.textMessage || "";
					break;
				case "extendedTextMessage":
					messageText = msgData.extendedTextMessageData?.text || "";
					break;
				case "quotedMessage":
					messageText = msgData.extendedTextMessageData?.text || "";
					break;
				case "imageMessage":
				case "videoMessage":
				case "documentMessage":
				case "audioMessage":
					messageText = msgData.fileMessageData?.caption || `Received a ${msgData.typeMessage.replace("Message", " file")}`;
					if (msgData.fileMessageData?.downloadUrl) {
						attachments.push({
							url: msgData.fileMessageData.downloadUrl,
							fileName: msgData.fileMessageData.fileName,
							type: msgData.fileMessageData.mimeType,
						});
					}
					break;
				case "stickerMessage":
					messageText = msgData.fileMessageData?.caption || `Received a sticker`;
					if (msgData.fileMessageData?.downloadUrl) {
						attachments.push({
							url: msgData.fileMessageData.downloadUrl,
							fileName: msgData.fileMessageData.fileName || "sticker.webp",
							type: msgData.fileMessageData.mimeType || "image/webp",
						});
					}
					break;
				case "locationMessage":
					const location = msgData.locationMessageData;
					messageText = [
						"User shared a location:\n",
						location.nameLocation && `📍 Location: ${location.nameLocation}`,
						location.address && `📮 Address: ${location.address}`,
						`📌 Map: https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
					].filter(Boolean).join("\n");
					break;
				case "contactMessage":
					const contact = msgData.contactMessageData;
					const phone = extractPhoneNumberFromVCard(contact.vcard);
					messageText = [
						"👤 User shared a contact:",
						contact.displayName && `Name: ${contact.displayName}`,
						phone && `Phone: ${phone}`,
					].filter(Boolean).join("\n");
					break;
				case "contactsArrayMessage":
					const contactsArray = msgData.messageData.contacts;
					const contactsText = contactsArray
						.map(c => {
							const p = extractPhoneNumberFromVCard(c.vcard);
							return `👤 ${c.displayName}${p ? ` (${p})` : ""}`;
						})
						.join("\n");
					messageText = `User shared multiple contacts:\n${contactsText}`;
					break;
				case "pollMessage":
					const poll = msgData.pollMessageData!;
					messageText = [
						"📊 User sent a poll: " + poll.name,
						"Options:",
						...poll.options.map((opt, index) => `${index + 1}. ${opt.optionName}`),
						poll.multipleAnswers ? "(Multiple answers allowed)" : "(Single answer only)",
					].join("\n");
					break;
				case "pollUpdateMessage":
					const pollUpdate = msgData.pollMessageData;
					let updateText = `Poll "${pollUpdate.name}" was updated.\nVotes:\n`;
					pollUpdate.votes.forEach(vote => {
						updateText += `- ${vote.optionName}: ${vote.optionVoters.length} vote(s)\n`;
					});
					messageText = updateText;
					break;
				case "editedMessage":
					const editedText = msgData.editedMessageData?.textMessage ?? msgData.editedMessageData?.caption ?? "";
					messageText = `✏️ User edited a message to: "${editedText}" (Original ID: ${msgData.editedMessageData?.stanzaId})`;
					break;
				case "deletedMessage":
					messageText = `🗑️ User deleted a message (ID: ${msgData.deletedMessageData?.stanzaId || "unknown"})`;
					break;
				case "buttonsMessage":
					const buttons = msgData.buttonsMessage;
					const buttonsList = buttons.buttons.map(button => `• ${button.buttonText}`).join("\n");
					messageText = `🔘 User sent a message with buttons:\n${buttons.contentText}\n\nButtons:\n${buttonsList}${buttons.footer ? `\n\nFooter: ${buttons.footer}` : ""}`;
					break;
				case "listMessage":
					const list = msgData.listMessage;
					const sectionsList = list.sections
						.map(section => {
							const options = section.rows
								.map(row => `  • ${row.title}${row.description ? `: ${row.description}` : ""}`)
								.join("\n");
							return `${section.title}:\n${options}`;
						})
						.join("\n\n");
					messageText = `📝 User sent a list message:\n${list.contentText}\n\n${sectionsList}${list.footer ? `\n\nFooter: ${list.footer}` : ""}`;
					break;
				case "templateMessage":
					const template = msgData.templateMessage;
					const templateButtons = template.buttons
						.map(button => {
							if (button.urlButton) return `• Link: ${button.urlButton.displayText}`;
							if (button.callButton) return `• Call: ${button.callButton.displayText}`;
							if (button.quickReplyButton) return `• Reply: ${button.quickReplyButton.displayText}`;
							return null;
						})
						.filter(Boolean)
						.join("\n");
					messageText = `📋 User sent a template message:\n${template.contentText}${templateButtons ? `\n\nActions:\n${templateButtons}` : ""}${template.footer ? `\n\nFooter: ${template.footer}` : ""}`;
					break;
				case "groupInviteMessage":
					const invite = msgData.groupInviteMessageData;
					messageText = `👥 User sent a group invitation for "${invite.groupName}".\nCaption: ${invite.caption}`;
					break;

				case "interactiveButtons":
					const interactiveButtons = msgData.interactiveButtons;
					const intButtonsList = interactiveButtons.buttons
						?.map((button) => {
							let buttonDescription = `• ${button.buttonText}`;
							if (button.type === "url" && button.url) {
								buttonDescription += ` (${button.url})`;
							} else if (button.type === "call" && button.phoneNumber) {
								buttonDescription += ` (📞 ${button.phoneNumber})`;
							} else if (button.type === "copy" && button.copyCode) {
								buttonDescription += ` (📋 Copy: "${button.copyCode}")`;
							}
							return buttonDescription;
						})
						.join("\n") || "";

					messageText = [
						"🔘 Interactive message with buttons:",
						interactiveButtons.titleText && `Title: ${interactiveButtons.titleText}`,
						interactiveButtons.contentText,
						intButtonsList && `\nButtons:\n${intButtonsList}`,
						interactiveButtons.footerText && `\nFooter: ${interactiveButtons.footerText}`,
					].filter(Boolean).join("\n");
					break;

				case "interactiveButtonsReply":
					const interactiveButtonsReply = msgData.interactiveButtonsReply;
					const replyButtonsList = interactiveButtonsReply.buttons
						?.map((button) => `• ${button.buttonText}`)
						.join("\n") || "";

					messageText = [
						"💬 Interactive reply message with buttons:",
						interactiveButtonsReply.titleText && `Title: ${interactiveButtonsReply.titleText}`,
						interactiveButtonsReply.contentText,
						replyButtonsList && `\nReply options:\n${replyButtonsList}`,
						interactiveButtonsReply.footerText && `\nFooter: ${interactiveButtonsReply.footerText}`,
					].filter(Boolean).join("\n");
					break;

				case "templateButtonsReplyMessage":
					const templateButtonReply = msgData.templateButtonReplyMessage;
					messageText = `✅ Button clicked:\n\n${templateButtonReply.selectedDisplayText}`;
					break;

				default:
					this.logger.warn(`Unsupported GREEN-API message type`, msgData);
					messageText = "User sent an unsupported message type";
			}

			if (isGroup) {
				messageText = `${senderName} (+${senderNumber.split("@c.us")[0]}):\n\n ${messageText}`;
			}

			return {
				contactId: "placeholder_ghl_contact_id",
				locationId: "placeholder_ghl_location_id",
				message: messageText.trim(),
				direction: "inbound",
				attachments: attachments.length > 0 ? attachments : undefined,
				timestamp: new Date(webhook.timestamp * 1000),
			};
		}

		if (webhook.typeWebhook === "incomingCall") {
			const callerPhone = webhook.from?.replace("@c.us", "") || "unknown";
			const callStatus = webhook.status;
			switch (callStatus) {
				case "offer":
					messageText = `📞 Incoming call from ${callerPhone}`;
					break;
				case "pickUp":
					messageText = `📞 Call answered from ${callerPhone}`;
					break;
				case "hangUp":
					messageText = `📞 Call ended by recipient - ${callerPhone} (hung up or do not disturb)`;
					break;
				case "missed":
					messageText = `📞 Missed call from ${callerPhone} (caller ended call)`;
					break;
				case "declined":
					messageText = `📞 Call declined from ${callerPhone} (timeout)`;
					break;
				default:
					messageText = `📞 Call event from ${callerPhone} - Status: ${callStatus}`;
			}

			return {
				contactId: "placeholder_ghl_contact_id",
				locationId: "placeholder_ghl_location_id",
				message: messageText,
				direction: "inbound",
				timestamp: new Date(webhook.timestamp * 1000),
			};
		}

		this.logger.error(`Cannot transform unsupported Green API webhook type: ${webhook.typeWebhook}`);
		return {
			contactId: "error_contact_id",
			locationId: "error_location_id",
			message: `Error: Unsupported Green API webhook type ${webhook.typeWebhook}`,
			direction: "inbound",
		};
	}

	/**
	 * Transforms GHL webhook to Evolution API message format
	 * @param ghlWebhook - The incoming GHL webhook DTO
	 * @returns Evolution API text message format { number, text } or media message format { number, mediatype, media, caption }
	 * @throws Error if webhook type is not SMS or has no content
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
