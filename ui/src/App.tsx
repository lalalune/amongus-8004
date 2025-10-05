import { useEffect, useRef, useState } from 'react';
import './App.css';
import { BrowserA2AClient, type A2AAgentCard } from './lib/a2aClient';

type AgentState = {
  id: string;
  name: string;
  address: string;
  role?: string;
  phase: string;
  location?: string;
  log: string[];
  connected: boolean;
};

const DEFAULT_SERVER = (import.meta.env['VITE_GAME_SERVER_URL'] as string) || 'http://localhost:3000';

const DEFAULT_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'
];

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

function Panel({
  index,
  server,
  card,
  onLog,
}: {
  index: number;
  server: string;
  card: A2AAgentCard | null;
  onLog: (i: number, msg: string) => void;
}) {
  const [pk, setPk] = usePersistentState(`agent_pk_${index}`, DEFAULT_KEYS[index] || '');
  const [name, setName] = usePersistentState(`agent_name_${index}`, `Player${index + 1}`);
  const [agent, setAgent] = useState<AgentState>({ id: `agent-${index + 1}`, name, address: '', phase: 'disconnected', log: [], connected: false });
  const clientRef = useRef<BrowserA2AClient | null>(null);

  console.log('card', card)

  const connect = async () => {
    try {
      clientRef.current = new BrowserA2AClient(server, pk);
      const card = await clientRef.current.fetchAgentCard();
      onLog(index, `Connected to ${card.name}`);
      clientRef.current.onMessage((evt) => {
        const msg = typeof evt === 'object' ? JSON.stringify(evt) : String(evt);
        onLog(index, msg);
        const meta = (evt as any)?.result?.status?.message?.metadata || (evt as any)?.metadata;
        setAgent((a) => ({
          ...a,
          phase: (evt as any)?.result?.status?.state || a.phase,
          role: meta?.role || a.role,
          location: meta?.location || a.location,
          connected: true,
        }));
      });
      setAgent((a) => ({ ...a, connected: true }));
    } catch (e) {
      onLog(index, `Connect error: ${(e as Error).message}`);
    }
  };

  const join = async () => {
    if (!clientRef.current) return;
    onLog(index, 'Joining lobby...');
    await clientRef.current.stream('join-game', { agentId: agent.id, agentDomain: `${name.toLowerCase()}.amongus8004.local`, playerName: name });
  };

  const status = async () => {
    if (!clientRef.current) return;
    const res = await clientRef.current.send('get-status', { agentId: agent.id });
    onLog(index, `Status: ${JSON.stringify(res)}`);
  };

  const move = async (room: string) => {
    if (!clientRef.current) return;
    onLog(index, `Move to ${room}`);
    await clientRef.current.send('move-to-room', { agentId: agent.id, targetRoom: room }, `move to ${room}`);
  };

  const kill = async (targetId: string) => {
    if (!clientRef.current) return;
    onLog(index, `Kill ${targetId}`);
    await clientRef.current.send('kill-player', { agentId: agent.id, targetId });
  };

  const meeting = async () => {
    if (!clientRef.current) return;
    onLog(index, 'Call meeting');
    await clientRef.current.send('call-meeting', { agentId: agent.id });
  };

  const vote = async (target: string) => {
    if (!clientRef.current) return;
    onLog(index, `Vote ${target}`);
    await clientRef.current.send('vote', { agentId: agent.id, targetId: target });
  };

  const leave = async () => {
    if (!clientRef.current) return;
    onLog(index, 'Leave game');
    await clientRef.current.send('leave-game', { agentId: agent.id });
  };

  return (
    <div className="panel">
      <div className="row">
        <input value={pk} onChange={(e) => setPk(e.target.value)} className="pk" placeholder="private key" />
        <input value={name} onChange={(e) => setName(e.target.value)} className="name" placeholder="name" />
        <button onClick={connect} disabled={agent.connected}>Connect</button>
        <button onClick={join} disabled={!clientRef.current}>Join</button>
        <button onClick={status} disabled={!clientRef.current}>Status</button>
        <button onClick={meeting} disabled={!clientRef.current}>Meeting</button>
        <button onClick={() => vote('skip')} disabled={!clientRef.current}>Vote Skip</button>
        <button onClick={leave} disabled={!clientRef.current}>Leave</button>
      </div>
      <div className="row actions">
        <div>
          <strong>Move:</strong>
          {['upper-hallway','weapons','navigation','electrical','storage','cafeteria'].map((r) => (
            <button key={r} onClick={() => move(r)} disabled={!clientRef.current}>{r}</button>
          ))}
        </div>
        <div>
          <strong>Kill:</strong>
          {['agent-1','agent-2','agent-3','agent-4','agent-5'].filter(id => id !== agent.id).map((t) => (
            <button key={t} onClick={() => kill(t)} disabled={!clientRef.current || agent.role !== 'imposter'}>{t}</button>
          ))}
        </div>
      </div>
      <div className="status">
        <span>Phase: {agent.phase}</span>
        <span>Role: {agent.role || '-'}</span>
        <span>Location: {agent.location || '-'}</span>
      </div>
    </div>
  );
}

function App() {
  const [server, setServer] = usePersistentState('server_url', DEFAULT_SERVER);
  const [card, setCard] = useState<A2AAgentCard | null>(null);
  const [logs, setLogs] = useState<string[][]>([[],[],[],[],[]]);

  const addLog = (i: number, msg: string) => {
    setLogs((prev) => {
      const copy = prev.map((c) => [...c]);
      const logEntry = copy[i];
      if (!logEntry) return prev;
      logEntry.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
      return copy.slice(0,5);
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${server.replace(/\/$/,'')}/.well-known/agent-card.json`);
        if (res.ok) setCard(await res.json());
      } catch {}
    })();
  }, [server]);

  return (
    <div className="app">
      <header>
        <h1>Among Us ERC-8004 - Human Interface</h1>
        <input value={server} onChange={(e) => setServer(e.target.value)} className="server" placeholder="Server URL" />
        <span className="skills">Skills: {card?.skills.length ?? 0}</span>
      </header>
      <main>
        <div className="panes">
          {[0,1,2,3,4].map((i) => (
            <div className="pane" key={i}>
              <Panel index={i} server={server} card={card} onLog={addLog} />
              <pre className="log" title={`Agent ${i+1} Log`}>
                {logs[i]?.slice(0,60).join('\n')}
              </pre>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
