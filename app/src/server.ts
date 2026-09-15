import Fastify from "fastify";
import { pool } from "./db/pool.js";

const app = Fastify({ logger: true });

app.get("/healthz", async () => {
  await pool.query("SELECT 1");
  return { status: "ok" };
});

app.get("/", async (_req, reply) => {
  reply.type("text/html").send(
    "<!doctype html><html><head><title>Exhibition sales CRM</title></head>" +
      "<body><h1>Exhibition sales CRM</h1><p>Phase 1 scaffold is running.</p></body></html>",
  );
});

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ host: "0.0.0.0", port })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
