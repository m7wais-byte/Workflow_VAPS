/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare { interface Env { DB: D1Database; FILES: R2Bucket; AUTH_SESSION_MAX_HOURS?: string; AUTH_SESSION_IDLE_MINUTES?: string; APP_ORIGIN?: string; ONEDRIVE_TENANT_ID?: string; ONEDRIVE_CLIENT_ID?: string; ONEDRIVE_PARENT_URL?: string; ONEDRIVE_TOKEN_KEY?: string; ONEDRIVE_ACCOUNT?: string; } }
