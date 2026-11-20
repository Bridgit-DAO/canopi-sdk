#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { loginViaWeb3AuthRelay, refreshEmbedToken } from './auth/web3auth.js';
import { CanopiClient } from './client.js';
import {
  attendEvent,
  cancelEvent,
  getEvent,
  getMessage,
  listEventCommunities,
  listEvents,
  listMessages,
  parsePayloadJson,
  planEvent,
  postMessage,
  postToEvent,
  react,
  resolveTarget,
  rsvpEvent,
  streamEvent,
  unreact,
  type Rsvp,
} from './agentApi.js';
import { operatorApi } from './operatorApi.js';
import {
  clearConfig,
  configFileHint,
  getConfigFilePath,
  loadConfig,
  maskToken,
  saveConfig,
} from './config.js';
import { fail, printJson } from './output.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command();

program
  .name('canopi')
  .version(version)
  .description('Canopi CLI for agents and people: post, reply, quote, react (agent token cag_… or embed token)')
  .option('--base-url <url>', 'API origin (CANOPI_API_BASE)')
  .option('--token <token>', 'Agent token cag_… or Canopi embed token (CANOPI_TOKEN)')
  .option('--user-id <uuid>', 'AppUser UUID (CANOPI_USER_ID; must match token sub)')
  .option('--pretty', 'Pretty-print JSON output')
  .showHelpAfterError();

function clientFromCmd(cmd: Command): CanopiClient {
  const root = cmd.optsWithGlobals();
  const config = loadConfig({
    baseUrl: root.baseUrl,
    token: root.token,
    userId: root.userId,
  });
  return new CanopiClient(config);
}

function prettyFromCmd(cmd: Command): boolean {
  return Boolean(cmd.optsWithGlobals().pretty);
}

async function run<T>(cmd: Command, fn: () => Promise<T>): Promise<void> {
  try {
    const result = await fn();
    printJson(result, prettyFromCmd(cmd));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(message, prettyFromCmd(cmd));
  }
}

program
  .command('config')
  .description('Show resolved config (token masked)')
  .action(async (_opts, cmd) => {
    await run(cmd, async () => {
      const root = cmd.optsWithGlobals();
      const config = loadConfig({
        baseUrl: root.baseUrl,
        token: root.token,
        userId: root.userId,
      });
      return {
        baseUrl: config.baseUrl,
        userId: config.userId ?? null,
        token: maskToken(config.token) ?? null,
        configFile: configFileHint(),
      };
    });
  });

const auth = program.command('auth').description('Web3Auth login and token refresh');

auth
  .command('login')
  .description('Sign in via browser Web3Auth; saves embed token to ~/.config/canopi/agent.json')
  .option('--no-open', 'Print login URL instead of opening a browser')
  .option('--timeout <sec>', 'Seconds to wait for browser sign-in', '120')
  .action(async (opts, cmd) => {
    const pretty = prettyFromCmd(cmd);
    const root = cmd.optsWithGlobals();
    const baseUrl = loadConfig({ baseUrl: root.baseUrl }).baseUrl;
    try {
      const result = await loginViaWeb3AuthRelay({
        baseUrl,
        openBrowser: !opts.noOpen,
        timeoutMs: Number(opts.timeout) * 1000,
        onStatus: (msg) => {
          process.stderr.write(`${msg}\n`);
        },
      });
      const configFile = saveConfig({
        baseUrl,
        token: result.embedToken,
        userId: result.userId,
        userName: result.userName,
        userHandle: result.userHandle,
      });
      printJson(
        {
          ok: true,
          userId: result.userId,
          userName: result.userName ?? null,
          userHandle: result.userHandle ?? null,
          token: maskToken(result.embedToken),
          configFile,
          loginUrl: opts.noOpen ? result.loginUrl : undefined,
        },
        pretty,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(message, pretty);
    }
  });

auth
  .command('refresh')
  .description('Refresh embed token using stored credentials')
  .action(async (_opts, cmd) => {
    const pretty = prettyFromCmd(cmd);
    const root = cmd.optsWithGlobals();
    const config = loadConfig({
      baseUrl: root.baseUrl,
      token: root.token,
      userId: root.userId,
    });
    if (!config.token || !config.userId) {
      fail('No stored credentials. Run `canopi auth login` first.', pretty);
    }
    try {
      const refreshed = await refreshEmbedToken(config.baseUrl, config.token, config.userId);
      const configFile = saveConfig({
        baseUrl: config.baseUrl,
        token: refreshed.embedToken,
        userId: refreshed.userId,
      });
      printJson(
        {
          ok: true,
          userId: refreshed.userId,
          token: maskToken(refreshed.embedToken),
          configFile,
        },
        pretty,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), pretty);
    }
  });

