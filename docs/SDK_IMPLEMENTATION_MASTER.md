# Canopi extension SDK – master implementation guide (`canopi-sdk`)

**Audience:** Implementers working in the **`canopi-sdk`** repository and integrators in the **`canopi` / `presence`** host.  
**Status:** Consolidated from planning docs in the main Canopi repo; this file is the **single entry point** for the SDK repo. Update it when decisions close.

---

## 1. Purpose and scope

### 1.1 What this document covers

- **Sidebar Tab SDK**, **Smart Tag SDK**, and **Overlay Application SDK** – as one family sharing core host contracts.
- **Context anchoring** as a first-class alignment requirement (types, bridge behavior, tab gating).
- **Smart tag product model:** shared core schema, **progressive layers** (signal → state → lineage → governance → effects), and **`patch` as a coordination mode** – including how that model **extends to sidebar and overlay SDK surfaces** (not only smart-tag codepaths).
- **Conflict resolution:** where sources disagreed and a decision was recorded, we state it. Where sign-off is still pending, we list **open questions** with options.
- **Security:** an **extensive security analysis** is a **prerequisite before implementation** (see **§11**); opportunities to use **agents** to strengthen defenses and **monitor for breaches** should be evaluated deliberately, not assumed.

### 1.2 Out of scope (by explicit planning decision)

- **Web embed SDK** and third-party product SDKs (e.g. Web3Auth) – separate tracks.
- **Meta-Domain SDK** (`canopi.meta`) appears in unified store architecture and `SIDEBAR_TAB_SDK_STATUS.md`; the **extension SDK consolidation** explicitly **excludes** meta-domain from the same delivery scope as sidebar / smart-tag / overlay. Note: `meta_domain` as a *field* on smart tag type definitions **is in scope and implemented** (see §14) – what is deferred is a dedicated *Meta-Domain SDK package* for managing meta-domain identities independently.

### 1.3 Source documents (canonical paths in `canopi`)

| Topic | Primary sources |
|--------|-----------------|
| Cross-SDK architecture, manifest `type`, context anchor alignment, **§10–§11 smart tag canvas & patch definition** | `docs/planning/CANOPI_EXTENSION_SDK_CONSOLIDATED_PLAN.md` |
| Smart tag phases, DB/API sketches, Phase 0 gate checklist | `docs/planning/SMART_TAG_SDK_IMPLEMENTATION_PLAN.md` |
| Anchor behavior, bridge, proximity, tab gating | `docs/planning/CONTEXT_ANCHOR_PLAN.md` |
| Sidebar tab specs (manifest, API, quick start, schema files) | `docs/SIDEBAR_TAB_SDK_INDEX.md` (index of linked docs) |
| Host timing / URL behavior for tabs | `docs/TAB_BUILDER_GUIDE.md` |
| Implementation checklist / store | `docs/SIDEBAR_TAB_SDK_STATUS.md`, `docs/CANOPI_STORE_UNIFIED_ARCHITECTURE.md` |

---

## 2. Repo split and current reality (`canopi-sdk`)

### 2.1 Resolved: separate SDK repo vs host

**Decision:** Implement **packages, examples, developer docs, and validation tooling** in **`canopi-sdk`** (separate from the main app). The **`canopi` / `presence`** repo remains the **host**: module loader, bridge, permissions, store integration, built-in UX (dim overlay, proximity, anchor mode, tab gating).

### 2.2 Current repository state (as of authoring)

The root **`README.md`** describes intended packages (`smart-tags`, `sidebar-sdk`, `overlays`, `content-anchoring`, `shared`) and is the **single documentation entry point** (link to this file + table of **`canopi`** spec paths). **Reality:** **`packages/smart-tags`** and **`packages/sidebar-sdk`** have workspace **`package.json`** + Vite builds. **`overlays`**, **`content-anchoring`**, and **`shared`** may remain partial until bootstrapped.

**Open engineering question (operational):** Add **`package.json`** + builds for remaining packages as Phase A/B expand, or keep them internal until needed.

---

## 3. Single mental model: one core, three surfaces

All three SDK kinds share the same **core** capabilities (bridge, permissions, storage, user, theme, diagnostics). Each adds a **type-specific namespace** and host integration point.

| Kind | Planned JS namespace | Primary UX surface |
|------|----------------------|-------------------|
| Sidebar tab | `canopi.tab` | Sidepanel tab strip + tab content |
| Smart tag | `canopi.tag` | Page DOM / inline or anchored UI tied to content |
| Overlay app | `canopi.overlay` | Page-level UI (reserved) |

