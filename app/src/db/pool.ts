import { Pool } from "pg";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export const pool = new Pool({ connectionString: databaseUrl() });
