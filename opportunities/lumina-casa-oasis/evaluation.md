# Lumina CASA + OASIS + Enlightened Nations: Canopi partnership evaluation

Links: https://www.luminacasa.co · https://www.oasisomniverse.one/ · Evaluated 2026-11-24 with the `canopi-opportunity` skill (Phase A only). Source of the lead: an introduction message in a group chat from "GS" (probably Goldie Sun, Lumina CASA's founder; **unverified**).

## Summary and verdict: **Park the build. Take the conversation.**

Three things arrived in one message, and they are very different in substance:

- **Lumina CASA** is a retreat-and-residency community brand (Koh Phangan, Bali) with a large vision document around it. It has no technology of its own that we could find. Its "interoperability infrastructure" is OASIS.
- **OASIS** is real, running software: a public API with 768 paths, healthy today, seven years of commits. It is also, by its own account and by the commit history, essentially one developer's work, wrapped in very large claims ("Web4 to Web10").
- **Enlightened Nations** is named as the governance framework. We found no site, document or text for it beyond two paragraphs on Lumina's pages.

There is no module worth building now. Nobody on Canopi has an OASIS avatar that we know of, and the one obvious thing to show (a karma score) conflicts with DP18. Technically OASIS is the easiest partner we have probed so far: CORS is open and it has a DID sign-in. So if a real shared use appears, the build is small.

As a **community** partner, Lumina CASA fits the audience Canopi's communities directory and constellations are for. That costs no code. The risk is reputational: both sites are actively selling (a CASA token pre-sale, investor applications, a $1,499 Founders NFT), and Canopi should not appear to endorse either sale.

Score: **17/30**. Value 2 · DP alignment 3 · Feasibility 4 · Build cost 3 · Strategic 3 · Risk 2.

## What each one is

### Lumina CASA [luminacasa.co, /llms.txt]
- Self-description: "a sanctuary for healers, visionary leaders, and conscious entrepreneurs"; "a Civilisational Interoperation Architecture". [/, /lumina-technology-overview]
- What exists on the site: application forms (residency, teacher, musician, chef, investor, "CASA Pre-Sale Investment"), a podcast, a store, a code of conduct, an event day, a "Thesis" page. [/llms.txt, /sitemap.xml]
- Five "foundations": residential centres (RAECs), education (Magickal Life Academy), enterprise (DreamStartr), interoperability infrastructure ("Powered by OASIS, STAR, ONET, and LUMOS OS"), governance ("Enlightened Nations and the LUCA stewardship framework"). [/investment-whitepaper]
- Three tokens or units: **CASA** (participation and access), **HERZ** (contribution and appreciation), **LUCA** (stewardship and governance). [/investment-whitepaper, /lumina-technology-overview]
- "LUMOS OS" is described as "emerging". No API, docs or repo linked. [/lumina-technology-overview]
- Community size, residents, revenue: **not published; unverified.**
- The team page lists Goldie Sun as "Visionary Founder of Lumina Casa | OASIS | …". [/about] The OASIS site's own history names David as the sole builder since 2011. [oasisomniverse.one] How the two relate is an open question for the partner.

### OASIS [oasisomniverse.one, github.com/NextGenSoftwareUK/OASIS]
- Self-description: "One universal layer connecting Web2, Web3 and the full Web4 through Web10 stack"; "an abstraction layer over the entire internet".
- Core ideas: an **avatar** (one identity), **holons** (data objects that can be stored on any of many "providers": databases, chains, IPFS, social networks), **karma** (a reputation score across apps), NFTs and wallets.
- Repo: created 2019-06, pushed today, C#, 70 stars, 33 forks. Top contributor has 28,656 commits; the next has 942. [GitHub API, 2026-11-24]
- Licence: "HOLOSOURCE LICENSE v1.1", copyright NextGen World Ltd. The preamble says it keeps the source "visible and available for learning". It is not a standard open-source licence. Full terms **not reviewed**.
- Their own numbers (**unverified**): 4M+ lines, 234 provider projects, 250 MCP tools, 295K+ NuGet downloads. No user or avatar counts are published.
- The API description itself says: "The Avatar (complete), half the Karma & half the Provider API's are currently implemented." Several endpoints are marked "PREVIEW - COMING SOON". [swagger]
- Selling now: Founders NFT, "TOTAL DUE $1,499 USD", "Only 170 Founder slots", "positioning" ahead of "the OASIS token launch"; with a disclaimer that it "does not guarantee profits, token value … or any financial return". The page also shows a "TESTNET" notice and a placeholder treasury address (`YOUR_WALLET_HERE`). [founders.oasisomniverse.one]
- The link to Lumina is real on the OASIS side too: the homepage says karma "rewards them with HERZ utility tokens, CASA governance tokens", and the API has a `/api/herzid/*` group (vouch-based membership ids).

### Enlightened Nations
- "Provides the constitutional governance framework within the wider ecosystem." [luminacasa.co/lumina-technology-overview] Nothing else found. No constitution text, no site. **Unverified that it exists beyond the description.**

