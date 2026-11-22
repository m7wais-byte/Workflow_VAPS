import { env } from "cloudflare:workers";
import { StoreError, type D1Like } from "./d1";

/** The Worker's D1 binding as the data layer's interface (the assignment also type-checks D1 against D1Like). */
export function serverDb(): D1Like {
  const db: D1Like | undefined = env.DB;
  if (!db) throw new StoreError("The server database is not available.", 503);
  return db;
}
