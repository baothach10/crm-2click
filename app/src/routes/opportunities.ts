import type { FastifyInstance } from "fastify";
import { ACTIVITY_PAGE_SIZE, type ActivityRow, type Cursor, type FollowUpRow } from "../db/queries/company.js";
import {
  getOpportunityByCode,
  listFollowUpsForOpportunity,
  listOpportunityActivity,
  listOtherEditionsForFair,
  type OpportunityDetailRow,
  type OtherEditionRow,
} from "../db/queries/opportunity.js";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "../web/format.js";
import { html, join, raw, SafeHtml } from "../web/html.js";
import { emptyState, page, statusBadge } from "../web/shell.js";

function activityRow(row: ActivityRow): SafeHtml {
  return html`<tr>
    <td>${formatDateTime(row.occurred_at)}</td>
    <td>${row.type}</td>
    <td>${row.details}</td>
    <td>${row.author_name}</td>
  </tr>`;
}

function followUpRow(row: FollowUpRow): SafeHtml {
  return html`<tr>
    <td>${formatDate(row.due_on)}</td>
    <td>${row.title}</td>
    <td>${row.assigned_rep_name}</td>
    <td>${row.completed_at ? html`<span class="badge badge-ok">Done</span>` : html`<span class="badge badge-warn">Open</span>`}</td>
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

      const [activity, followUps, otherEditions] = await Promise.all([
        listOpportunityActivity(opp.id, cursor),
        listFollowUpsForOpportunity(opp.id),
        listOtherEditionsForFair(opp.fair_id, opp.company_id, opp.id),
      ]);

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
        <div class="panel">
          <dl class="field-grid">
            <div><dt>Opportunity value</dt><dd>${formatMoney(opp.amount_eur)}</dd></div>
            <div><dt>Client budget</dt><dd>${opp.client_budget_eur === null ? raw('<span class="muted">unknown</span>') : formatMoney(opp.client_budget_eur)}</dd></div>
            <div><dt>Stand area</dt><dd>${opp.stand_area_sqm === null ? raw('<span class="muted">unknown</span>') : formatNumber(opp.stand_area_sqm, "m²")}</dd></div>
            <div><dt>Opened</dt><dd>${formatDate(opp.opened_on)}</dd></div>
            <div><dt>Expected close</dt><dd>${opp.expected_close_on === null ? raw('<span class="muted">—</span>') : formatDate(opp.expected_close_on)}</dd></div>
            <div><dt>Historical campaign</dt><dd>${opp.historical_campaign_code ?? raw('<span class="muted">—</span>')}</dd></div>
          </dl>
          <p><strong>Notes:</strong> ${opp.brief_notes}</p>
        </div>

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
                <tbody>${join(followUps.map(followUpRow))}</tbody>
              </table>
            </div>`}

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
      `;

      reply.type("text/html").send(page(opp.opportunity_code, body));
    },
  );
}
