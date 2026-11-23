'use client';
import { useEffect, useRef, useState } from 'react';
import Orb from './orb';
import { turn, type Phase } from './voice';

export default function Studio() {
  const [phase, setPhase] = useState<Phase>('Idle');
  const [transcript, setTranscript] = useState(''), [answer, setAnswer] = useState('');
  const [error, setError] = useState(''), [latency, setLatency] = useState<number>();
  const active = useRef<ReturnType<typeof turn> | null>(null);
  const level = useRef(0);
  useEffect(() => () => active.current?.stop(), []);
  function action() {
    if (phase === 'Listening') return active.current?.commit();
    if (phase !== 'Idle') return active.current?.stop();
    setError(''); setLatency(undefined); setTranscript(''); setAnswer('');
    active.current = turn({ phase: setPhase, transcript: setTranscript, reply: setAnswer,
      error: setError, latency: setLatency, level: value => { level.current = value; } });
    void active.current.start();
  }
  return <main>
    <header><div className="brand"><i className="mark">∿</i> Resonance</div><span className="local"><i/> Local workspace</span></header>
    <div className="heading"><div><small>REALTIME AGENT</small><h1>Voice studio</h1></div><p>French <span>/</span> FR</p></div>
    <div className="console">
      <section className="stage" aria-label="Voice controls">
        <div className="stage-label"><span>VOICE ORB</span><span className="status" role="status"><i/>{phase}</span></div>
        <div className="orb"><Orb phase={phase} level={level}/></div>
        <button onClick={action}><span aria-hidden>{phase === 'Idle' ? '◉' : '■'}</span>
          {phase === 'Idle' ? 'Start talking' : phase === 'Listening' ? 'Send turn' : 'Stop'}</button>
        <p className="hint">{phase === 'Idle' ? 'Microphone off' : phase === 'Listening' ? 'Send when you finish speaking' : phase === 'Connecting' ? 'Preparing microphone and transcription' : phase === 'Thinking' ? 'Generating your reply' : 'Playing the reply'}</p>
        {error && <p role="alert">{error}</p>}
      </section>
      <aside><div className="panel"><small>INFERENCE</small><h2>Voice pipeline</h2>
        {[['01','Transcribe','Voxtral Mini 4B'],['02','Respond','Bonsai 2 · 2B'],['03','Speak','Phonon · FR']].map(([n,verb,model])=><div className="model" key={n}><b>{n}</b><div><strong>{verb}</strong><p>{model}</p></div></div>)}
        <div className="metric">First audio <strong>{latency === undefined ? '—' : latency + ' ms'}</strong></div></div>
        <div className="panel transcript"><small>LIVE TEXT</small><h2>Current turn</h2><label>You</label><p>{transcript || 'Waiting for speech…'}</p><label>Agent</label><p>{answer || 'Waiting for a reply…'}</p></div>
      </aside>
    </div>
  </main>;
}

