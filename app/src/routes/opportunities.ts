import type { FastifyInstance } from "fastify";
import {
  ACTIVITY_PAGE_SIZE,
  listContactsForCompany,
  type ActivityRow,
  type ContactRow,
  type Cursor,
  type FollowUpRow,
} from "../db/queries/company.js";
import {
  getOpportunityByCode,
  listFollowUpsForOpportunity,
  listOpportunityActivity,
  listOtherEditionsForFair,
  type OpportunityDetailRow,
  type OtherEditionRow,
} from "../db/queries/opportunity.js";
import { listSalesReps } from "../db/queries/salesRep.js";
import { logActivity } from "../db/writes/activity.js";
import { createFollowUp } from "../db/writes/followUp.js";
import { updateOpportunityBrief } from "../db/writes/opportunity.js";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "../web/format.js";
import { addFollowUpForm, followUpActionsForm, logActivityForm } from "../web/forms.js";
import { html, join, raw, SafeHtml } from "../web/html.js";
import { emptyState, page, statusBadge } from "../web/shell.js";

const STATUSES = ["open", "qualified", "proposal", "won", "lost"] as const;

function activityRow(row: ActivityRow): SafeHtml {
  return html`<tr>
    <td>${formatDateTime(row.occurred_at)}</td>
    <td>${row.type}</td>
    <td>${row.details}</td>
    <td>${row.author_name}</td>
  </tr>`;
}

function followUpRow(row: FollowUpRow, returnTo: string): SafeHtml {
  return html`<tr>
    <td>${formatDate(row.due_on)}</td>
    <td>${row.title}</td>
    <td>${row.assigned_rep_name}</td>
    <td>${row.completed_at
      ? html`<span class="badge badge-ok">Done</span>`
      : html`<span class="badge badge-warn">Open</span> ${followUpActionsForm(row.id, returnTo)}`}</td>
  </tr>`;
}

function otherEditionRow(row: OtherEditionRow): SafeHtml {
  return html`<tr>
    <td>${row.edition_code}</td>
    <td><a href="/opportunities/${row.opportunity_code}">${row.opportunity_code}</a></td>
    <td>${statusBadge(row.status)}</td>
    <td>${formatMoney(row.amount_eur)}</td>
    <td>${row.client_budget_eur === null ? raw('<span class="muted">—</span>') : formatMoney(row.client_budget_eur)}</td>
  </tr>`;
}

function heightBadge(opp: OpportunityDetailRow): SafeHtml {
  if (opp.requested_height_m === null) {
    return html`<span class="badge badge-neutral">Height not requested</span>`;
  }
  if (opp.height_exceeds_limit) {
    return html`<span class="badge badge-danger">Exceeds ${formatNumber(opp.max_stand_height_m, "m")} limit</span>`;
  }
  return html`<span class="badge badge-ok">Within ${formatNumber(opp.max_stand_height_m, "m")} limit</span>`;
}

function statusOptions(selected: string): SafeHtml {
  return join(
    STATUSES.map((s) => html`<option value="${s}" ${s === selected ? "selected" : ""}>${s}</option>`),
  );
}

function contactOptions(contacts: ContactRow[], selectedId: number | null): SafeHtml {
  return html`<option value="" ${selectedId === null ? "selected" : ""}>Not set</option>${join(
    contacts.map(
      (c) =>
        html`<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.first_name} ${c.last_name}</option>`,
    ),
  )}`;
}