**Resolved:** Unified manifest discriminator: every module includes **`type`:** `sidebar-tab` \| `smart-tag` \| `overlay-app` (filenames may vary: `canopi-tab.json`, `canopi-tag.json`, `canopi-overlay.json`, or unified `canopi-manifest.json`).

---

## 4. Context anchoring – alignment rules

### 4.1 Resolved: one `ContextAnchor` model

- **Canonical types** live in the host: `presence/src/types/anchors.ts` (serialization helpers alongside).  
- **SDK modules must not fork** anchor types for persisted or API-bound data. Use **`ContextAnchor`** (and related types) **only**.
- Smart tags use a **`contextAnchor`** field with that same model (see consolidated plan §10.4–§11.1).

### 4.2 Resolved: host-owned UX is not reimplemented by third-party modules

Dim overlay in anchor mode, proximity highlights, target ring, **`pendingContextAnchor`** routing, and **tab gating** are **built-in**. Third-party code **subscribes** and **hands off** structured payloads through the shared abstractions – it does **not** rebuild core anchor UX.

### 4.3 Abstract capability layer (page integration)

Plans describe a **small, stable surface** for page context, selection signals, structured handoff to the sidepanel, **mode awareness** (anchor on/off, proximity paused), and **gating** (which sidepanel tabs participate). Smart tags, sidebar tabs, and overlays **all** use this layer – **one internal pipeline** where possible.

### 4.4 Naming conflict → recommended resolution (pending formal doc sync)

| Source | Name suggested for the shared layer |
|--------|-------------------------------------|
| Consolidated plan §2b / §12 | `canopi.context`, `canopi.page`, `canopi.pageIntegration` (listed as options) |
| **SMART_TAG_SDK_IMPLEMENTATION_PLAN.md** §Q5 | **`canopi.host`** – recommended for readability (`canopi.host.getPageContext()`, etc.) and to avoid overloading “context anchor” |

**Resolved recommendation (engineering):** Adopt **`canopi.host`** for the **page-integration / host-facing** API **unless** a later RFC chooses otherwise. **Action:** Update **`CANOPI_EXTENSION_SDK_CONSOLIDATED_PLAN.md`** namespace table when sign-off completes (still listed as a Phase 0 checkbox in the smart-tag implementation plan).

**Confusion to avoid:** **`canopi.bridge`** remains **message-passing** in existing docs – do not overload it as the page-integration namespace.

---

## 5. Patches, progressive layers, and extending the model to **all** SDK entries

This section confirms the planning content about **patches** and **extension across sidebar, overlay, and smart-tag surfaces**.

### 5.1 What “patch” means (resolved)

**Decision (consolidated plan §10.7–§10.8):**

- A **patch** is **not** a separate product category or forked type system.
- A **patch** is a **smart tag** with **`status.mode === 'patch'`**, with structured **state**, **lineage**, **governance**, and permissions appropriate to high-coordination work.
- **Promotion** to patch is driven by **coordination needs** (lifecycle, branching, accountability, review, governance hooks, executable outcomes) – see §10.12.

### 5.2 “Patch” vs tag `type` field (resolved intent, don’t conflate)

In the **taxonomy** sketch (`SMART_TAG_SDK_IMPLEMENTATION_PLAN.md`), **`'patch'`** appears as a **type string** meaning *“high-coordination object, promotion target, not created directly”* – that is **taxonomic language** in the seed table. The **architecture** definition of patch is **`status.mode === 'patch'`** (consolidated §10.8). **Implementers:** treat **mode** as the **coordination signal**; `type` remains developer-extensible strings for product flavor.

### 5.3 Progressive activation layers A–E (resolved structure)

Optional layers on the **same** `SmartTag` substrate (consolidated §10.6):

| Layer | Role |
|-------|------|
| **A – Signal** | Lightweight expression (highlight, note, label, …) |
| **B – State** | Lifecycle (proposed / active / resolved / …) |
| **C – Lineage** | Branching / history (`parentId`, `rootId`, `revision`, …) |
| **D – Governance** | Roles, permissions, policy |
| **E – Effect** | Executable or declarative outcomes (notify, filter, escalate, route, display) |

### 5.4 Extending this model to **all SDK entries** (sidebar, overlay, smart tag)

**This is the core “extension to all SDK entries” story:** the **same** `SmartTag` (including **patch mode** and all layers) is implemented and enforced **once** on the host; **Sidebar Tab SDK** and **Overlay Application SDK** are **clients** that render and propose actions – they do **not** duplicate persistence or policy.

Consolidated plan **§11.2** assigns **per-layer** responsibilities across three columns:

