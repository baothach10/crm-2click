import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { pool } from "./db/pool.js";
import { registerHomeRoutes } from "./routes/home.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerCompanyRoutes } from "./routes/companies.js";
import { registerOpportunityRoutes } from "./routes/opportunities.js";

const app = Fastify({ logger: true });

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const styleCss = readFileSync(path.join(SELF_DIR, "web", "style.css"), "utf8");

app.get("/healthz", async () => {
  await pool.query("SELECT 1");
  return { status: "ok" };
});

app.get("/style.css", async (_req, reply) => {
  reply.type("text/css").header("Cache-Control", "public, max-age=300").send(styleCss);
});

registerHomeRoutes(app);
registerSearchRoutes(app);
registerCompanyRoutes(app);
registerOpportunityRoutes(app);

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ host: "0.0.0.0", port })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
