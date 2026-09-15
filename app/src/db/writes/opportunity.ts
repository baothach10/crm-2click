import { pool } from "../pool.js";

export interface OpportunityBriefUpdate {
  description: string;
  status: "open" | "qualified" | "proposal" | "won" | "lost";
  amountEur: string;
  expectedCloseOn: string | null;
  historicalCampaignCode: string | null;
  standAreaSqm: string | null;
  clientBudgetEur: string | null;
  requestedHeightM: string | null;
  briefNotes: string;
  contactId: number | null;
}

export async function updateOpportunityBrief(
  opportunityCode: string,
  update: OpportunityBriefUpdate,
): Promise<void> {
  await pool.query(
    `UPDATE opportunity o SET
       description = $2,
       status = $3::opportunity_status,
       amount_eur = $4::numeric,
       expected_close_on = $5::date,
       historical_campaign_code = $6,
       stand_area_sqm = $7::numeric,
       client_budget_eur = $8::numeric,
       requested_height_m = $9::numeric,
       brief_notes = $10,
       -- Guard against a contact_id from a different company (e.g. a tampered request):
       -- the option list is only ever rendered from this opportunity's own company, so
       -- anything else is dropped in favour of the existing value rather than accepted.
       contact_id = CASE
         WHEN $11::bigint IS NULL THEN NULL
         WHEN EXISTS (SELECT 1 FROM contact c WHERE c.id = $11::bigint AND c.company_id = o.company_id)
           THEN $11::bigint
         ELSE o.contact_id
       END
     WHERE o.opportunity_code = $1`,
    [
      opportunityCode,
      update.description,
      update.status,
      update.amountEur,
      update.expectedCloseOn,
      update.historicalCampaignCode,
      update.standAreaSqm,
      update.clientBudgetEur,
      update.requestedHeightM,
      update.briefNotes,
      update.contactId,
    ],
  );
}