| Layer | Host (persistence & policy) | Sidebar Tab SDK | Overlay Application SDK |
|-------|-----------------------------|-----------------|---------------------------|
| **Core** | Source of truth; authZ | Detail panels, lists, composer handoff | Compact tag chrome; bridge create/update |
| **A – Signal** | Store + optional denormalized kind | Reaction UI, notifications | Inline chips, hover cards |
| **B – State** | State machine; audit | Queues, “mark resolved” | State badge; request transitions via bridge |
| **C – Lineage** | Graph / thread storage | Thread view, fork picker, compare | “Fork from here” tied to selection |
| **D – Governance** | Roles, policy, votes | Dashboards, reviewer UX | Role-gated prompts (host validates) |
| **E – Effect** | Execute / enqueue safely | **Route** to tabs / composer | **Display** / **notify** on page |

**Principle (resolved):** Host owns **truth and enforcement** for state, lineage, governance, and dangerous effects. **Both** sidebar modules and overlay modules **reflect the same object**; **promotion** lightweight → structured → patch is a **host/API transition** (consolidated §11.4).

**Confirmation:** Yes – the **patches / progressive-layer** design is explicitly **extended to all three SDK kinds** via this **matrix**: smart tags carry the data; **sidebar** and **overlay** entries are **surfaces** on the same canvas, not parallel type systems.

### 5.5 Resolved: explicit `status.mode` vs automatic inference

**Recommendation recorded in multiple places:** **`status.mode` is explicit** – the creator (or declared intent) sets promotion; the **host validates** consistency (e.g. **`patch`** requires **`lineage` + `governance`** present). **No silent auto-upgrade** when optional fields appear – avoids surprising promotion.

### 5.6 Open questions (patch / layers / persistence)

| ID | Topic | Options / notes |
|----|--------|-----------------|
| OQ-1 | **DB layout for layers** | **Recommendation:** JSONB column(s) per layer group for v1; optional generated columns for indexing (`state_current`, etc.). Alternative: separate tables for heavy audit (state history). Still listed as Phase 0 sign-off in smart-tag plan (Q7). |
| OQ-2 | **`SmartTag` vs messages** | Short term: **do not** replace message `context_anchor` with smart-tag-only flow without a conscious migration (smart-tag plan **Q12 / message anchor flow** – recommendation favors coexistence). |
| OQ-3 | **Effects for third-party v1** | Recommendation: **`display`** (declarative) + **`notify`** only; stricter execution TBD (Q9). |
| OQ-4 | **Neo4j / Gov Hub** | Whether lineage-heavy / patch tags sync to Neo4j on day one vs relational-only until integration – **open** (smart-tag plan Phase 4C note). |

---

## 6. Overlay vs built-in “overlay” terminology (resolved distinction)

**Do not conflate:**

- **Overlay Application SDK** (`canopi.overlay`) – third-party page-level UI (reserved).
- **Context-anchor dim / proximity overlays** – **built-in host** behaviors (`CONTEXT_ANCHOR_PLAN.md`).
- **Tab Manager modal** – internal host UI.

---

## 7. Manifests, store, and gating

### 7.1 Resolved

- Unified store discovery with **`type`** filter; shared manifest sections plus **type-specific `config`** (`config.tab`, `config.tag`, `config.overlay`).
- **`participatesIn`**-style manifest hints for anchor vs smart-tag flows appear in consolidated §2b as a **sketch** – modules declare participation in **`context-anchor`**, **`smart-tag`**, etc.

### 7.2 Open

| ID | Topic | Notes |
|----|--------|------|
| OQ-5 | **Exact manifest schema for gating** | Consolidated §12 item 6 – field names and enums need JSON Schema + validator in SDK repo. |
| OQ-6 | **`ContextAnchor` publication** | Single SoT in host vs **`@canopi/anchors`** package – preference is **single SoT**; avoid divergence (consolidated §12 item 4). |

---

## 8. Implementation roadmap aligned with `canopi-sdk`

Phasing follows **CANOPI_EXTENSION_SDK_CONSOLIDATED_PLAN.md §8** and **SMART_TAG_SDK_IMPLEMENTATION_PLAN.md**. High-level mapping:

| Phase | SDK repo (`canopi-sdk`) | Host (`presence`) |
|-------|-------------------------|-------------------|
| Bootstrap | Packages for types, manifest schemas, validators; **this doc** + migrated developer guides | Loader entry RFC |
| Manifest v2 | Unified manifest + examples | Loader reads `type`; backward compatible tab manifests |
| Core runtime | Published types matching **`window.canopi`** | Inject core: bridge, permissions, storage, user, theme, diagnostics |
| Page integration | Types + docs for **`canopi.host`** | `contextAnchorBridge` + tab/page lifecycle unified pipeline |
| Sidebar / tag / overlay | Examples + RFCs per surface | `SidebarTabManager`, `SmartTagManager`, `OverlayAppManager` |

