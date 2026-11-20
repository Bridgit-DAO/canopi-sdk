#!/usr/bin/env node
/**
 * canopi-studio helper CLI. Run from anywhere inside the canopi-sdk checkout, after `npm run build`.
 *
 *   node .claude/skills/canopi-studio/scripts/studio.mjs init <slug> --name "Name" [--url U] [--notes N]
 *   node .claude/skills/canopi-studio/scripts/studio.mjs catalogue
 *   node .claude/skills/canopi-studio/scripts/studio.mjs validate <project.json|slug>
 *   node .claude/skills/canopi-studio/scripts/studio.mjs merge    <project.json|slug> <fragment.json|->   (saved only if valid)
 *   node .claude/skills/canopi-studio/scripts/studio.mjs preview  <project.json|slug> [--out file.html] [--mock-base URL] [--no-write]
 *   node .claude/skills/canopi-studio/scripts/studio.mjs serve    <project.json|slug> [--port 8787] [--delay 150]
 *   node .claude/skills/canopi-studio/scripts/studio.mjs scaffold <project.json|slug> [--out studio/<slug>/draft] [--mock-base URL | --embedded] [--author "Human's name"] [--no-build]
 *
 * Exit codes: 0 ok, 1 invalid project / failed build, 2 usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPreviewHtml, catalogueText, checkProject, draftManifests, findRepoRoot, loadProject, mergeProject, newProject,
  projectPath, saveProject, scaffoldToDir, startFixtureServer,
} from './lib.mjs';

const [cmd, target, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  if (k.startsWith('no-') || k === 'embedded') flags[k] = true;
  else flags[k] = rest[++i];
}

const usage = () => {
  console.error('usage: studio.mjs <init|catalogue|validate|merge|preview|serve|scaffold> [project.json|slug] [flags]');
  process.exit(2);
};

const repo = findRepoRoot();
const resolveProject = (t) => {
  if (!t) usage();
  const file = t.endsWith('.json') ? path.resolve(t) : projectPath(t, repo);
  if (!fs.existsSync(file)) { console.error(`no project at ${file}`); process.exit(2); }
  return file;
};
const rel = (f) => path.relative(process.cwd(), f) || f;

function requireValid(project) {
  const r = checkProject(project);
  console.log(r.text);
  if (!r.ok) process.exit(1);
  return r;
}

switch (cmd) {
  case 'init': {
    if (!target) usage();
    const file = projectPath(target, repo);
    if (fs.existsSync(file)) { console.error(`${rel(file)} exists; not overwriting`); process.exit(1); }
    const p = newProject({ slug: target, name: flags.name, url: flags.url, notes: flags.notes });
    requireValid(p);
    saveProject(file, p);
    console.log(`wrote ${rel(file)} (id ${p.id})`);
    break;
  }
  case 'merge': {
    // merge <slug> <fragment.json | -> : apply one stage's output; saved only if the result is valid.
    const file = resolveProject(target);
    const src = rest[0];
    if (!src) usage();
    const fragment = JSON.parse(src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(src), 'utf8'));
    const m = mergeProject(loadProject(file), fragment);
    if (m.error) { console.error(`not merged: ${m.error}`); process.exit(1); }
    const r = checkProject(m.project);
    console.log(r.text);
    if (!r.ok) { console.error(`not saved: fix the fragment and merge again (${rel(file)} is unchanged)`); process.exit(1); }
    saveProject(file, m.project);
    console.log(`merged into ${rel(file)}`);
    break;
  }
  case 'catalogue':
    console.log(catalogueText());
    break;
  case 'validate': {
    const r = checkProject(loadProject(resolveProject(target)));
    console.log(r.text);
    process.exit(r.ok ? 0 : 1);
    break;
  }
  case 'preview': {
    const file = resolveProject(target);
    const p = loadProject(file);
    requireValid(p);
    if (!flags['no-write']) {
      const m = draftManifests(p, { mockBaseUrl: flags['mock-base'] });
      if (m.ok) {
        p.manifests = m.manifests;
        if (['intake', 'ideas', 'components', 'design', 'data'].includes(p.stage)) p.stage = 'mockup';
        const again = checkProject(p);
        if (again.ok) { saveProject(file, p); console.log(`project.manifests drafted; stage ${p.stage}; saved ${rel(file)}`); } else console.log(`manifests not saved: ${again.text}`);
      } else console.log(`manifests not drafted yet (preview still works): ${m.error}`);
    }
    const out = path.resolve(flags.out ?? path.join(path.dirname(file), 'preview.html'));
    fs.writeFileSync(out, buildPreviewHtml(p, { mockBaseUrl: flags['mock-base'] ?? null, repoRoot: repo }));
    console.log(`preview: ${out}\nopen it: open "${out}"`);
    break;
  }
  case 'serve': {
    const p = loadProject(resolveProject(target));
    requireValid(p);
    const s = await startFixtureServer(p, { port: Number(flags.port ?? 8787), delayMs: Number(flags.delay ?? 150) });
    console.log(`fixtures at ${s.mockBaseUrl}/<sourceId> (CORS answers Origin: null). Ctrl-C to stop.`);
    console.log(`preview against it: node ${rel(path.join(repo, '.claude/skills/canopi-studio/scripts/studio.mjs'))} preview ${target} --mock-base ${s.mockBaseUrl} --no-write`);
    break;
  }
  case 'scaffold': {
    const file = resolveProject(target);
    const p = loadProject(file);
    requireValid(p);
    const r = scaffoldToDir(p, { repoRoot: repo, outDir: flags.out, mockBaseUrl: flags['mock-base'], author: flags.author ? { name: flags.author } : undefined, build: !flags['no-build'], embedded: !!flags.embedded });
    for (const f of r.files) console.log(`wrote ${f}`);
    for (const b of r.builds) console.log(`${b.ok ? 'built' : 'BUILD FAILED'} ${b.dir}: ${b.output}`);
    if (flags.embedded) console.log('mock data embedded in app.js; no mock host in network.connect');
    else if (!flags['mock-base']) console.log(`mock host in network.connect: placeholder ${new URL(r.mockBaseUrl).hostname} (replace it with the real mock or partner host)`);
    p.manifests = r.manifests;
    p.stage = 'scaffold';
    saveProject(file, p);
    console.log(`stage scaffold; saved ${rel(file)}. Not submitted: submitting to the module registry is a human step.`);
    if (r.builds.some((b) => !b.ok)) process.exit(1);
    break;
  }
  default:
    usage();
}
