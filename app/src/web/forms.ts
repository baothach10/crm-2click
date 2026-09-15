import type { SalesRepRow } from "../db/queries/salesRep.js";
import { html, join, SafeHtml } from "./html.js";

function repOptions(reps: SalesRepRow[], selectedId?: number): SafeHtml {
  return join(
    reps.map(
      (r) => html`<option value="${r.id}" ${selectedId === r.id ? "selected" : ""}>${r.display_name}</option>`,
    ),
  );
}

export function logActivityForm(actionUrl: string, reps: SalesRepRow[]): SafeHtml {
  return html`
    <details class="collapse">
      <summary>Log a conversation</summary>
      <form class="panel" method="post" action="${actionUrl}">
        <div class="field-grid">
          <div>
            <label for="type">Type</label><br />
            <select id="type" name="type" required>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="note">Note</option>
              <option value="task">Task (not yet done)</option>
            </select>
          </div>
          <div>
            <label for="author_rep_id">Logged by</label><br />
            <select id="author_rep_id" name="author_rep_id" required>${repOptions(reps)}</select>
          </div>
          <div>
            <label for="follow_up_on">Needs follow-up on</label><br />
            <input type="date" id="follow_up_on" name="follow_up_on" />
          </div>
        </div>
        <p>
          <label for="details">Details</label><br />
          <textarea id="details" name="details" rows="3" style="width:100%" required></textarea>
        </p>
        <button type="submit">Log conversation</button>
      </form>
    </details>
  `;
}

export function addFollowUpForm(actionUrl: string, reps: SalesRepRow[], defaultRepId?: number): SafeHtml {
  return html`
    <details class="collapse">
      <summary>Add a follow-up</summary>
      <form class="panel" method="post" action="${actionUrl}">
        <div class="field-grid">
          <div>
            <label for="due_on">Due</label><br />
            <input type="date" id="due_on" name="due_on" required />
          </div>
          <div>
            <label for="assigned_rep_id">Assigned to</label><br />
            <select id="assigned_rep_id" name="assigned_rep_id" required>${repOptions(reps, defaultRepId)}</select>
          </div>
        </div>
        <p>
          <label for="title">What's outstanding</label><br />
          <input type="text" id="title" name="title" style="width:100%" required />
        </p>
        <button type="submit">Add follow-up</button>
      </form>
    </details>
  `;
}

export function followUpActionsForm(followUpId: number, returnTo: string): SafeHtml {
  return html`
    <form method="post" action="/follow-ups/${followUpId}/complete" style="display:inline">
      <input type="hidden" name="return_to" value="${returnTo}" />
      <button type="submit">Complete</button>
    </form>
    <form method="post" action="/follow-ups/${followUpId}/reschedule" style="display:inline">
      <input type="hidden" name="return_to" value="${returnTo}" />
      <input type="date" name="due_on" required />
      <button type="submit">Reschedule</button>
    </form>
  `;
}
