import { Test, TestingModule } from "@nestjs/testing";
import { GhlTransformer } from "./ghl.transformer";
import { EvolutionWebhook } from "./types/evolution-webhook.types";
import { GhlWebhookDto } from "./dto/ghl-webhook.dto";

describe("GhlTransformer", () => {
	let transformer: GhlTransformer;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [GhlTransformer],
		}).compile();

		transformer = module.get<GhlTransformer>(GhlTransformer);
	});

	describe("extractPhoneFromJid", () => {
		it("should strip @s.whatsapp.net suffix", () => {
			const result = transformer.extractPhoneFromJid("5511999999999@s.whatsapp.net");
			expect(result).toBe("5511999999999");
		});

		it("should strip @g.us suffix", () => {
			const result = transformer.extractPhoneFromJid("120363123456789012@g.us");
			expect(result).toBe("120363123456789012");
		});

		it("should return empty string for null input", () => {
			const result = transformer.extractPhoneFromJid(null as unknown as string);
			expect(result).toBe("");
		});

		it("should return empty string for undefined input", () => {
			const result = transformer.extractPhoneFromJid(undefined as unknown as string);
			expect(result).toBe("");
		});

		it("should return phone without suffix if already clean", () => {
			const result = transformer.extractPhoneFromJid("5511999999999");
			expect(result).toBe("5511999999999");
		});
	});

	describe("isGroupMessage", () => {
		it("should return true for @g.us suffix", () => {
			const result = transformer.isGroupMessage("120363123456789012@g.us");
			expect(result).toBe(true);
		});

		it("should return false for @s.whatsapp.net suffix", () => {
			const result = transformer.isGroupMessage("5511999999999@s.whatsapp.net");
			expect(result).toBe(false);
		});

		it("should return false for null input", () => {
			const result = transformer.isGroupMessage(null as unknown as string);
			expect(result).toBe(false);
		});

		it("should return false for undefined input", () => {
			const result = transformer.isGroupMessage(undefined as unknown as string);
			expect(result).toBe(false);
		});
	});

	describe("toPlatformMessage", () => {
		const createEvolutionWebhook = (
			messageType: string,
			message: object,
			overrides: Partial<EvolutionWebhook["data"]> = {},
		): EvolutionWebhook => ({
			event: "messages.upsert",
			instance: "test-instance",
			data: {
				key: {
					remoteJid: "5511999999999@s.whatsapp.net",
					fromMe: false,
					id: "MSG123",
				},
				pushName: "John Doe",
				message,
				messageType: messageType as any,
				messageTimestamp: 1704067200,
				...overrides,
			},
		});

		it("should parse conversation message type", () => {
			const webhook = createEvolutionWebhook("conversation", {
				conversation: "Hello, this is a test message!",
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Hello, this is a test message!");
			expect(result.direction).toBe("inbound");
			expect(result.attachments).toBeUndefined();
			expect(result.timestamp).toEqual(new Date(1704067200000));
		});

		it("should parse extendedTextMessage type", () => {
			const webhook = createEvolutionWebhook("extendedTextMessage", {
				extendedTextMessage: {
					text: "Extended text with URL: https://example.com",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Extended text with URL: https://example.com");
			expect(result.direction).toBe("inbound");
		});

		it("should extract image URL and caption", () => {
			const webhook = createEvolutionWebhook("imageMessage", {
				imageMessage: {
					url: "https://example.com/image.jpg",
					mimetype: "image/jpeg",
					caption: "Check out this image!",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Check out this image!");
			expect(result.attachments).toHaveLength(1);
			expect(result.attachments![0].url).toBe("https://example.com/image.jpg");
			expect(result.attachments![0].type).toBe("image/jpeg");
		});

		it("should handle image without caption", () => {
			const webhook = createEvolutionWebhook("imageMessage", {
				imageMessage: {
					url: "https://example.com/image.jpg",
					mimetype: "image/jpeg",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Received an image");
			expect(result.attachments).toHaveLength(1);
		});

		it("should extract video URL and caption", () => {
			const webhook = createEvolutionWebhook("videoMessage", {
				videoMessage: {
					url: "https://example.com/video.mp4",
					mimetype: "video/mp4",
					caption: "Watch this video!",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Watch this video!");
			expect(result.attachments).toHaveLength(1);
			expect(result.attachments![0].url).toBe("https://example.com/video.mp4");
			expect(result.attachments![0].type).toBe("video/mp4");
		});

		it("should handle video without caption", () => {
			const webhook = createEvolutionWebhook("videoMessage", {
				videoMessage: {
					url: "https://example.com/video.mp4",
					mimetype: "video/mp4",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Received a video");
		});

		it("should extract audio URL", () => {
			const webhook = createEvolutionWebhook("audioMessage", {
				audioMessage: {
					url: "https://example.com/audio.ogg",
					mimetype: "audio/ogg",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Received an audio message");
			expect(result.attachments).toHaveLength(1);
			expect(result.attachments![0].url).toBe("https://example.com/audio.ogg");
			expect(result.attachments![0].type).toBe("audio/ogg");
		});

		it("should extract document URL and filename", () => {
			const webhook = createEvolutionWebhook("documentMessage", {
				documentMessage: {
					url: "https://example.com/document.pdf",
					mimetype: "application/pdf",
					fileName: "report.pdf",
					caption: "Here is the report",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Here is the report");
			expect(result.attachments).toHaveLength(1);
			expect(result.attachments![0].url).toBe("https://example.com/document.pdf");
			expect(result.attachments![0].fileName).toBe("report.pdf");
			expect(result.attachments![0].type).toBe("application/pdf");
		});

		it("should handle document without caption", () => {
			const webhook = createEvolutionWebhook("documentMessage", {
				documentMessage: {
					url: "https://example.com/document.pdf",
					mimetype: "application/pdf",
					fileName: "report.pdf",
				},
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("Received a document");
		});

		it("should handle unknown message types gracefully", () => {
			const webhook = createEvolutionWebhook("unknownType", {
				unknownData: "some data",
			});

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toBe("User sent an unsupported message type");
			expect(result.direction).toBe("inbound");
		});

		it("should handle missing pushName", () => {
			const webhook = createEvolutionWebhook("conversation", {
				conversation: "Hello!",
			});
			webhook.data.pushName = undefined as unknown as string;

			const result = transformer.toPlatformMessage(webhook);

			// For non-group messages, pushName is not included in the message
			expect(result.message).toBe("Hello!");
		});

		it("should format group messages with sender info", () => {
			const webhook: EvolutionWebhook = {
				event: "messages.upsert",
				instance: "test-instance",
				data: {
					key: {
						remoteJid: "120363123456789012@g.us",
						fromMe: false,
						id: "MSG123",
					},
					pushName: "Alice",
					message: { conversation: "Hello group!" },
					messageType: "conversation",
					messageTimestamp: 1704067200,
				},
			};

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toContain("Alice");
			expect(result.message).toContain("Hello group!");
		});

		it("should handle unsupported webhook event", () => {
			const webhook: EvolutionWebhook = {
				event: "some.other.event" as any,
				instance: "test-instance",
				data: {} as any,
			};

			const result = transformer.toPlatformMessage(webhook);

			expect(result.message).toContain("Error: Unsupported Evolution API webhook event");
			expect(result.contactId).toBe("error_contact_id");
		});
	});

	describe("toEvolutionMessage", () => {
		it("should produce { number, text } for text messages", () => {
			const ghlWebhook: GhlWebhookDto = {
				type: "SMS",
				phone: "+1-555-123-4567",
				message: "Hello from GHL!",
				locationId: "loc123",
			};

			const result = transformer.toEvolutionMessage(ghlWebhook);

			expect(result).toEqual({
				number: "15551234567",
				text: "Hello from GHL!",
			});
		});

		it("should produce { number, mediatype, media, caption } for media messages", () => {
			const ghlWebhook: GhlWebhookDto = {
				type: "SMS",
				phone: "5511999999999",
				message: "Check this image",
				attachments: ["https://example.com/image.jpg"],
				locationId: "loc123",
			};

			const result = transformer.toEvolutionMessage(ghlWebhook);

			expect(result).toEqual({
				number: "5511999999999",
				mediatype: "image",
				media: "https://example.com/image.jpg",
				caption: "Check this image",
			});
		});

		it("should detect image mediatype from URL extension", () => {
			const extensions = ["jpg", "jpeg", "png", "gif", "webp"];

			for (const ext of extensions) {
				const ghlWebhook: GhlWebhookDto = {
					type: "SMS",
					phone: "5511999999999",
					attachments: [`https://example.com/file.${ext}`],
					locationId: "loc123",
				};

				const result = transformer.toEvolutionMessage(ghlWebhook);
				expect((result as any).mediatype).toBe("image");
			}
		});

		it("should detect video mediatype from URL extension", () => {
			const extensions = ["mp4", "mov", "avi", "mkv"];

			for (const ext of extensions) {
				const ghlWebhook: GhlWebhookDto = {
					type: "SMS",
					phone: "5511999999999",
					attachments: [`https://example.com/file.${ext}`],
					locationId: "loc123",
				};

				const result = transformer.toEvolutionMessage(ghlWebhook);
				expect((result as any).mediatype).toBe("video");
			}
		});

		it("should detect audio mediatype from URL extension", () => {
			const extensions = ["mp3", "ogg", "wav", "aac", "m4a"];

			for (const ext of extensions) {
				const ghlWebhook: GhlWebhookDto = {
					type: "SMS",
					phone: "5511999999999",
					attachments: [`https://example.com/file.${ext}`],
					locationId: "loc123",
				};

				const result = transformer.toEvolutionMessage(ghlWebhook);
				expect((result as any).mediatype).toBe("audio");
			}
		});

		it("should default to document mediatype for unknown extensions", () => {
			const ghlWebhook: GhlWebhookDto = {
				type: "SMS",
				phone: "5511999999999",
				attachments: ["https://example.com/file.xyz"],
				locationId: "loc123",
			};

			const result = transformer.toEvolutionMessage(ghlWebhook);
			expect((result as any).mediatype).toBe("document");
		});

		it("should handle media without caption", () => {
			const ghlWebhook: GhlWebhookDto = {
				type: "SMS",
				phone: "5511999999999",
				attachments: ["https://example.com/image.jpg"],
				locationId: "loc123",
			};

			const result = transformer.toEvolutionMessage(ghlWebhook);

			expect(result).toEqual({
				number: "5511999999999",
				mediatype: "image",
				media: "https://example.com/image.jpg",
				caption: undefined,
			});
		});

		it("should throw error for non-SMS webhook type", () => {
			const ghlWebhook: GhlWebhookDto = {
				type: "Email",
				phone: "5511999999999",
				message: "Hello",
				locationId: "loc123",
			};

			expect(() => transformer.toEvolutionMessage(ghlWebhook)).toThrow(
				"Unsupported GHL webhook for Evolution API",
			);
		});

		it("should throw error for missing phone", () => {
			const ghlWebhook: GhlWebhookDto = {
				type: "SMS",
				message: "Hello",
				locationId: "loc123",
			};

			expect(() => transformer.toEvolutionMessage(ghlWebhook)).toThrow(
				"Unsupported GHL webhook for Evolution API",
			);
		});

		it("should throw error for SMS without message or attachments", () => {
			const ghlWebhook: GhlWebhookDto = {
				type: "SMS",
				phone: "5511999999999",
				locationId: "loc123",
			};

			expect(() => transformer.toEvolutionMessage(ghlWebhook)).toThrow(
				"GHL SMS webhook has no message content or attachments",
			);
		});
	});
});
