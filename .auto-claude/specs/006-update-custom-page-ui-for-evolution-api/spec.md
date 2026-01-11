# Update Custom Page UI for Evolution API

## Overview

Rebrand the custom WhatsApp integration page from GREEN-API to Evolution API. This involves updating the visual branding (colors, logo, text) and modifying the form fields to match Evolution API's configuration model (instance name + URL + API key instead of numeric instance ID + token).

## Workflow Type

Simple - Single file modification with UI/branding changes only.

## Task Scope

### Files to Modify
- `src/custom-page/custom-page.controller.ts` - Update `generateCustomPageHTML()` method

### Changes Required

#### 1. Branding Updates
- Title: "WhatsApp Integration - GREEN-API" → "WhatsApp Integration - Evolution API"
- Header text: "GREEN-API" → "Evolution API"
- Color scheme: Green (#3B9702) → Teal (#0d9488)
- Replace GREEN-API logo SVG with WhatsApp icon

#### 2. Form Field Changes
**Remove:**
- Instance ID (numeric input, line ~756)
- API Token input (line ~761)

**Add:**
- Instance Name (text, placeholder: "e.g., my-whatsapp-instance")
- Evolution API URL (text, placeholder: "e.g., https://evolution.yourdomain.com")
- API Key (password, placeholder: "Your Evolution API global key")

#### 3. Payload Update (line ~1153-1158)
```javascript
// OLD
{ locationId, instanceId, apiToken, name }

// NEW
{ locationId, instanceName, evolutionApiUrl, evolutionApiKey, name }
```

#### 4. Instance Card Updates (displayInstances method, line ~1046)
- Show `instanceName` instead of numeric ID
- Show `evolutionApiUrl`
- Show connection state (open/close/connecting vs authorized/notAuthorized)
- Remove "Open Console" button (GREEN-API specific)
- Remove `openGreenApiConsole()` method

#### 5. Status Badge Updates
- Change class names: `authorized` → `open`, `notAuthorized` → `close`

### Color Changes Summary
Replace all occurrences of `#3B9702` with `#0d9488` (approx 10 locations in CSS)

## Success Criteria

- [ ] Page loads without errors
- [ ] Form shows new fields (Instance Name, API URL, API Key)
- [ ] Form submits correct payload structure
- [ ] Instance cards display correctly with Evolution API data model
- [ ] No GREEN-API branding remains (text, colors, logo)
- [ ] Color scheme is teal/blue (#0d9488) instead of green (#3B9702)
- [ ] Status badges use correct class names (open/close/connecting)
