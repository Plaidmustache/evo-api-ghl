# Progress Checkpoint - January 13, 2026

## What's Working ✅

1. **Messages send successfully** from GHL → WhatsApp via Evolution API
2. **"Sent" status** updates immediately after message is sent to WhatsApp
3. **"Delivered" status** updates when Evolution API sends DELIVERY_ACK webhook
4. **Message ID mapping** stored in SentMessage table (GHL ID ↔ Evolution ID)
5. **Conversation Provider** correctly configured under marketplace app

## What's NOT Working Yet ❌

1. **"Read" status** not updating when message is read on WhatsApp
   - Need to investigate: Is Evolution API sending READ webhooks?
   - Need to verify: Is our webhook handler receiving them?

## Current Flow

```
GHL sends message → Adapter → Evolution API → WhatsApp
                         ↓
                   Mark "sent" immediately
                         
Evolution webhook (DELIVERY_ACK) → Adapter → GHL API → Mark "delivered"
Evolution webhook (READ) → Adapter → GHL API → Mark "read" (NOT WORKING)
```

## Environment

- Adapter URL: https://evo-whatsapp.nulab.cc
- Evolution API: https://evo.nulab.cc
- Instance: embody-amersfoort
- Conversation Provider ID: 6964f1e040daf55d1ffea612
- GHL App ID: 6964cf8aaef45e5a53fe77f8

## Next Steps to Investigate

1. Check if Evolution API sends READ webhook events
2. Verify webhook subscription includes message status events
3. Check logs for any READ status updates being received
4. Compare with GREEN-API behavior (they fake delivery, don't track read)

## Key Files

- `src/ghl/ghl.service.ts` - handleMessagesUpdate() handles status webhooks
- `src/webhooks/webhooks.controller.ts` - receives Evolution webhooks
- `src/prisma/prisma.service.ts` - findSentMessageByEvolutionId() for mapping lookup