function briefForm(opp: OpportunityDetailRow, contacts: ContactRow[]): SafeHtml {
  return html`
    <form class="panel" method="post" action="/opportunities/${opp.opportunity_code}/edit">
      <div class="field-grid">
        <div><label for="status">Status</label><br /><select id="status" name="status" required>${statusOptions(opp.status)}</select></div>
        <div><label for="contact_id">Primary contact</label><br /><select id="contact_id" name="contact_id">${contactOptions(contacts, opp.contact_id)}</select></div>
        <div><label for="amount_eur">Opportunity value (€)</label><br /><input type="number" step="0.01" min="0" id="amount_eur" name="amount_eur" value="${opp.amount_eur}" required /></div>
        <div><label for="client_budget_eur">Client budget (€)</label><br /><input type="number" step="0.01" min="0" id="client_budget_eur" name="client_budget_eur" value="${opp.client_budget_eur ?? ""}" /></div>
        <div><label for="stand_area_sqm">Stand area (m²)</label><br /><input type="number" step="0.01" min="0" id="stand_area_sqm" name="stand_area_sqm" value="${opp.stand_area_sqm ?? ""}" /></div>
        <div><label for="requested_height_m">Requested height (m)</label><br /><input type="number" step="0.01" min="0" id="requested_height_m" name="requested_height_m" value="${opp.requested_height_m ?? ""}" /></div>
        <div><label for="expected_close_on">Expected close</label><br /><input type="date" id="expected_close_on" name="expected_close_on" value="${opp.expected_close_on ?? ""}" /></div>
        <div><label for="historical_campaign_code">Historical campaign</label><br /><input type="text" id="historical_campaign_code" name="historical_campaign_code" value="${opp.historical_campaign_code ?? ""}" /></div>
      </div>
      <p>
        <label for="description">Description</label><br />
        <input type="text" id="description" name="description" style="width:100%" value="${opp.description}" required />
      </p>
      <p>
        <label for="brief_notes">Notes</label><br />
        <textarea id="brief_notes" name="brief_notes" rows="3" style="width:100%" required>${opp.brief_notes}</textarea>
      </p>
      <button type="submit">Save changes</button>
    </form>
  `;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function registerOpportunityRoutes(app: FastifyInstance): void {
  app.get<{ Params: { code: string }; Querystring: { activity_before_at?: string; activity_before_id?: string } }>(
    "/opportunities/:code",
    async (req, reply) => {
      const opp = await getOpportunityByCode(req.params.code);
      if (!opp) {
        reply.code(404).type("text/html").send(page("Not found", html`<h1>Opportunity not found</h1><p>No opportunity with code "${req.params.code}".</p>`));
        return;
      }

      const cursor: Cursor | null =
        req.query.activity_before_at && req.query.activity_before_id
          ? { at: req.query.activity_before_at, id: Number(req.query.activity_before_id) }
          : null;

      const [activity, followUps, otherEditions, contacts, reps] = await Promise.all([
        listOpportunityActivity(opp.id, cursor),
        listFollowUpsForOpportunity(opp.id),
        listOtherEditionsForFair(opp.fair_id, opp.company_id, opp.id),
        listContactsForCompany(opp.company_id),
        listSalesReps(),
      ]);

      const returnTo = `/opportunities/${opp.opportunity_code}`;

      const last = activity.length === ACTIVITY_PAGE_SIZE ? activity[activity.length - 1] : undefined;
      const moreActivityLink = last
        ? html`<p><a href="/opportunities/${opp.opportunity_code}?activity_before_at=${last.occurred_at.toISOString()}&activity_before_id=${last.id}">Older conversations →</a></p>`
        : raw("");

      const body = html`
        <h1>${opp.description}</h1>
        <p class="muted">
          ${opp.opportunity_code} for
          <a href="/companies/${opp.company_code}">${opp.company_name}</a>
          ${opp.contact_first_name
            ? html`&middot; ${opp.contact_first_name} ${opp.contact_last_name}${opp.contact_email ? html` (${opp.contact_email})` : raw("")}`
            : html`&middot; <span class="muted">primary contact not set</span>`}
        </p>
        <p>${statusBadge(opp.status)} <span class="muted">legacy status: "${opp.legacy_status_raw}"</span></p>

        <h2>${opp.fair_name} — ${opp.edition_code}</h2>
        <div class="panel">
          <dl class="field-grid">
            <div><dt>Venue</dt><dd>${opp.venue}, ${opp.city}</dd></div>
            <div><dt>Dates</dt><dd>${formatDate(opp.starts_on)} – ${formatDate(opp.ends_on)}</dd></div>
            <div><dt>Max stand height</dt><dd>${formatNumber(opp.max_stand_height_m, "m")}</dd></div>
            <div><dt>Requested height</dt><dd>${opp.requested_height_m === null ? raw('<span class="muted">unknown</span>') : formatNumber(opp.requested_height_m, "m")} ${heightBadge(opp)}</dd></div>
          </dl>
        </div>

        <h2>Brief</h2>
        ${briefForm(opp, contacts)}

        ${otherEditions.length === 0
          ? raw("")
          : html`<details class="collapse">
              <summary>Other editions of ${opp.fair_name} for this exhibitor (${otherEditions.length})</summary>
              <div class="notice notice-info">Reference only. A previous edition's agreement does not apply to this one.</div>
              <div class="panel table-scroll">
                <table>
                  <thead><tr><th>Edition</th><th>Opportunity</th><th>Status</th><th>Value</th><th>Client budget</th></tr></thead>
                  <tbody>${join(otherEditions.map(otherEditionRow))}</tbody>
                </table>
              </div>
            </details>`}

        <h2>Follow-ups</h2>
        ${followUps.length === 0
          ? emptyState("Nothing outstanding for this opportunity.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>Due</th><th>Follow-up</th><th>Assigned to</th><th></th></tr></thead>
                <tbody>${join(followUps.map((r) => followUpRow(r, returnTo)))}</tbody>
              </table>
            </div>`}
        ${addFollowUpForm(`/opportunities/${opp.opportunity_code}/follow-ups`, reps)}

        <h2>Conversations for this edition</h2>
        <p class="muted">Only activity logged against this specific opportunity — not the exhibitor's other fairs or editions.</p>
        ${activity.length === 0
          ? emptyState("No conversations recorded yet for this edition.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>When</th><th>Type</th><th>Details</th><th>By</th></tr></thead>
                <tbody>${join(activity.map(activityRow))}</tbody>
              </table>
            </div>
            ${moreActivityLink}`}
        ${logActivityForm(`/opportunities/${opp.opportunity_code}/activities`, reps)}
      `;

      reply.type("text/html").send(page(opp.opportunity_code, body));
    },
  );

  app.post<{ Params: { code: string }; Body: Record<string, string> }>(
    "/opportunities/:code/edit",
    async (req, reply) => {
      const opp = await getOpportunityByCode(req.params.code);
      if (!opp) {
        reply.code(404).send("Opportunity not found");
        return;
      }
      const b = req.body;
      if (!b.description?.trim() || !b.brief_notes?.trim() || !b.amount_eur?.trim()) {
        reply.code(400).send("Description, opportunity value, and notes are required");
        return;
      }
      if (!STATUSES.includes(b.status as (typeof STATUSES)[number])) {
        reply.code(400).send("Invalid status");
        return;
      }
      await updateOpportunityBrief(req.params.code, {
        description: b.description.trim(),
        status: b.status as (typeof STATUSES)[number],
        amountEur: b.amount_eur.trim(),
        expectedCloseOn: emptyToNull(b.expected_close_on),
        historicalCampaignCode: emptyToNull(b.historical_campaign_code),
        standAreaSqm: emptyToNull(b.stand_area_sqm),
        clientBudgetEur: emptyToNull(b.client_budget_eur),
        requestedHeightM: emptyToNull(b.requested_height_m),
        briefNotes: b.brief_notes.trim(),
        contactId: b.contact_id?.trim() ? Number(b.contact_id) : null,
      });
      reply.redirect(`/opportunities/${req.params.code}`);
    },
  );

  app.post<{ Params: { code: string }; Body: Record<string, string> }>(
    "/opportunities/:code/activities",
    async (req, reply) => {
      const opp = await getOpportunityByCode(req.params.code);
      if (!opp) {
        reply.code(404).send("Opportunity not found");
        return;
      }
      const b = req.body;
      if (!b.details?.trim() || !b.author_rep_id?.trim()) {
        reply.code(400).send("Details and author are required");
        return;
      }
      await logActivity({
        companyId: opp.company_id,
        opportunityId: opp.id,
        type: b.type as "call" | "email" | "meeting" | "note" | "task",
        details: b.details.trim(),
        authorRepId: Number(b.author_rep_id),
        followUpOn: emptyToNull(b.follow_up_on),
      });
      reply.redirect(`/opportunities/${req.params.code}`);
    },
  );

  app.post<{ Params: { code: string }; Body: Record<string, string> }>(
    "/opportunities/:code/follow-ups",
    async (req, reply) => {
      const opp = await getOpportunityByCode(req.params.code);
      if (!opp) {
        reply.code(404).send("Opportunity not found");
        return;
      }
      const b = req.body;
      if (!b.due_on?.trim() || !b.title?.trim() || !b.assigned_rep_id?.trim()) {
        reply.code(400).send("Due date, title, and assignee are required");
        return;
      }
      await createFollowUp({
        companyId: opp.company_id,
        opportunityId: opp.id,
        dueOn: b.due_on.trim(),
        title: b.title.trim(),
        assignedRepId: Number(b.assigned_rep_id),
      });
      reply.redirect(`/opportunities/${req.params.code}`);
    },
  );
}
