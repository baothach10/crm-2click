import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { pool } from "./db/pool.js";
import { registerHomeRoutes } from "./routes/home.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerCompanyRoutes } from "./routes/companies.js";
import { registerOpportunityRoutes } from "./routes/opportunities.js";
import { registerFollowUpRoutes } from "./routes/followUps.js";

const app = Fastify({ logger: true });

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const styleCss = readFileSync(path.join(SELF_DIR, "web", "style.css"), "utf8");

// No @fastify/formbody: plain application/x-www-form-urlencoded parsing is a one-liner
// with a built-in module, and every write in this app is a simple HTML <form> POST.
app.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

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
registerFollowUpRoutes(app);

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ host: "0.0.0.0", port })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