## Live probe results (unauthenticated, 2026-11-24)

| Probe | Result |
|---|---|
| `GET api.web4.oasisomniverse.one/api/health` | 200 `{"status":"healthy","service":"OASIS API ONODE WebAPI"}` |
| `GET api.starnet.oasisomniverse.one/api/health` | 200 `{"status":"healthy","service":"STAR API WebAPI","version":"1.0.0"}` |
| `GET api.web4…/swagger/v1/swagger.json` | 200, 2.9 MB, "WEB 4 OASIS API v5.3.0", 768 paths, **no `securitySchemes` declared** |
| `OPTIONS /api/karma/get-level-thresholds`, `Origin: null`, asking for `authorization,content-type` | **204, `access-control-allow-origin: *`, headers allowed** |
| `GET` same path, no token | 401, JSON: "Send a valid JWT in the Authorization: Bearer header." |
| `GET /.well-known/openid-configuration` | 404 `{"error":"OIDC not enabled on this OASIS instance."}` (the spec lists `/oauth/authorize`, `/oauth/token`, `/oauth/jwks`) |
| `luminacasa.co/llms.txt`, `/robots.txt` | 200. robots: `ai-input=yes, ai-train=no` |
| `oasisomniverse.one/llms.txt`, `/robots.txt`, `/sitemap.xml` | 404 |

Docs drift: the DID endpoint's summary says "secp256k1 challenge-response" and its description says "P-256 DID private key". One of them is wrong.

Not done (needs the owner): registering an avatar, signing in, calling any authenticated endpoint, contacting anyone.

## Fit check against Canopi SDK rules

| Constraint | Result |
|---|---|
| Sandboxed frame, opaque origin, no redirects | **Needs-partner.** Sign-in is `POST /api/avatar/authenticate` with username and password, which returns a JWT. That works from the frame, but it means typing an OASIS password into a Canopi tab. No device-code grant. OIDC exists in code but is off on this instance. DID sign-in (`/api/avatar/did-challenge/{did}` → `/authenticate-did`) would be the clean route, if enabled. |
| `network.connect`, ≤ 10 https hosts | Pass. One host: `api.web4.oasisomniverse.one` (plus `api.starnet…` if used). |
| CORS preflight for `Origin: null` with `Authorization` | **Pass.** `*`, headers allowed. |
| Bridge never passes Canopi tokens | Pass. OASIS JWT is the module's own. |
| `storage:module`, 100 KB, on device | Pass. JWT and refresh token fit. |
| `tags.compose` only opens the composer | Pass. Nothing would post by itself. |
| Declarative smart tags, ≤ 5 indexed fields | Pass. A holon reference is an id, a type and a title. |
| Unique ids | `live.canopi.oasis`, tag `oasis-holon`. |
| People-only submission | Unchanged. |

## Integration points × Desirable Properties

| # | Integration point | Canopi surface | DPs advanced | DPs at risk | Needs from partner |
|---|---|---|---|---|---|
| 1 | Lumina CASA as a listed community, or a member of a constellation | Communities directory / constellation. No SDK code. | DP8 – Collaborative Environment and Meta-Communities: a real community with its own rules, linked not absorbed. DP19 – Amplifying Presence and Community Engagement. | DP14 – Trust and Transparency and DP17 – Financial Sustainability §3.7 "Token speculation without utility": a listing can read as endorsement of the CASA pre-sale. | A named admin, and a Gov Hub layer for them (Canopi admins come only through linked Gov Hub layers). |
| 2 | Enlightened Nations constitution as a Gov Hub document set | Gov Hub, not Canopi SDK | DP3 – Adaptive Governance; DP20 – Community Ownership | Nothing to assess: no text is public. | The actual documents. |
| 3 | Same DID on both sides | Canopi DID sign-in (`did:key`, Ed25519) ↔ OASIS `authenticate-did` | DP1 – Federated Authentication & Accountability §19.1 persistent identifier across contexts; DP5 – Decentralized Namespace | Key types differ (Canopi Ed25519; OASIS P-256 or secp256k1). DID is off unless `DIDEnabled` is set on the instance. | Ed25519 `did:key` support, DID enabled on the public instance, corrected docs. |
| 4 | "My OASIS" tab: your avatar and what you hold, read on your own device | Tablication | DP7 – Simplicity and Interoperability | DP4 – Data Sovereignty and Privacy: password typed into a third-party frame. DP18 – Feedback Loops and Reputation §15.3: "No general-purpose score is exposed." OASIS karma is exactly a general-purpose cross-app score, so showing it in Canopi as reputation fails this. | A device-code or DID sign-in. |
| 5 | `oasis-holon` smart tag: pin a holon (a quest, a place, a record) to a page | Smart tag | DP15 – Security and Provenance: a typed link to an outside record | DP22 – Civic Memory & Epistemic Continuity §30.1 durable reference: a holon id resolves only through their node, kept alive by one maintainer. The tag must carry title and summary itself so it still reads if the id stops resolving. | A public, unauthenticated holon read by id (not confirmed to exist). |
| 6 | Canopi as an OASIS "provider" (they map Canopi posts → holons) | None on our side. They would build it against Canopi API v1. | DP7 | **DP4 §13.2 consent propagation.** OASIS replicates holons across many storage providers. A page discussion copied there leaves the audience its authors agreed to. Only a person's own posts, exported by that person, pass the consent test. Anything broader: **dropped**. | n/a |
| 7 | OASIS "250 MCP tools" ↔ Canopi agents | Agent | DP11 – Safe and Ethical AI / DP13 – AI Containment (only if scopes are narrow) | Unverified that a public MCP endpoint exists. JWT is all-or-nothing, with no scopes: fails least privilege. | Scoped tokens. |

