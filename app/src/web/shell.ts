import { html, raw, SafeHtml } from "./html.js";

export function page(title: string, body: SafeHtml, searchValue = ""): string {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Exhibition sales CRM</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">Exhibition CRM</a>
    <form class="searchbar" action="/search" method="get">
      <input
        type="search"
        name="q"
        placeholder="Search exhibitors, contacts, opportunity codes…"
        value="${searchValue}"
      />
    </form>
    <nav>
      <a href="/follow-ups">Follow-ups</a>
    </nav>
  </header>
  <main>${body}</main>
</body>
</html>
`.value;
}

export function statusBadge(status: string): SafeHtml {
  return html`<span class="badge badge-${status}">${status}</span>`;
}

export function emptyState(message: string): SafeHtml {
  return html`<p class="empty-state">${message}</p>`;
}

export { raw };
