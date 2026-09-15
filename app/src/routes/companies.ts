import type { FastifyInstance } from "fastify";
import {
  ACTIVITY_PAGE_SIZE,
  getCompanyByCode,
  listContactsForCompany,
  listCompanyActivity,
  listOpenFollowUpsForCompany,
  listOpportunitiesForCompany,
  type ActivityRow,
  type CompanyOpportunityRow,
  type ContactRow,
  type Cursor,
  type FollowUpRow,
} from "../db/queries/company.js";
import { formatDate, formatDateTime, formatMoney } from "../web/format.js";
import { html, join, raw, SafeHtml } from "../web/html.js";
import { emptyState, page, statusBadge } from "../web/shell.js";

function contactRow(row: ContactRow): SafeHtml {
  return html`<tr>
    <td>${row.first_name} ${row.last_name}</td>
    <td>${row.email ?? raw('<span class="muted">—</span>')}</td>
    <td>${row.phone ?? raw('<span class="muted">—</span>')}</td>
    <td class="muted">${row.contact_code}</td>
  </tr>`;
}

function opportunityRow(row: CompanyOpportunityRow): SafeHtml {
  return html`<tr>
    <td><a href="/opportunities/${row.opportunity_code}">${row.opportunity_code}</a></td>
    <td>${row.description}</td>
    <td>${statusBadge(row.status)}</td>
    <td>${formatMoney(row.amount_eur)}</td>
    <td>${formatDate(row.opened_on)}</td>
  </tr>`;
}

function activityRow(row: ActivityRow): SafeHtml {
  return html`<tr>
    <td>${formatDateTime(row.occurred_at)}</td>
    <td>${row.type}</td>
    <td>${row.details}</td>
    <td>${row.author_name}</td>
    <td>${row.opportunity_code
      ? html`<a href="/opportunities/${row.opportunity_code}">${row.opportunity_code}</a>`
      : raw('<span class="muted">account-level</span>')}</td>
  </tr>`;
}

function followUpRow(row: FollowUpRow): SafeHtml {
  return html`<tr>
    <td>${formatDate(row.due_on)}</td>
    <td>${row.title}</td>
    <td>${row.assigned_rep_name}</td>
    <td>${row.opportunity_code
      ? html`<a href="/opportunities/${row.opportunity_code}">${row.opportunity_code}</a>`
      : raw('<span class="muted">account-level</span>')}</td>
  </tr>`;
}

export function registerCompanyRoutes(app: FastifyInstance): void {
  app.get<{ Params: { code: string }; Querystring: { activity_before_at?: string; activity_before_id?: string } }>(
    "/companies/:code",
    async (req, reply) => {
      const company = await getCompanyByCode(req.params.code);
      if (!company) {
        reply.code(404).type("text/html").send(page("Not found", html`<h1>Exhibitor not found</h1><p>No exhibitor with code "${req.params.code}".</p>`));
        return;
      }

      const cursor: Cursor | null =
        req.query.activity_before_at && req.query.activity_before_id
          ? { at: req.query.activity_before_at, id: Number(req.query.activity_before_id) }
          : null;

      const [contacts, opportunities, activity, followUps] = await Promise.all([
        listContactsForCompany(company.id),
        listOpportunitiesForCompany(company.id),
        listCompanyActivity(company.id, cursor),
        listOpenFollowUpsForCompany(company.id),
      ]);

      const opportunitiesByFair = new Map<string, CompanyOpportunityRow[]>();
      for (const opp of opportunities) {
        const list = opportunitiesByFair.get(opp.fair_name) ?? [];
        list.push(opp);
        opportunitiesByFair.set(opp.fair_name, list);
      }

      const opportunitySections = [...opportunitiesByFair.entries()].map(
        ([fairName, opps]) => html`
          <h3>${fairName}</h3>
          <div class="panel table-scroll">
            <table>
              <thead><tr><th>Opportunity</th><th>Description</th><th>Status</th><th>Value</th><th>Opened</th></tr></thead>
              <tbody>${join(opps.map(opportunityRow))}</tbody>
            </table>
          </div>`,
      );

      // A full page might be the exact end of the list; that only costs one empty "next"
      // click, versus a wrong link on every partial (i.e. almost every) page otherwise.
      const last = activity.length === ACTIVITY_PAGE_SIZE ? activity[activity.length - 1] : undefined;
      const moreActivityLink = last
        ? html`<p><a href="/companies/${company.company_code}?activity_before_at=${last.occurred_at.toISOString()}&activity_before_id=${last.id}">Older activity →</a></p>`
        : raw("");

      const body = html`
        <h1>${company.name}</h1>
        <p class="muted">${company.company_code} · ${company.region} (${company.province_code}) · Account owner: ${company.owner_rep_name}</p>

        <h2>Opportunities</h2>
        ${opportunities.length === 0 ? emptyState("No opportunities on record.") : join(opportunitySections)}

        <h2>Contacts</h2>
        ${contacts.length === 0
          ? emptyState("No contacts on record.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Code</th></tr></thead>
                <tbody>${join(contacts.map(contactRow))}</tbody>
              </table>
            </div>`}

        <h2>Open follow-ups</h2>
        ${followUps.length === 0
          ? emptyState("Nothing outstanding for this account.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>Due</th><th>Follow-up</th><th>Assigned to</th><th>Opportunity</th></tr></thead>
                <tbody>${join(followUps.map(followUpRow))}</tbody>
              </table>
            </div>`}

        <h2>Account activity</h2>
        <p class="muted">Everything logged against this exhibitor's account, across every fair and edition.</p>
        ${activity.length === 0
          ? emptyState("No activity recorded yet.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>When</th><th>Type</th><th>Details</th><th>By</th><th>Opportunity</th></tr></thead>
                <tbody>${join(activity.map(activityRow))}</tbody>
              </table>
            </div>
            ${moreActivityLink}`}
      `;

      reply.type("text/html").send(page(company.name, body));
    },
  );
}
