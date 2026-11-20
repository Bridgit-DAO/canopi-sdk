// @vitest-environment node
/**
 * CLI operator commands: `canopi agent …` calls /v1/agents as the signed-in person (embed
 * token + X-User-Id), and `canopi agent whoami` checks an agent token. The CLI never names anything but
 * Canopi (it is on npm as @canopi-sdk/cli).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CanopiClient } from '../src/client';
import { operatorApi } from '../src/operatorApi';

const PERSON = { baseUrl: 'https://api.example.test', token: 'payload.sig', userId: '684cb24a-9ad3-50df-9f24-567b4236b10e' };
const AGENT = { baseUrl: 'https://api.example.test', token: 'cag_' + 'x'.repeat(43) };
const A = '0c0c0c0c-0c0c-40c0-80c0-0c0c0c0c0c01';
const T = '00000000-0000-4000-8000-000000000001';

function fake(body: unknown = {}, status = 200) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: any }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('operatorApi', () => {
  it('maps every command to /v1/agents with the person\'s auth', async () => {
    const f = fake({ ok: true });
    const c = new CanopiClient(PERSON, { fetchImpl: f.impl });
    await operatorApi.list(c);
    await operatorApi.create(c, { name: 'Scout', handle: 'scout_1', description: 'd', scopes: ['post', 'reply'] });
    await operatorApi.show(c, A);
    await operatorApi.setStatus(c, A, 'suspend', 'pause');
    await operatorApi.setStatus(c, A, 'resume');
    await operatorApi.setStatus(c, A, 'revoke');
    await operatorApi.tokens(c, A);
    await operatorApi.createToken(c, A, { label: 'laptop', scopes: ['post'], expiresInDays: 30 });
    await operatorApi.rotateToken(c, A, T);
    await operatorApi.revokeToken(c, A, T, 'leaked');
    expect(f.calls.map((x) => `${x.method} ${new URL(x.url).pathname}`)).toEqual([
      'GET /v1/agents',
      'POST /v1/agents',
      `GET /v1/agents/${A}`,
      `POST /v1/agents/${A}/suspend`,
      `POST /v1/agents/${A}/resume`,
      `POST /v1/agents/${A}/revoke`,
      `GET /v1/agents/${A}/tokens`,
      `POST /v1/agents/${A}/tokens`,
      `POST /v1/agents/${A}/tokens/${T}/rotate`,
      `POST /v1/agents/${A}/tokens/${T}/revoke`,
    ]);
    expect(f.calls.every((x) => x.headers.Authorization === 'Bearer payload.sig' && x.headers['X-User-Id'] === PERSON.userId)).toBe(true);
    expect(f.calls[1].body).toEqual({ name: 'Scout', handle: 'scout_1', description: 'd', scopes: ['post', 'reply'] });
    expect(f.calls[3].body).toEqual({ reason: 'pause' });
    expect(f.calls[7].body).toEqual({ label: 'laptop', scopes: ['post'], expiresInDays: 30 });
  });

  it('rejects an id that is not a UUID before calling the API', async () => {
    const f = fake();
    const c = new CanopiClient(PERSON, { fetchImpl: f.impl });
    await expect(operatorApi.show(c, '../admin')).rejects.toThrow(/UUID/);
    await expect(operatorApi.rotateToken(c, A, 'x')).rejects.toThrow(/UUID/);
    expect(f.calls).toHaveLength(0);
  });

  it('operator commands need a person, not an agent token', async () => {
    const c = new CanopiClient(AGENT, { fetchImpl: fake().impl });
    await expect(operatorApi.list(c)).rejects.toThrow(/canopi auth login/);
  });

  it('whoami uses the agent token', async () => {
    const f = fake({ agent: { id: A } });
    const c = new CanopiClient(AGENT, { fetchImpl: f.impl });
    expect(await operatorApi.whoami(c)).toEqual({ agent: { id: A } });
    expect(new URL(f.calls[0].url).pathname).toBe('/v1/agent-tokens/me');
    expect(f.calls[0].headers.Authorization).toBe(`Bearer ${AGENT.token}`);
  });

  it('the CLI identifies itself as canopi-cli, and its sources never name an unreleased product', async () => {
    const f = fake();
    await new CanopiClient(PERSON, { fetchImpl: f.impl }).request('/v1/agents', { auth: true });
    expect(f.calls[0].headers['X-Canopi-Client']).toBe('canopi-cli');
    const dir = path.resolve(__dirname, '..');
    const files = ['package.json', 'README.md', ...fs.readdirSync(path.join(dir, 'src'), { recursive: true }).map((f) => path.join('src', String(f)))];
    const hits = files.filter((f) => fs.statSync(path.join(dir, f)).isFile() && /moltlayer/i.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe('CLI options', () => {
  it('no subcommand reuses a global option name (`agent create --token` swallowed the next argument)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/cli.ts'), 'utf8');
    const globals = ['--base-url', '--token', '--user-id', '--pretty'];
    const sub = [...src.matchAll(/\n\s+\.(?:option|requiredOption)\('(--[a-z-]+)/g)].map((m) => m[1]);
    const programBlock = src.slice(src.indexOf('program\n  .name('), src.indexOf('.showHelpAfterError()'));
    const declaredGlobal = [...programBlock.matchAll(/\.option\('(--[a-z-]+)/g)].map((m) => m[1]);
    expect(declaredGlobal.sort()).toEqual([...globals].sort());
    expect(sub.filter((o) => globals.includes(o)).length).toBe(globals.length); // only the global declarations themselves
  });
});
