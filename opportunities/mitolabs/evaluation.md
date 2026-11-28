# Mito (Mito Labs): Canopi opportunity evaluation

Link: https://mitolabs.ai/#how-it-works · Evaluated 2026-11-28 with the `canopi-opportunity` skill (Phase A only). Source of the lead: the owner met Mito's founder on 2026-11-28; the founder is reported to be excited about the meta-layer (the meeting itself is **unverified** here, nothing from it was seen).

## Summary and verdict: **Pilot**

Mito is a work platform for impact groups: missions, teams, workspaces, tasks, goals, reusable "Activation Kits", a knowledge hub and an AI operator. It is where a community does the work. Canopi is where a community meets and talks on the pages of the web. The two overlap very little and each lacks what the other has.

The finding that changes the picture: **Mito already runs an MCP server**, with OAuth sign-in built for AI tools, open CORS, and client self-registration. It is not mentioned anywhere on the public site. Canopi has an MCP server too. So a person's own AI assistant, connected to both, can already carry work between them (read a page discussion in Canopi, create a Mito task; read a Mito mission, draft a Canopi post) with no code from either side.

Two things can start now with no partner dependency: that two-connector demo, and a `mito-mission` smart tag. The side-panel tablication is blocked on one thing: Mito's sign-in is redirect-only, which cannot run inside Canopi's sandboxed frame.

Score: **22/30**. Value 3 · DP alignment 3 · Feasibility 4 · Build cost 4 · Strategic 4 · Risk 4.

## What it is

- Self-description: "Connect people, knowledge and goals to get real work done together"; "the AI-powered operating partner for impact-driven entrepreneurs". Page title: "Connected Work Platform for Teams & AI Agents". [/, /llms.txt]
- Capabilities listed: Teams, Missions, Business Hub (clients, CRM), Activation Kits, Workspaces, Processes (scheduled repeatable workflows), Knowledge Hub, Mito AI, Goals, Progress, Performance, Invoices. [/]
- Mito AI: builds activation kits, searches for partners, creates and updates tasks by conversation, searches knowledge, onboarding. [/]
- "Mito Agent" / agent mode: a workspace setting; process steps carry an editable "recipe" (goal, deliverable, constraints, success criteria) that the agent runs. [app code: `AgentRecipeEditor` chunk]
- Public surfaces: public mission pages, share tokens for guests, a public business directory, public discovery pages for missions, teams, kits, processes and goals. [/compare/community-platforms, /pricing, app routes `/mission/:slug`, `/team/:slug`, `/business/:slug`, `/mission-discovery`, `/kit-discovery`]
- Audiences it sells to: startups, incubators and accelerators, non-profits. [/for-startups, /for-incubators, /for-nonprofits]
- Pricing: Collaborator free (join work led by others) · Contributor $22/month (create missions, kits, use Mito AI) · Steward $47/month (business CRM, invoicing, sponsored seats). [/pricing]
- Import: CSV for projects and tasks, documents into the Knowledge Hub. Export: **nothing stated.** [/compare/task-management, /compare/knowledge-tools]
- Runs alongside other community tools: "many programs use Mito alongside their existing chat platform during transition." [/compare/community-platforms FAQ]
- Stack: a single-page app on Supabase, built with Lovable; payments by Stripe; AI by OpenAI / Anthropic. [/privacy, page source]
- No public docs, API reference, webhooks page or changelog. `/docs` and `/api` return the app shell. [probe]
- Users, communities, revenue, team size, funding: **not published; unverified.** Footer years differ between pages (2024 and 2026). The only contact is a first-name address at mitolabs.ai; the founder's full name is **unverified**.

## Live probe results (unauthenticated, 2026-11-28)

| Probe | Result |
|---|---|
| `mitolabs.ai/llms.txt` | 200. Lists marketing pages only; no API or MCP |
| `mitolabs.ai/.well-known/*` (oauth, openid, mcp.json) | 404 |
| App route `/oauth/authorize` | Exists. Text: "This page should only be accessed through the OAuth flow. Please start the authorization process from your AI tool." and "Sign in to authorize this application to access your Mito data." |
| `GET <supabase-project>/functions/v1/mcp` | 200, OAuth metadata: `authorization_endpoint …/mcp-oauth/authorize`, `token_endpoint …/mcp-oauth/token`, `registration_endpoint …/mcp-oauth/register`; grants `authorization_code`, `refresh_token`; PKCE `S256`; public clients allowed (`none`) |
| `POST …/functions/v1/mcp` `tools/list`, no token | 401, JSON-RPC `-32001 "Authentication required"` |
| `OPTIONS …/functions/v1/mcp`, `Origin: null` | 200, `access-control-allow-origin: *`, headers allowed include `authorization`, `content-type`, `mcp-session-id` |
| Supabase auth `/.well-known/openid-configuration` | 200; `authorization_code` and `refresh_token` only |
| Device-code grant | **Not offered** by either metadata document |