**Naming note:** Planning text sometimes says `canopi-extension-sdk`; **this repository is `canopi-sdk`** – treat that as the implementation target unless renamed.

---

## 9. Conflicts merged – summary table

| Topic | Conflict | Resolved direction |
|-------|-----------|-------------------|
| Anchor types | Parallel schemas in SDK vs host | **Single model:** `ContextAnchor` from host types; no parallel API anchor tree. |
| “Overlay” | SDK product vs anchor dim layer | **Distinct** terms. |
| Meta-Domain SDK | In store status doc vs consolidation scope | **Out of scope** for extension SDK consolidation unless product expands scope. |
| Page-integration name | `canopi.context` vs **`canopi.host`** | **Recommend `canopi.host`** (smart-tag plan); consolidated doc **should be updated** after sign-off. |
| Patch semantics | `type: 'patch'` vs `status.mode` | **Authoritative:** **`status.mode === 'patch'`** for coordination weight; seed **`type`** table is taxonomy, not a second patch definition. |
| Sidebar docs location | Specs only in `canopi` vs SDK repo | **Specs remain in `canopi`** until migrated; **this master doc** lives in **`canopi-sdk`** as the bridge. |

---

## 10. Open decisions (from consolidated §12 and Phase 0 gates)

Items still listed as open in source docs:

1. **Package naming** – monorepo package names (`@canopi/sdk-types`, `@canopi/manifest-schema`, …) vs current ad hoc `packages/*`.
2. **Versioning** – host API version vs SDK semver; feature flags for experimental APIs.
3. **`canopi.tag` / `canopi.overlay`** – full surface area + security model (called out as high design risk).
4. **`ContextAnchor` distribution** – package split vs host re-export (OQ-6).
5. **Exact `canopi.host` method list** – wrap `contextAnchor.*` bridge keys and tab/page events (consolidated §12 item 5).
6. **API persistence for `SmartTag`** – first-class REST/Graph resource vs embedded-only v1 (consolidated §12 item 7).
7. **Effect execution** – server vs extension-only; sandbox for third-party **route** / **display** (consolidated §12 item 8).
8. **Phase 0 checklist** in smart-tag plan – Q2 type taxonomy enum vs open string; Q3 `content?: string` on core; Q6 `sdkTagEligible()`; etc.
9. **Security analysis gate** – formal threat model + monitoring strategy **before** shipping third-party-facing APIs (see **§11**).

---

## 11. Security prerequisites: analysis, agents, and breach monitoring

**Policy:** Third-party sidebar tabs, smart tags, and overlays expand the attack surface (DOM access, messaging bridges, selection and page context, storage, network, optional effects). An **extensive security analysis** must be **completed and reviewed before** locking APIs or shipping implementations that expose these surfaces to untrusted modules. Ad-hoc coding ahead of that analysis risks cementing insecure contracts.

### 11.1 What “extensive security analysis” should cover (non-exhaustive)

Plan for explicit workstreams such as:

- **Threat modeling** – STRIDE or equivalent across loader, manifest/store trust, **`window.canopi`** namespaces, **`canopi.bridge`** vs **`canopi.host`**, permission prompts, content-script boundaries, and smart-tag **effect** execution (consolidated plan already flags **`canopi.tag` / `canopi.overlay`** as high design-risk).
- **Trust boundaries** – What the host guarantees vs what modules can assert; signing/review policy for store-listed modules vs developer mode.
- **Injection and abuse** – XSS via overlay/tag UI, malicious manifests, bridge flooding, privilege escalation paths, selection/page-context exfiltration.
- **Supply chain** – npm packages in SDK consumer apps, manifest updates, reproducible builds where applicable.
- **Privacy** – Alignment with privacy commitments on page data leaving the extension.

Deliverables should include **documented risks, mitigations, residual risk**, and **acceptance criteria** tied to releases.

### 11.2 Agents: opportunities to bolster security (evaluate, then adopt)

**Evaluate** where **agents** (automated assistants, CI-integrated reviewers, or specialized security agents) add real value versus overhead or false confidence:

