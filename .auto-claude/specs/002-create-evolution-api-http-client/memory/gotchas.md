# Gotchas & Pitfalls

Things to watch out for in this codebase.

## [2026-01-11 14:46]
Evolution API uses lowercase 'apikey' header, not 'apiKey' or 'API-Key'. Must use exactly 'apikey' for authentication.

_Context: Creating Evolution API HTTP client service_

## [2026-01-11 14:46]
Use NestJS Logger class for new services, not GreenApiLogger from @green-api/greenapi-integration which is specific to that SDK

_Context: Creating new services that don't use GREEN-API SDK_
