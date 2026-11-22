/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare { interface Env { DB: D1Database; FILES: R2Bucket; AUTH_SESSION_MAX_HOURS?: string; AUTH_SESSION_IDLE_MINUTES?: string; APP_ORIGIN?: string; } }