| Area | Possible agent-assisted roles |
|------|------------------------------|
| **Development** | Manifest diff review against schema and permission policy; suggested test cases from threat scenarios; consistency checks across host + SDK types. |
| **Review** | Summarize third-party module behavior from manifest + static patterns; flag dangerous permission combinations. |
| **Testing** | Generate fuzz or property-test seeds for bridge messages; adversarial prompts for internal staging only (never substitute for penetration testing). |

**Guardrails:** Agent outputs are **advisory**; security decisions remain human-owned. Watch for **prompt injection** into security tooling and **automation bias** (rubber-stamping agent “clean” reports). Prefer agents that integrate with **deterministic checks** (schema validation, capability allowlists) rather than replacing them.

### 11.3 Active monitoring for breaches and abuse

Implementation planning should include **operational security**, not only design-time analysis:

- **Detection** – Define signals for suspected compromise or abuse: anomalous bridge patterns, repeated permission denials vs grants, spikes in module network scopes, suspicious storage keys, correlated failures after manifest updates.
- **Response** – Incident runbooks, kill-switch or disable paths for malicious modules, communication with affected users where applicable.
- **Agents in monitoring** – Evaluate **assistive** use cases: triage prioritization, log clustering, anomaly narrative drafts for on-call – with **human verification** before destructive actions.

Cross-reference relevant embed/security thinking in **`canopi`** where applicable (e.g. `docs/WEB_EMBED_SDK_SECURITY_PRIVACY.md`) for patterns; **extension SDK threats are not identical** – reuse ideas, repeat analysis for extension-specific surfaces.

---

## 12. Practical checklist for implementers in `canopi-sdk`

1. Complete or schedule the **§11 security analysis gate** before treating APIs as stable for third parties.  
2. Read **`CANOPI_EXTENSION_SDK_CONSOLIDATED_PLAN.md`** (especially §2, §10–§11).  
3. Read **`SMART_TAG_SDK_IMPLEMENTATION_PLAN.md`** for phases and DB/API detail.  
4. Read **`CONTEXT_ANCHOR_PLAN.md`** for bridge and gating.  
5. For sidebar tabs: **`SIDEBAR_TAB_SDK_*`** via **`SIDEBAR_TAB_SDK_INDEX.md`** + **`TAB_BUILDER_GUIDE.md`**.  
6. When implementing **patch / lineage / governance UX**, use consolidated **§11.2** (canvas ↔ surfaces matrix) – sidebar vs overlay **surface** responsibilities, single host truth.  
7. Keep **`canopi-sdk`** packages aligned with **`window.canopi`** contracts as the host implements them; avoid inventing duplicate anchor or smart-tag shapes.

---

## 14. Smart tag type identity

### 14.1 Meta-domain identity (resolved)

Every smart tag type has two identifiers: a `tag_type` shorthand (mutable) and a `meta_domain`
that is **permanently immutable** (e.g. `task.smart-tag.meta`). This solves instance permanence:
old instances always resolve to the correct schema version even after a type is renamed or deprecated.

**Resolved naming convention:** `<name>.smart-tag.meta`  
**Future extension:** `<name>.overlay.meta`, `<name>.sidebar.meta` (same pattern for other app kinds)

---

## 15. Phase A delivery: sidebar tabs first

**Decision:** Implement **sidebar tab modules only** before smart tags and overlay SDK surfaces.

**Execution guide (host inventory, worktree layout, exit criteria):** [`docs/SIDEBAR_TABS_PHASE_A.md`](./SIDEBAR_TABS_PHASE_A.md).

**Repos / branches:** `sdk/sidebar-tabs` in **`canopi-sdk`** and **`canopi`**. Recommended host checkout: separate **git worktree** on `sdk/sidebar-tabs` so other feature branches stay untouched.

Phase B (smart tags + `canopi.host` alignment) starts after Phase A exit criteria in that doc and after **§11** security planning for tag surfaces.

---

## 16. Document maintenance

- **Owns:** SDK maintainers + host liaison for `ContextAnchor` / bridge.  
- **When to update:** Any closed Phase 0 item from the smart-tag plan; any loader or namespace change in `presence`; first migration of **`SIDEBAR_TAB_*`** files into this repo; Phase A/B sidebar progress per **`SIDEBAR_TABS_PHASE_A.md`**.

**Revision log:**
- Initial master synthesis from consolidated extension SDK plan + smart tag implementation plan + sidebar status/index; repo-specific drift notes §2.2. Added §11 security prerequisites (analysis, agents, monitoring).
- **April 2026:** Added §14 – smart tag type identity (meta-domain). Updated §1.2 meta-domain scope note.
- **May 2026:** Added §15 – Phase A sidebar-tabs-first delivery + `SIDEBAR_TABS_PHASE_A.md`.