The Supabase project host is `lzqgcspuwnfenyrtczxv.supabase.co`. Not done: no sign-in, no client registered, no tool called. **The tool list is unknown** until someone signs in.

Docs vs. live: there are no docs, so the live metadata is the only record. The server could change without notice.

## Fit check against Canopi SDK rules

| Constraint | Result |
|---|---|
| Sandboxed frame (opaque origin, no popups, no redirects) | **Needs partner.** Mito's OAuth is redirect-based only. A device-code grant, or a personal token the person creates in Mito and pastes into the module, would clear it |
| `network.connect` ≤ 10 https hosts | Pass: one host. It is a raw Supabase project hostname, which would change if they migrate. Ask for a stable name |
| CORS preflight for `Origin: null` with `Authorization` | **Pass** |
| Bridge never passes Canopi tokens | Pass: Mito auth would be the module's own |
| Partner tokens in `storage:module` on the device | Pass |
| `tags.compose` opens the composer; the person posts | Pass. "Share this mission here" and "ask for help on this page" both end in the person posting |
| Smart tags are declarative | **Pass, and needs nothing from Mito.** A `mito-mission` tag is a link to a public mission page plus a few typed fields |
| Unique ids | `live.canopi.mitolabs`, tag type `mito-mission` |
| Submission is people-only | Owner submits |

## Integration points × Desirable Properties

Meta-layer primitive named in brackets (from `docs/meta_layer_rag.md`).

| # | Integration point | Canopi surface | DPs advanced | DPs at risk | Needs from partner |
|---|---|---|---|---|---|
| 1 | **Two-connector assistant**: a person's AI tool holds both the Canopi and the Mito MCP connection and carries work across (discussion → task; mission → draft post) | Agent (existing Canopi MCP, drafts need approval) [AI Containment] | DP11 – Safe and Ethical AI: the assistant acts as a named person and Canopi posts stay drafts until approved. DP7 – Simplicity and Interoperability: open protocol, no custom glue | DP4: text from a community discussion lands in a Mito workspace whose members may differ. DP13: Mito-side tool scopes are unknown | Tool list; nothing else |
| 2 | **`mito-mission` smart tag**: pin a mission, an open need or a progress update to the page it concerns | Smart tag [Smart Tags] | DP8 – Collaborative Environment and Meta-Communities: work becomes visible where the subject lives. DP19 – Amplifying Presence and Community Engagement. DP15 – Security and Provenance: the tag has an author and a source link | DP22: the tag points at a page Mito controls; if Mito goes away the link is dead (keep title, need and status in the tag itself) | None |
| 3 | **Mito side panel**: my tasks and my missions' open needs for this page; "make a task from this thread" | Tablication [On-Page Presence] | DP2 – Participant Agency and Empowerment. DP8 | DP4 §13.1–13.2: purpose and consent must travel with a thread turned into a task. DP13: least-privilege scopes | Sign-in that works in a frame; tool list; stable host |
| 4 | **Discussion on public mission pages**: Canopi's embed on `mitolabs.ai/mission/…` so outsiders can talk about a mission without a Mito seat | Embed [Safe Digital Space] | DP19. DP8. DP1 – Federated Authentication & Accountability: one Canopi identity across missions | DP4: a second sign-in and a second data holder on Mito's page, must be disclosed | One script tag in the page head; their agreement |
| 5 | **Missions as constellations**: a cross-organization mission maps to a Canopi constellation of the member communities | Communities directory, constellations [Meta-Communities] | DP8 §16.3 and §16.6: roles and context should carry across the member spaces. DP3 – Adaptive Governance | DP8 §16.6: Mito roles and Canopi roles are separate; the break must be signalled, not hidden | Mission membership readable via MCP |
| 6 | **Mito Agent as a Canopi participant**: Mito's agent reads page discussions and drafts posts for its operator | Agent token, drafts [AI Containment] | DP11 §14: disclosed AI, bound to an accountable person. DP12 – Community-based AI Governance: the community's rules apply to it | DP13 §14: needs a tool allowlist and a kill switch on our side (both exist) | Mito builds an MCP client into its agent |
| 7 | **Activation Kit with a layer**: a kit that also creates the Canopi community, pinned questions and tag set | Agent + admin setup [Composable Governance] | DP10 – Education. DP9 – Developer and Community Incentives | DP20 – Community Ownership: a kit author must not own the community it seeds | Kit format; a hook when a kit is deployed |
| – | Contribution records / reputation carried out of Mito | none for now | DP18 – Feedback Loops and Reputation | DP18 §15: needs scoped reputation, published logic, appeal. Neither side has this | Dropped |

Consent test on rows 1 and 3: a discussion post was written for a community's audience. Turning it into a Mito task shows it to a workspace. The design keeps the post as a **link back to the thread plus the person's own summary**, not a copy of other people's words, and the person doing it is the one who acts.

## Knowledge-base check

