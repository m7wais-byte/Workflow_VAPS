import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const jobSummaries = sqliteTable("job_summaries", { id: text("id").primaryKey(), editHash: text("edit_hash").notNull(), audience: text("audience").notNull(), payload: text("payload").notNull(), revision: integer("revision").notNull().default(1), updatedAt: text("updated_at").notNull() });