Meta-layer primitives: row 1 is **Meta-Communities**; rows 4–5 are **Smart Tags**; row 3 is the identity half of **Safe Digital Space**.

## Knowledge-base check

- **DP18 §15.3** (no general-purpose score; cross-zone use carries rubric, issuer and limits) and **§5.13** (portable reputation only with context preserved): OASIS karma as designed is a single number that travels everywhere. **Fails** if shown as reputation in Canopi. Mitigation: never show it, or show it only labeled as "OASIS's own score, their rules", never as input to anything in Canopi.
- **DP1 §19.1** (persistent identifier, resets detectable): a linked DID would **pass**; username and password alone does not add anything.
- **DP4 §13.1–13.2** (purpose binding, consent travels with data): row 6 **fails** unless limited to the person's own posts.
- **DP22 §30.1** (unresolvable references announce themselves): row 5 **mitigated** by carrying the summary in the tag.
- **DP17 §3.7** (token speculation without utility): three tokens, a pre-sale and a founders NFT are on sale before published usage. Not ours to fix; it is the main reason Risk scores 2.
- Community submissions (`allstructured.json`, 47 submissions): none mention OASIS, holons, karma or vouching. 31 touch interoperability in general (for example "Can Directories Rise Again?", "Name Chain–Anchored Digital Artifacts with Interoperable Authentication Marks"). No direct precedent to quote.
- Positioning: OASIS calls itself "The Layer Above Everything". In practice it is a data and identity backend, not an on-page layer, so it does not compete with Canopi. The wording overlaps with meta-layer language though, and joint messaging would need care.

## Scores

| Dimension | Score | Evidence |
|---|---|---|
| Value to Canopi people | 2 | No known overlap of users. No published OASIS or Lumina user numbers. No use a Canopi person would return for. |
| DP alignment | 3 | Strong shared language (sovereignty, interoperate without absorbing). Karma conflicts with DP18; token sales with DP17. |
| Feasibility now | 4 | CORS open, bearer JWT, API healthy. Only the sign-in route needs the partner. |
| Build cost | 3 | A read-only tab and a tag: a few days. No clear spec for what it should do. |
| Strategic value | 3 | Lumina's audience (conscious enterprises, regenerative communities) matches the WeField / Regenworld constellation audience. Reach unverified. |
| Risk | 2 | Active token and NFT sales on both sides; one-maintainer codebase; source-visible, non-standard licence; no public governance text. |

**17/30 → Park** (module). Relationship: worth one call.

## Proposed shape, if it is ever built
Smallest honest version: row 3 first (link a DID, nothing shown), then row 5 (`oasis-holon` tag). No karma. No manifests drafted, because there is no agreed use yet.

## Blockers
1. No shared users and no agreed use case.
2. Sign-in: password-in-frame today; DID needs Ed25519 or a second key type on our side.
3. Enlightened Nations has no public text.

## Owner decisions
1. Reply to GS or not, and as what: a community invitation (row 1), a technical exchange with the OASIS developer (row 3), or both.
2. Whether a community that is running a token pre-sale can be listed in the directory or join a constellation, and with what wording.
3. Whether a second DID key type is worth adding for one partner.

## Partner asks (not sent)
- Lumina: how many members and residents today; who would be the community's admin; what CASA, HERZ and LUCA are legally and whether the pre-sale is open; the Enlightened Nations text.
- OASIS: who uses the API in production; is DID sign-in on, and with which curve; is there a public holon read; scoped tokens; the licence terms for an integration.
- Both: how Lumina CASA and OASIS relate (company, founders, who decides).

## Sources
All fetched 2026-11-24. luminacasa.co: `/`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/about`, `/join`, `/investment-whitepaper`, `/lumina-technology-overview`, `/oasis-web4`, `/web3-blockchain-community`, `/pre-sale-investment-application`. oasisomniverse.one: `/`, `founders.` subdomain, `api.web4.` (`/api/health`, `/swagger/v1/swagger.json`, `/.well-known/openid-configuration`, one preflight, one unauthenticated GET), `api.starnet.` (`/api/health`). GitHub API: `repos/NextGenSoftwareUK/OASIS` (repo, contributors, commits, licence). Knowledge base: `~/repos/desirable-properties` DP1, DP4, DP8, DP17, DP18, DP22 and `data/compiled/allstructured.json`. Canopi: `docs-site/reference/did-sign-in.md` (staging).
