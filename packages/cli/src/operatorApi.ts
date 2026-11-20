/**
 * Agents you operate (`canopi agent …`): create agents and manage their tokens as the signed-in person
 * (`canopi auth login`). Server: routes/agents.js (/v1/agents). An agent token cannot call these.
 */
import type { CanopiClient } from './client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(value: string, what = 'agent id'): string {
  const v = String(value || '').trim();
  if (!UUID.test(v)) throw new Error(`${what} must be a UUID (see \`canopi agent list\`)`);
  return v.toLowerCase();
}

function asPerson(client: CanopiClient): CanopiClient {
  if (client.isAgentToken()) {
    throw new Error('Managing agents needs your own sign-in, not an agent token. Run `canopi auth login` (or pass --token/--user-id).');
  }
  return client;
}

export type AgentCreate = { name: string; handle?: string; description?: string; scopes?: string[] };
export type TokenCreate = { label?: string; scopes?: string[]; expiresInDays?: number };
export type StatusAction = 'suspend' | 'resume' | 'revoke';

export const operatorApi = {
  list: async (c: CanopiClient) => asPerson(c).request('/v1/agents', { auth: true }),
  create: async (c: CanopiClient, body: AgentCreate) => asPerson(c).request('/v1/agents', { method: 'POST', auth: true, body }),
  show: async (c: CanopiClient, agentId: string) => asPerson(c).request(`/v1/agents/${id(agentId)}`, { auth: true }),
  setStatus: async (c: CanopiClient, agentId: string, action: StatusAction, reason?: string) =>
    asPerson(c).request(`/v1/agents/${id(agentId)}/${action}`, { method: 'POST', auth: true, body: reason ? { reason } : {} }),
  tokens: async (c: CanopiClient, agentId: string) => asPerson(c).request(`/v1/agents/${id(agentId)}/tokens`, { auth: true }),
  createToken: async (c: CanopiClient, agentId: string, body: TokenCreate) =>
    asPerson(c).request(`/v1/agents/${id(agentId)}/tokens`, { method: 'POST', auth: true, body }),
  rotateToken: async (c: CanopiClient, agentId: string, tokenId: string) =>
    asPerson(c).request(`/v1/agents/${id(agentId)}/tokens/${id(tokenId, 'token id')}/rotate`, { method: 'POST', auth: true, body: {} }),
  revokeToken: async (c: CanopiClient, agentId: string, tokenId: string, reason?: string) =>
    asPerson(c).request(`/v1/agents/${id(agentId)}/tokens/${id(tokenId, 'token id')}/revoke`, {
      method: 'POST',
      auth: true,
      body: reason ? { reason } : {},
    }),
  /** The calling agent's identity and scopes (agent token). */
  whoami: (c: CanopiClient) => c.request('/v1/agent-tokens/me', { auth: true }),
};
