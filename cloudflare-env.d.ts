/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare { interface Env { DB: D1Database; FILES: R2Bucket; AUTH_SESSION_MAX_HOURS?: string; AUTH_SESSION_IDLE_MINUTES?: string; APP_ORIGIN?: string; MS_TENANT_ID?: string; MS_CLIENT_ID?: string; MS_CLIENT_SECRET?: string; SHAREPOINT_SITE_URL?: string; SHAREPOINT_LIBRARY?: string; SHAREPOINT_REGISTER_LIST?: string; } }
