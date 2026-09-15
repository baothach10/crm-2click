import type { FastifyInstance } from "fastify";
import {
  countFollowUpsByBucket,
  listFollowUpsForScreen,
  type FollowUpBucket,
  type FollowUpScreenRow,
} from "../db/queries/followUps.js";
import { listSalesReps, type SalesRepRow } from "../db/queries/salesRep.js";
import { completeFollowUp, rescheduleFollowUp } from "../db/writes/followUp.js";
import { formatDate } from "../web/format.js";
import { followUpActionsForm } from "../web/forms.js";
import { html, join, raw, SafeHtml } from "../web/html.js";
import { emptyState, page } from "../web/shell.js";

const BUCKET_LABELS: Record<FollowUpBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  next7: "Next 7 days",
  later: "Later",
};

function followUpRow(row: FollowUpScreenRow, returnTo: string): SafeHtml {
  return html`<tr>
    <td>${formatDate(row.due_on)}</td>
    <td>${row.title}</td>
    <td><a href="/companies/${row.company_code}">${row.company_name}</a></td>
    <td>${row.opportunity_code
      ? html`<a href="/opportunities/${row.opportunity_code}">${row.opportunity_code}</a>`
      : raw('<span class="muted">account-level</span>')}</td>
    <td>${row.assigned_rep_name}</td>
    <td>${followUpActionsForm(row.id, returnTo)}</td>
  </tr>`;
}

// return_to is a hidden field this app's own templates always fill with a same-origin
// relative path, but it still arrives as attacker-controllable request data -- reject
// anything that isn't a genuine relative path so a crafted POST can't redirect off-site.
function safeRedirectPath(value: string | undefined, fallback: string): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("://")) {
    return value;
  }
  return fallback;
}

function repFilterOptions(reps: SalesRepRow[], selectedId: number | null): SafeHtml {
  return html`<option value="" ${selectedId === null ? "selected" : ""}>Everyone</option>${join(
    reps.map(
      (r) => html`<option value="${r.id}" ${r.id === selectedId ? "selected" : ""}>${r.display_name}</option>`,
    ),
  )}`;
}

export function registerFollowUpRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { rep?: string } }>("/follow-ups", async (req, reply) => {
    const repId = req.query.rep?.trim() ? Number(req.query.rep) : null;
    const returnTo = repId ? `/follow-ups?rep=${repId}` : "/follow-ups";

    const [rows, counts, reps] = await Promise.all([
      listFollowUpsForScreen(repId),
      countFollowUpsByBucket(repId),
      listSalesReps(),
    ]);

    const byBucket = new Map<FollowUpBucket, FollowUpScreenRow[]>();
    for (const row of rows) {
      const list = byBucket.get(row.bucket) ?? [];
      list.push(row);
      byBucket.set(row.bucket, list);
    }

    const sections = (["overdue", "today", "next7", "later"] as FollowUpBucket[]).map((bucket) => {
      const bucketRows = byBucket.get(bucket) ?? [];
      const total = counts[bucket];
      return html`
        <h2>${BUCKET_LABELS[bucket]} (${total})</h2>
        ${bucketRows.length === 0
          ? emptyState("Nothing here.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>Due</th><th>Follow-up</th><th>Exhibitor</th><th>Opportunity</th><th>Assigned to</th><th></th></tr></thead>
                <tbody>${join(bucketRows.map((r) => followUpRow(r, returnTo)))}</tbody>
              </table>
            </div>
            ${total > bucketRows.length
              ? html`<p class="muted">Showing ${bucketRows.length} of ${total}. Filter by rep to narrow this down.</p>`
              : raw("")}`}
      `;
    });

    const body = html`
      <h1>Follow-ups</h1>
      <form method="get" action="/follow-ups">
        <label for="rep">Assigned to</label>
        <select id="rep" name="rep" onchange="this.form.submit()">${repFilterOptions(reps, repId)}</select>
        <noscript><button type="submit">Filter</button></noscript>
      </form>
      ${join(sections)}
    `;

    reply.type("text/html").send(page("Follow-ups", body));
  });

  app.post<{ Params: { id: string }; Body: Record<string, string> }>(
    "/follow-ups/:id/complete",
    async (req, reply) => {
      await completeFollowUp(Number(req.params.id));
      reply.redirect(safeRedirectPath(req.body.return_to, "/follow-ups"));
    },
  );

  app.post<{ Params: { id: string }; Body: Record<string, string> }>(
    "/follow-ups/:id/reschedule",
    async (req, reply) => {
      const dueOn = req.body.due_on?.trim();
      if (!dueOn) {
        reply.code(400).send("A new due date is required");
        return;
      }
      await rescheduleFollowUp(Number(req.params.id), dueOn);
      reply.redirect(safeRedirectPath(req.body.return_to, "/follow-ups"));
    },
  );
}