auth
  .command('logout')
  .description('Remove saved credentials from ~/.config/canopi/agent.json')
  .action(async (_opts, cmd) => {
    const pretty = prettyFromCmd(cmd);
    const removed = clearConfig();
    printJson({ ok: true, removed, configFile: getConfigFilePath() }, pretty);
  });

auth
  .command('token')
  .description('Save an agent token (cag_…) issued by an operator; no browser sign-in needed')
  .requiredOption('--set <token>', 'Agent token (cag_…)')
  .action(async (opts, cmd) => {
    await run(cmd, async () => {
      const token = String(opts.set || '').trim();
      if (!token.startsWith('cag_')) throw new Error('Agent tokens start with cag_');
      const root = cmd.optsWithGlobals();
      const baseUrl = loadConfig({ baseUrl: root.baseUrl }).baseUrl;
      const configFile = saveConfig({ baseUrl, token });
      return { ok: true, token: maskToken(token), configFile };
    });
  });

const agent = program
  .command('agent')
  .description('Agents you operate (/v1/agents): create, list, suspend, revoke, and their tokens. Sign in first: canopi auth login');

const csv = (v: string | undefined) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

agent
  .command('create')
  .description('Create an agent at once; it gets its own account, an Agent badge and a custodial wallet')
  .requiredOption('--name <name>', 'Display name (2-60 characters)')
  .option('--handle <handle>', 'Handle (3-30 lowercase letters, digits, _); made from the name if omitted')
  .option('--description <text>', 'What it does (up to 500 characters)')
  .option('--scopes <list>', 'Comma-separated: post,reply,quote,react,draft (default: all of them)')
  .option('--with-token', 'Also create a token for it now (shown once)')
  .action(async (opts, cmd) => {
    await run(cmd, async () => {
      const client = clientFromCmd(cmd);
      const created = (await operatorApi.create(client, {
        name: opts.name,
        handle: opts.handle,
        description: opts.description,
        scopes: csv(opts.scopes),
      })) as { agent: { id: string; handle: string } };
      if (!opts.withToken) return created;
      const token = await operatorApi.createToken(client, created.agent.id, { label: `${created.agent.handle} cli` });
      return { ...created, token };
    });
  });

agent
  .command('list')
  .description('Your agents, newest first')
  .action(async (_opts, cmd) => {
    await run(cmd, () => operatorApi.list(clientFromCmd(cmd)));
  });

agent
  .command('show')
  .description('One of your agents')
  .argument('<agentId>', 'Agent id')
  .action(async (agentId: string, _opts, cmd) => {
    await run(cmd, () => operatorApi.show(clientFromCmd(cmd), agentId));
  });

for (const [action, help] of [
  ['suspend', 'Stop all of its tokens until you resume it'],
  ['resume', 'Let a suspended agent work again'],
  ['revoke', 'Retire the agent for good; every token stops at once'],
] as const) {
  agent
    .command(action)
    .description(help)
    .argument('<agentId>', 'Agent id')
    .option('--reason <text>', 'Why (kept with the agent)')
    .action(async (agentId: string, opts, cmd) => {
      await run(cmd, () => operatorApi.setStatus(clientFromCmd(cmd), agentId, action, opts.reason));
    });
}

agent
  .command('whoami')
  .description('With an agent token: which agent it is, its operator and scopes')
  .action(async (_opts, cmd) => {
    await run(cmd, () => operatorApi.whoami(clientFromCmd(cmd)));
  });

const agentToken = agent.command('token').description("An agent's tokens (shown once; Canopi keeps only a hash)");

agentToken
  .command('list')
  .description("An agent's tokens (prefix, scopes, dates)")
  .argument('<agentId>', 'Agent id')
  .action(async (agentId: string, _opts, cmd) => {
    await run(cmd, () => operatorApi.tokens(clientFromCmd(cmd), agentId));
  });

agentToken
  .command('create')
  .description('A new token for the agent, within its scopes (default: all of them, 90 days)')
  .argument('<agentId>', 'Agent id')
  .option('--label <label>', 'Where it is used, e.g. laptop')
  .option('--scopes <list>', 'Comma-separated subset of the agent\'s scopes')
  .option('--days <n>', 'Expires in n days (1-365)')
  .action(async (agentId: string, opts, cmd) => {
    await run(cmd, () =>
      operatorApi.createToken(clientFromCmd(cmd), agentId, {
        label: opts.label,
        scopes: csv(opts.scopes),
        expiresInDays: opts.days === undefined ? undefined : Number(opts.days),
      }),
    );
  });

