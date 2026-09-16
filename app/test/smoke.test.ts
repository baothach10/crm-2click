// HTTP smoke tests against the running app service. Uses the global fetch() only -- no
// relative source imports -- so, like the other integration test, this file never needs to
// resolve this project's own .ts source at runtime.
import assert from "node:assert/strict";
import test from "node:test";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function get(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`);
}

test("GET / returns 200", async () => {
  const res = await get("/");
  assert.equal(res.status, 200);
});

test("GET /healthz returns 200", async () => {
  const res = await get("/healthz");
  assert.equal(res.status, 200);
});

test("a company page returns 200", async () => {
  const res = await get("/companies/CO000001");
  assert.equal(res.status, 200);
});

test("an opportunity page returns 200", async () => {
  const res = await get("/opportunities/OP000001");
  assert.equal(res.status, 200);
});

test("an unknown opportunity code returns 404", async () => {
  const res = await get("/opportunities/OPNOTREAL");
  assert.equal(res.status, 404);
});

test("search returns 200", async () => {
  const res = await get("/search?q=Aster");
  assert.equal(res.status, 200);
});

test("the follow-ups screen returns 200", async () => {
  const res = await get("/follow-ups");
  assert.equal(res.status, 200);
});
