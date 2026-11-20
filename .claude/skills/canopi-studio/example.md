# Worked example: Pinecone CRM

This example uses the studio-kit demo seed, `packages/studio-kit/fixtures/sample-project.json`. Pinecone is a fictional CRM for small B2B sales teams. The human's notes said: "Reps live in the browser researching prospects; we want the account brief to follow them onto the prospect's own website."

**Intake.** The material showed a public REST API with per-workspace API keys. `extracted.apiHints` cite the evidence:
- `GET /v1/accounts/lookup?domain=` is documented.
- The uploaded PDF links to an OpenAPI file that lists `/v1/deals` and `/v1/activities`, with an `account_domain` filter.
- No reporting endpoint was found.

**Ideas → STOP 1.** Three ideas came out of this:
1. Account brief on the prospect's site (sidebar)
2. Buying signals (smart tag, on a selection of 20+ characters and on `*://*/news/*`)
3. Territory map (both)

The human dropped the territory map because it needs entity detection, which the platform doesn't have. `feedback` records their words, and ideas 1 and 2 have `selected: true`.

**Components → STOP 2.**
- For the sidebar: header, two `stat`s, `detail`, `table`, `timeline`, `sparkline`, `action`, `form` (`composeTagType: buying-signal`), `tag-feed` and `ask-deepi`.
- For the smart tag: `badge`, `text`, `rating`, `link` and `author`.

The human rejected `cmp_logo_card` ("duplicates the header") and asked for the pipeline stat as a sum. The card stays in the file with `status: "rejected"`.

**Design.**
- `design.sidebar`: tab `pinecone-tab` 🌲, plus the layout.
- `design.smartTag`: `tagType: buying-signal`, the pill metric `signal`, and `summary: "{{signal}}: {{note}}"`. The payload schema has `signal` (an enum, indexed), `note`, `strength` (1–5, indexed) and `source`.

**Data.** Each source states how its shape is known:

| Source | Confidence | Why |
|---|---|---|
| `src_account` | documented | Public reference for the lookup endpoint |
| `src_deals` | inferred | The endpoint is in the OpenAPI index; the shape is taken from the account page's deal fields |
| `src_activity` | inferred | The fields come from the timeline UI |
| `src_pipeline` | invented | No endpoint exists; Pinecone would have to add `/v1/reports/pipeline` |

Every source has a default fixture. Each one also has a `{ "pageHost": "www.northwind-outfitters.example" }` fixture, so the preview has a "Northwind Outfitters" page. To show buying-signal pills in the preview, add a `bridge` source of sample payloads, for example `{ "anchorText": "raised a $40M Series B", "data": { "signal": "funding", "note": "…", "strength": 4 } }`. If it is missing, `validate` warns about it.

**Mockup → STOP 3, and scaffold.**

```bash
S=.claude/skills/canopi-studio/scripts/studio.mjs
cp packages/studio-kit/fixtures/sample-project.json /tmp/pinecone.json
node $S validate /tmp/pinecone.json          # valid (stage mockup): 0 error(s), 1 warning(s): no bridge source yet
node $S preview  /tmp/pinecone.json          # /tmp/preview.html: Northwind page, the Pinecone tab docked, sources table
node $S scaffold /tmp/pinecone.json --author "Ada Example"   # writes studio/pinecone-crm/draft/
#   built studio/pinecone-crm/draft/pinecone-crm-tab: studio.pinecone-crm.tab@0.1.0: 6 files -> …/dist/submission.json
#   built studio/pinecone-crm/draft/pinecone-crm-tag: studio.pinecone-crm.tag@0.1.0: 0 files -> …/dist/submission.json
```

The report to the human says the following. Two drafts are built. `network.connect` lists the placeholder `studio-mock.invalid`. Three of the four shapes are guesses until Pinecone confirms them, and `src_pipeline` needs a new endpoint. To go live, Pinecone answers CORS for `Origin: null`, and the API key is pasted into the tab and kept in `storage:module`. Submitting is the human's step.