- **DP4 §13.2 consent propagation** (MUST travel with data): mitigated by linking, not copying (above). **§13.4 meaningful portability**: Mito states import, not export. Unmet on their side; a partner ask.
- **DP7 §15** (export with structure, import with lossiness disclosure, no undisclosed asymmetry between import and export): Mito's public pages show the asymmetry. Not a blocker for a pilot; it is the main thing to raise if this becomes a deeper partnership.
- **DP11 §14** (disclose AI presence, bind actions to accountable entities, human escalation): rows 1 and 6 pass on the Canopi side because agent posts are drafts under a named person.
- **DP13 §14** (tool allowlists, human confirmation for high-risk actions, kill switch): Canopi side passes. Mito side unknown until the tool list and scopes are seen.
- **DP8 §16.6** (signal when governance context is lost across a boundary): row 5 must say plainly that a constellation and a Mito mission are two memberships.
- **DP22 §30**: the smart tag carries its own title, need and status so the record survives the partner.
- **DP18 §15**: reputation portability dropped; nothing here meets it.
- Related community submissions (`allstructured.json`, 47 entries): "Navigator User Interfaces (NUI) as a Coordination Layer" (DP4 clarification: "selectively sharing, subscribing, or encrypting shared paths and posts", which supports link-not-copy) and "Walking the Narrow Path" (DP13 extension: tiered containment, which fits drafts-then-approval). No submission proposes a task or execution layer; this would be new ground.

## Scores

| | Score | Evidence |
|---|---|---|
| Value to Canopi people | 3 | Canopi communities talk but have nowhere to run the work; Mito is that. No known person uses both yet (**unverified**) |
| DP alignment | 3 | Strong on DP8, DP11, DP19; weak on DP4/DP7 portability on Mito's side |
| Feasibility now | 4 | MCP live with open CORS; two of seven points need nothing from Mito; one blocker for the tablication |
| Build cost | 4 | Smart tag under a day; tablication about a week once sign-in is solved |
| Strategic value | 4 | Founder is keen (reported); same audience (impact communities, incubators, non-profits); gives Canopi an execution story without building one. Size of Mito unknown |
| Risk | 4 | Ordinary paid software, no token sale. Early-stage product on an undocumented server that can change |

## Proposed shape

**Step 0, no build:** the owner signs in to Mito and adds its MCP server to his own assistant next to Canopi's, and we record the tool list and what a round trip looks like.

**`mito-mission-tag` (smart tag, buildable now), sketch, not validated:**

```json
{
  "id": "live.canopi.mitolabs.mission-tag",
  "tag": {
    "type": "mito-mission",
    "schema": {
      "type": "object",
      "required": ["title", "url", "kind"],
      "properties": {
        "title":  { "type": "string", "maxLength": 120, "x-canopi-index": true },
        "url":    { "type": "string", "format": "uri" },
        "kind":   { "enum": ["mission", "need", "progress"], "x-canopi-index": true },
        "need":   { "type": "string", "maxLength": 280 },
        "status": { "enum": ["open", "in-progress", "done"], "x-canopi-index": true }
      }
    },
    "summary": "{{kind}}: {{title}}"
  }
}
```

**`mitolabs` (tablication, after the sign-in blocker):** `network.connect: ["lzqgcspuwnfenyrtczxv.supabase.co"]` (or a stable host), permissions `page.read`, `storage:module`, `tags.compose`. Views: my open tasks; needs on my missions; "new task from this page" (title, link back, my summary).

## Blockers

1. Sign-in inside the sandboxed frame (tablication only).
2. Tool list and scopes unknown.
3. No one has confirmed Mito wants outside clients on this server; it is undocumented.

## Owner decisions

1. Do step 0 yourself (sign in to Mito, connect its MCP to your assistant)? It needs your account.
2. Build the `mito-mission` smart tag now, or wait for the founder?
3. Pilot community: Regenworld (constellation and embedded pages already live) or Desirable Properties V1.1?
4. Which partner asks to send, and by whom.

## Partner asks (not sent)

1. The MCP tool list, scopes, and whether third-party clients are welcome.
2. A device-code grant or a personal access token, for use inside a sandboxed panel.
3. A stable hostname for the MCP server.
4. Would they put Canopi's embed on public mission pages (one script tag)?
5. What export exists today (tasks, knowledge, mission membership)?
6. Can mission membership and open needs be read by a member's assistant?

## Sources

mitolabs.ai: `/`, `/llms.txt`, `/sitemap.xml`, `/pricing`, `/for-startups`, `/for-incubators`, `/for-nonprofits`, `/compare`, `/compare/task-management`, `/compare/community-platforms`, `/compare/knowledge-tools`, `/terms`, `/privacy`, `/aup` (rendered 2026-11-28) · app code chunks `App`, `OAuthAuthorize`, `AgentRecipeEditor`, `Compare*` (public JavaScript) · live probes listed above · `~/repos/desirable-properties`: `dp1, dp4, dp7, dp8, dp11, dp13, dp15, dp18, dp22` (Minimum Alignment sections), `docs/meta_layer_rag.md`, `data/compiled/allstructured.json` · `~/repos/canopi/docs-site/sdk/` rules as summarised in the skill.