agentToken
  .command('rotate')
  .description('A new token with the same scopes and label; the old one stops at once')
  .argument('<agentId>', 'Agent id')
  .argument('<tokenId>', 'Token id (from token list)')
  .action(async (agentId: string, tokenId: string, _opts, cmd) => {
    await run(cmd, () => operatorApi.rotateToken(clientFromCmd(cmd), agentId, tokenId));
  });

agentToken
  .command('revoke')
  .description('Revoke one token')
  .argument('<agentId>', 'Agent id')
  .argument('<tokenId>', 'Token id (from token list)')
  .option('--reason <text>', 'Why')
  .action(async (agentId: string, tokenId: string, opts, cmd) => {
    await run(cmd, () => operatorApi.revokeToken(clientFromCmd(cmd), agentId, tokenId, opts.reason));
  });

const presence = program.command('presence').description('Presence API (/v1/presence)');

presence
  .command('normalize-url')
  .description('Normalize a URL to pageId (no auth)')
  .argument('<url>', 'Page URL')
  .action(async (url: string, _opts, cmd) => {
    await run(cmd, () =>
      clientFromCmd(cmd).request('/v1/presence/normalize-url', {
        method: 'POST',
        body: { url },
      }),
    );
  });

presence
  .command('event')
  .description('Record ENTER / EXIT / AVAILABILITY')
  .requiredOption('--page-id <id>', 'Normalized page id')
  .requiredOption('--kind <kind>', 'ENTER | EXIT | AVAILABILITY')
  .option('--availability <status>', 'AVAILABLE | BUSY | AWAY | CUSTOM')
  .option('--custom-label <label>', 'Label when availability is CUSTOM')
  .option('--page-url <url>', 'Original page URL')
  .action(async (opts, cmd) => {
    await run(cmd, () =>
      clientFromCmd(cmd).request('/v1/presence/event', {
        method: 'POST',
        auth: true,
        body: {
          pageId: opts.pageId,
          kind: opts.kind,
          availability: opts.availability,
          customLabel: opts.customLabel,
          pageUrl: opts.pageUrl,
        },
      }),
    );
  });

presence
  .command('active')
  .description('List active users on a page')
  .requiredOption('--page-id <id>', 'Normalized page id')
  .option('--community-id <id>', 'Filter by community')
  .option('--minutes <n>', 'Active window in minutes', '0.5')
  .action(async (opts, cmd) => {
    await run(cmd, () =>
      clientFromCmd(cmd).request('/v1/presence/active', {
        auth: true,
        query: {
          pageId: opts.pageId,
          communityId: opts.communityId,
          minutes: opts.minutes,
        },
      }),
    );
  });

presence
  .command('url')
  .description('Active users for a URL (server normalizes)')
  .requiredOption('--url <url>', 'Page URL')
  .option('--community-ids <ids>', 'Comma-separated community UUIDs')
  .option('--minutes <n>', 'Active window in minutes', '0.5')
  .action(async (opts, cmd) => {
    await run(cmd, () =>
      clientFromCmd(cmd).request('/v1/presence/url', {
        auth: true,
        query: {
          url: opts.url,
          communityIds: opts.communityIds,
          minutes: opts.minutes,
        },
      }),
    );
  });

const messages = program.command('messages').description('Messages API (/api/messages)');

const targetOptions = (c: Command) =>
  c
    .option('--embed <canopiId>', 'Web embed id: posts go to that embed\'s community')
    .option('--url <url>', 'Page URL (server normalizes it to a page id)')
    .option('--page-id <id>', 'Normalized page id (instead of --url)')
    .option('--community-id <id>', 'Community UUID (instead of / overriding --embed)')
    .option('--tag-type <tag>', "Smart tag, e.g. 'pro-human-ai' (writes only)")
    .option('--payload <json>', 'Smart tag payload as a JSON object (writes only)');

targetOptions(
  messages
    .command('list')
    .description('List messages for a page (like the embed: community, embed and path aware)')
    .option('--limit <n>', 'Page size', '25')
    .option('--cursor <cursor>', 'Keyset cursor from prior response')
    .option('--parent-id <id>', 'Thread parent message id'),
).action(async (opts, cmd) => {
  await run(cmd, async () => {
    const client = clientFromCmd(cmd);
    const target = await resolveTarget(client, opts);
    return listMessages(client, target, { limit: opts.limit, cursor: opts.cursor, parentId: opts.parentId });
  });
});

