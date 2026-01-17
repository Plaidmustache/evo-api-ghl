/**
 * WhatsApp JID (Jabber ID) Utilities
 * Handles all JID formats: @s.whatsapp.net, @c.us, @g.us, @lid, @broadcast, @newsletter
 */

/**
 * Extracts phone number from WhatsApp JID
 * Handles all formats uniformly by splitting on '@' and taking the first part
 *
 * @param jid - WhatsApp JID (e.g., "31612345678@s.whatsapp.net", "267215769174167@lid")
 * @returns Phone number or identifier without suffix, empty string if falsy input
 *
 * @example
 * extractPhoneFromJid("31612345678@s.whatsapp.net") // "31612345678"
 * extractPhoneFromJid("267215769174167@lid")        // "267215769174167"
 * extractPhoneFromJid("120363123456789012@g.us")    // "120363123456789012"
 * extractPhoneFromJid(null)                         // ""
 */
export function extractPhoneFromJid(jid: string | null | undefined): string {
  if (!jid) return "";
  return jid.split("@")[0];
}

/**
 * Checks if JID is a group identifier
 * Group JIDs end with @g.us
 *
 * @param jid - WhatsApp JID to check
 * @returns true if JID represents a group chat
 */
export function isGroupJid(jid: string | null | undefined): boolean {
  return jid?.endsWith("@g.us") ?? false;
}

/**
 * Checks if JID uses @lid format (Android Linked ID)
 * ~30-40% of Android users send messages with this format
 *
 * @param jid - WhatsApp JID to check
 * @returns true if JID uses @lid format
 */
export function isLidJid(jid: string | null | undefined): boolean {
  return jid?.endsWith("@lid") ?? false;
}

/**
 * Formats phone number to WhatsApp JID
 * Creates @c.us (private) or @g.us (group) JID from phone number
 *
 * @param phone - Phone number (may contain non-digit characters)
 * @param type - "private" for @c.us, "group" for @g.us
 * @returns Formatted JID
 *
 * @example
 * formatJid("+31 612 345 678")        // "31612345678@c.us"
 * formatJid("31612345678", "group")   // "31612345678@g.us"
 */
export function formatJid(phone: string, type: "private" | "group" = "private"): string {
  const cleaned = phone.replace(/\D/g, "");
  return type === "group" ? `${cleaned}@g.us` : `${cleaned}@c.us`;
}
