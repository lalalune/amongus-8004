import { ethers } from 'ethers';

export type A2ASkill = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
};

export type A2AAgentCard = {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: string;
  skills: A2ASkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
};

export type A2APart = { kind: 'text'; text: string } | { kind: 'data'; data: Record<string, unknown> };
export type A2AMessage = {
  role: 'user' | 'agent';
  parts: A2APart[];
  messageId: string;
  kind: 'message';
  taskId?: string;
  contextId?: string;
};

type JSONRPCResponse<T> = { jsonrpc: '2.0'; id: string | number | null; result?: T; error?: { code: number; message: string; data?: unknown } };

export type StreamHandler = (event: unknown) => void;

export class BrowserA2AClient {
  private serverUrl: string;
  private wallet: ethers.Wallet;
  private handlers: StreamHandler[] = [];
  eventSource: EventSource | null = null;

  constructor(serverUrl: string, privateKey: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.wallet = new ethers.Wallet(privateKey);
  }

  async fetchAgentCard(): Promise<A2AAgentCard> {
    const res = await fetch(`${this.serverUrl}/.well-known/agent-card.json`);
    if (!res.ok) throw new Error(`Failed agent card: ${res.status}`);
    return await res.json();
  }

  onMessage(handler: StreamHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  async send(skillId: string, data: Record<string, unknown> = {}, text?: string): Promise<unknown> {
    const timestamp = Date.now();
    const messageId = crypto.randomUUID();

    const { agentId: _aid, agentAddress: _addr, agentDomain: _dom, playerName: _name, signature: _sig, timestamp: _ts, skillId: _sk, ...skillOnly } = data;

    const signaturePayload = JSON.stringify({ messageId, timestamp, skillId, data: skillOnly });
    const signature = await this.wallet.signMessage(signaturePayload);

    const parts: A2APart[] = [];
    if (text) parts.push({ kind: 'text', text });
    parts.push({ kind: 'data', data: { skillId, signature, timestamp, ...data, agentAddress: this.wallet.address } });

    const body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'message/send',
      params: { message: { role: 'user', parts, messageId, kind: 'message' } as A2AMessage }
    };

    const res = await fetch(`${this.serverUrl}/a2a`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json: JSONRPCResponse<unknown> = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  async stream(skillId: string, data: Record<string, unknown> = {}, text?: string): Promise<void> {
    const timestamp = Date.now();
    const messageId = crypto.randomUUID();
    const { agentId: _aid, agentAddress: _addr, agentDomain: _dom, playerName: _name, signature: _sig, timestamp: _ts, skillId: _sk, ...skillOnly } = data;
    const signaturePayload = JSON.stringify({ messageId, timestamp, skillId, data: skillOnly });
    const signature = await this.wallet.signMessage(signaturePayload);

    const parts: A2APart[] = [];
    if (text) parts.push({ kind: 'text', text });
    parts.push({ kind: 'data', data: { skillId, signature, timestamp, ...data, agentAddress: this.wallet.address } });

    const body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'message/stream',
      params: { message: { role: 'user', parts, messageId, kind: 'message' } as A2AMessage }
    };

    const res = await fetch(`${this.serverUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body)
    });

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split(/\n\n/).map((s) => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        try {
          const evt = JSON.parse(jsonStr);
          for (const h of this.handlers) h(evt.result ?? evt);
        } catch {}
      }
    }
  }
}



