import type { FastifyInstance } from "fastify";
import { listDueFollowUps, type DueFollowUpRow } from "../db/queries/home.js";
import { formatDate } from "../web/format.js";
import { html, join } from "../web/html.js";
import { emptyState, page } from "../web/shell.js";

function todayRome(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

function followUpRow(row: DueFollowUpRow, today: string): ReturnType<typeof html> {
  const overdue = row.due_on < today;
  return html`<tr>
    <td>${overdue ? html`<span class="badge badge-danger">Overdue</span>` : html`<span class="badge badge-warn">Today</span>`}</td>
    <td>${formatDate(row.due_on)}</td>
    <td>${row.title}</td>
    <td><a href="/companies/${row.company_code}">${row.company_name}</a></td>
    <td>${row.opportunity_code
      ? html`<a href="/opportunities/${row.opportunity_code}">${row.opportunity_code}</a>`
      : html`<span class="muted">account-level</span>`}</td>
    <td>${row.assigned_rep_name}</td>
  </tr>`;
}

export function registerHomeRoutes(app: FastifyInstance): void {
  app.get("/", async (_req, reply) => {
    const today = todayRome();
    const dueFollowUps = await listDueFollowUps();

    const body = html`
      <h1>Exhibition sales CRM</h1>
      <p class="muted">Search for an exhibitor or contact above, or work through what's due below.</p>

      <h2>Overdue and due today</h2>
      ${dueFollowUps.length === 0
        ? emptyState("Nothing overdue or due today.")
        : html`<div class="panel table-scroll">
            <table>
              <thead>
                <tr><th></th><th>Due</th><th>Follow-up</th><th>Exhibitor</th><th>Opportunity</th><th>Assigned to</th></tr>
              </thead>
              <tbody>${join(dueFollowUps.map((r) => followUpRow(r, today)))}</tbody>
            </table>
          </div>
          <p><a href="/follow-ups">See all follow-ups →</a></p>`}
    `;

    reply.type("text/html").send(page("Home", body));
  });
}
