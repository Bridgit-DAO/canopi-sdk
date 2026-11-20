# Studio projects

These are Canopi Studio projects, run locally by the `canopi-studio` skill (`.claude/skills/canopi-studio/SKILL.md`). Each one is a `StudioProject` validated by `@canopi-sdk/studio-kit`, the same document the web Studio stores.

- `<slug>/project.json`: the project. Every stage has been merged in and validated.
- `<slug>/draft/<slug>-tab/` and `<slug>/draft/<slug>-tag/`: the scaffolded ManifestV2 module drafts. These are drafts, not modules. They move to `modules/` only after the owner says go.
- `<slug>/preview.html` (gitignored; regenerate it with `node .claude/skills/canopi-studio/scripts/studio.mjs preview <slug>`): a clickable mock-up.

| Slug | App | Shape | Data | Status |
|---|---|---|---|---|
| `wayback-machine` | https://web.archive.org/ (Internet Archive Availability API) | Sidebar "Is this page archived?" + smart tag `archived-citation` | 2 documented (the Availability API answers CORS for `Origin: null`), 2 invented (captures per year, sample tags) | Trial run of the skill, 2026-11-14. No human made the choices at the stops. Drafts built, not submitted |
