import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.ts",
  out: "./migrations/sqlite",
  dialect: "sqlite",
} satisfies Config;
