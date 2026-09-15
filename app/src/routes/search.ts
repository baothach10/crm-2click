import type { FastifyInstance } from "fastify";
import {
  findCompanyCodeByContactCodeExact,
  findCompanyCodeExact,
  findOpportunityCodeExact,
  searchCompanies,
  searchContacts,
  type CompanyMatch,
  type ContactMatch,
} from "../db/queries/search.js";
import { html, join } from "../web/html.js";
import { emptyState, page } from "../web/shell.js";

function companyRow(row: CompanyMatch): ReturnType<typeof html> {
  return html`<tr>
    <td><a href="/companies/${row.company_code}">${row.name}</a></td>
    <td>${row.company_code}</td>
    <td>${row.region} (${row.province_code})</td>
  </tr>`;
}

function contactRow(row: ContactMatch): ReturnType<typeof html> {
  return html`<tr>
    <td>${row.first_name} ${row.last_name}</td>
    <td>${row.email ?? html`<span class="muted">—</span>`}</td>
    <td><a href="/companies/${row.company_code}">${row.company_name}</a></td>
  </tr>`;
}

export function registerSearchRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { q?: string } }>("/search", async (req, reply) => {
    const q = (req.query.q ?? "").trim();

    if (q === "") {
      reply.type("text/html").send(page("Search", html`<h1>Search</h1>${emptyState("Type an exhibitor name, contact name, email, or opportunity code.")}`));
      return;
    }

    // A pasted business code takes the reader straight to the record it identifies.
    const [byCompanyCode, byOpportunityCode, byContactCode] = await Promise.all([
      findCompanyCodeExact(q),
      findOpportunityCodeExact(q),
      findCompanyCodeByContactCodeExact(q),
    ]);
    if (byOpportunityCode) {
      reply.redirect(`/opportunities/${byOpportunityCode}`);
      return;
    }
    if (byCompanyCode) {
      reply.redirect(`/companies/${byCompanyCode}`);
      return;
    }
    if (byContactCode) {
      reply.redirect(`/companies/${byContactCode}`);
      return;
    }

    const [companies, contacts] = await Promise.all([searchCompanies(q), searchContacts(q)]);

    const body = html`
      <h1>Search results for "${q}"</h1>

      <div class="search-results-group">
        <h2>Exhibitors</h2>
        ${companies.length === 0
          ? emptyState("No matching exhibitors.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>Name</th><th>Code</th><th>Region</th></tr></thead>
                <tbody>${join(companies.map(companyRow))}</tbody>
              </table>
            </div>`}
      </div>

      <div class="search-results-group">
        <h2>Contacts</h2>
        ${contacts.length === 0
          ? emptyState("No matching contacts.")
          : html`<div class="panel table-scroll">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Exhibitor</th></tr></thead>
                <tbody>${join(contacts.map(contactRow))}</tbody>
              </table>
            </div>`}
      </div>
    `;

    reply.type("text/html").send(page(`Search: ${q}`, body, q));
  });
}