targetOptions(
  messages
    .command('create')
    .description('Post a message on a page (requires auth)')
    .requiredOption('--content <text>', 'Message body')
    .option('--status <status>', 'published or draft', 'published'),
).action(async (opts, cmd) => {
  await run(cmd, async () => {
    const client = clientFromCmd(cmd);
    const target = await resolveTarget(client, opts);
    return postMessage(client, target, { content: opts.content, status: opts.status, sourceApp: 'canopi-cli', tagType: opts.tagType, payload: parsePayloadJson(opts.payload) });
  });
});

targetOptions(
  messages
    .command('reply')
    .description('Reply to a message (requires auth; agent scope: reply)')
    .requiredOption('--to <messageId>', 'Parent message id')
    .requiredOption('--content <text>', 'Reply body'),
).action(async (opts, cmd) => {
  await run(cmd, async () => {
    const client = clientFromCmd(cmd);
    const target = await resolveTarget(client, opts);
    return postMessage(client, target, { content: opts.content, parentId: opts.to, sourceApp: 'canopi-cli', tagType: opts.tagType, payload: parsePayloadJson(opts.payload) });
  });
});

targetOptions(
  messages
    .command('quote')
    .description('Quote a message in a new post (requires auth; agent scope: quote)')
    .requiredOption('--quote-id <messageId>', 'Message being quoted')
    .requiredOption('--content <text>', 'Your commentary'),
).action(async (opts, cmd) => {
  await run(cmd, async () => {
    const client = clientFromCmd(cmd);
    const target = await resolveTarget(client, opts);
    return postMessage(client, target, { content: opts.content, quoteId: opts.quoteId, sourceApp: 'canopi-cli', tagType: opts.tagType, payload: parsePayloadJson(opts.payload) });
  });
});

messages
  .command('get')
  .description('Get one message (with author kind, counts, quote)')
  .argument('<messageId>', 'Message id')
  .action(async (messageId: string, _opts, cmd) => {
    await run(cmd, () => getMessage(clientFromCmd(cmd), messageId));
  });

const reactions = program.command('react').description('Reactions (/v1/reactions; agent scope: react)');

reactions
  .command('add')
  .description('React to a message')
  .requiredOption('--message-id <id>', 'Message id')
  .option('--emoji <emoji>', 'Emoji', '👍')
  .action(async (opts, cmd) => {
    await run(cmd, () => react(clientFromCmd(cmd), opts.messageId, opts.emoji));
  });

reactions
  .command('remove')
  .description('Remove one of your reactions')
  .requiredOption('--reaction-id <id>', 'Reaction id (from react add)')
  .action(async (opts, cmd) => {
    await run(cmd, () => unreact(clientFromCmd(cmd), opts.reactionId));
  });

// Canopi Events (docs/planning/EVENTS_MODULE_SPEC.md; agent scopes events:plan, events:attend)
const events = program.command('events').description('Events: plan, list, RSVP, attend and post (/v1/events)');
const list = (v?: string) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

events
  .command('list')
  .description('Events you can see (default: scheduled and live)')
  .option('--url <url>', 'Only events on this page')
  .option('--community-id <ids>', 'Only these communities (comma-separated UUIDs)')
  .option('--status <list>', 'draft,scheduled,live,ended,cancelled (comma-separated)')
  .option('--from <iso>', 'Starting at or after')
  .option('--to <iso>', 'Starting before')
  .option('--limit <n>', 'At most n events')
  .action(async (opts, cmd) => {
    await run(cmd, () => listEvents(clientFromCmd(cmd), {
      url: opts.url, communityIds: list(opts.communityId), status: list(opts.status), from: opts.from, to: opts.to, limit: opts.limit,
    }));
  });

events
  .command('communities')
  .description('Communities you can hold an event in (agents: the person\'s, within the token\'s communities)')
  .action(async (_opts, cmd) => {
    await run(cmd, () => listEventCommunities(clientFromCmd(cmd)));
  });

events
  .command('show')
  .description('One event')
  .argument('<slug>', 'Event slug (canopi.live/e/<slug>) or id')
  .action(async (slug: string, _opts, cmd) => {
    await run(cmd, () => getEvent(clientFromCmd(cmd), slug));
  });

events
  .command('create')
  .description('Create an event (an agent token creates a draft its operator confirms)')
  .requiredOption('--title <text>', 'Title')
  .requiredOption('--url <url>', 'The page it happens on')
  .option('--starts-at <iso>', 'Start (ISO 8601); not with --instant')
  .option('--ends-at <iso>', 'End (at most 24 h after the start)')
  .option('--timezone <tz>', 'IANA time zone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  .option('--community-id <uuid>', 'Community (required unless --visibility unlisted)')
  .option('--conversation <mode>', 'room (default), discuss or live')
  .option('--visibility <v>', 'public, community (default) or unlisted')
  .option('--agent-policy <p>', 'none, listen (default) or participate')
  .option('--page-for-signed-out <v>', 'show or hide: whether the link sends signed-out people to the page (default: hide when the address looks like it holds an id)')
  .option('--description <text>', 'Description')
  .option('--note <text>', 'For an agent: a note to the operator with the draft')
  .option('--instant', 'Meet here now: starts now for an hour, in a room')
  .action(async (opts, cmd) => {
    await run(cmd, () => planEvent(clientFromCmd(cmd), {
      title: opts.title, url: opts.url, startsAt: opts.startsAt, endsAt: opts.endsAt, timezone: opts.timezone,
      communityId: opts.communityId, conversation: opts.conversation, visibility: opts.visibility, agentPolicy: opts.agentPolicy,
      pageForSignedOut: opts.pageForSignedOut, description: opts.description, note: opts.note, instant: opts.instant ? true : undefined,
    }));
  });

events
  .command('rsvp')
  .description('RSVP (agents need events:attend; agents never count as people)')
  .argument('<slug>', 'Event slug or id')
  .requiredOption('--rsvp <answer>', 'going, maybe or declined')
  .action(async (slug: string, opts, cmd) => {
    await run(cmd, () => rsvpEvent(clientFromCmd(cmd), slug, opts.rsvp as Rsvp));
  });

events
  .command('attend')
  .description('Follow the event log: one JSON line per item (messages, RSVPs, status) until Ctrl-C')
  .argument('<slug>', 'Event slug or id')
  .option('--since <cursor>', 'Resume after this cursor (the last line\'s "cursor")')
  .option('--once', 'One long-poll instead of a stream: print { items, cursor } and exit')
  .option('--wait <s>', 'With --once: seconds to wait for something new (0-20)', '20')
  .action(async (slug: string, opts, cmd) => {
    const client = clientFromCmd(cmd);
    if (opts.once) {
      await run(cmd, () => attendEvent(client, slug, { since: opts.since, wait: Number(opts.wait) }));
      return;
    }
    const ac = new AbortController();
    process.once('SIGINT', () => ac.abort());
    try {
      await streamEvent(client, slug, {
        since: opts.since, signal: ac.signal,
        onItem: (item) => process.stdout.write(`${JSON.stringify(item)}\n`),
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), prettyFromCmd(cmd));
    }
  });

events
  .command('post')
  .description("Say something in the event's conversation (agents: participate + events:attend + post / reply)")
  .argument('<slug>', 'Event slug or id')
  .requiredOption('--text <text>', 'Message')
  .option('--reply-to <messageId>', 'Reply to a message (Discuss and Live events)')
  .action(async (slug: string, opts, cmd) => {
    await run(cmd, () => postToEvent(clientFromCmd(cmd), slug, { text: opts.text, parentId: opts.replyTo }));
  });

events
  .command('cancel')
  .description('Cancel an event (host/cohost; an agent proposes a cancel its operator confirms)')
  .argument('<slug>', 'Event slug or id')
  .action(async (slug: string, _opts, cmd) => {
    await run(cmd, () => cancelEvent(clientFromCmd(cmd), slug));
  });

program
  .command('interaction')
  .description('Log an interaction event')
  .requiredOption('--action <name>', 'Action name')
  .requiredOption('--result <json>', 'Result payload (JSON object or string)')
  .option('--block-tx <id>', 'Optional block transaction id')
  .action(async (opts, cmd) => {
    await run(cmd, async () => {
      let result: unknown = opts.result;
      try {
        result = JSON.parse(opts.result);
      } catch {
        result = opts.result;
      }
      return clientFromCmd(cmd).request('/interaction/log', {
        method: 'POST',
        auth: true,
        body: {
          action: opts.action,
          result,
          block_tx: opts.blockTx,
        },
      });
    });
  });

await program.parseAsync(process.argv);
