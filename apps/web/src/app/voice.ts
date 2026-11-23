type Phase = 'Idle' | 'Connecting' | 'Listening' | 'Thinking' | 'Speaking';
export type { Phase };
type View = {
  phase: (phase: Phase) => void;
  transcript: (s: string) => void;
  reply: (s: string) => void;
  error: (s: string) => void;
  latency: (ms: number) => void;
  level: (value: number) => void;
};

export function turn(view: View) {
  let socket: WebSocket | undefined;
  let capture: AudioContext | undefined;
  let output: AudioContext | undefined;
  let mic: MediaStream | undefined;
  let worklet: AudioWorkletNode | undefined;
  let stopped = false;
  let complete = false;
  let nextSample = 0;
  let committed = 0;
  let heard = false;
  let text = '', answer = '';
  let drainTimer: ReturnType<typeof setTimeout>;
  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(drainTimer);
    socket?.close();
    mic?.getTracks().forEach(track => track.stop());
    if (capture && capture.state !== 'closed') void capture.close();
    if (output && output.state !== 'closed') void output.close();
    view.level(0);
    view.phase('Idle');
  }
  function fail(error: unknown) {
    if (stopped) return;
    view.error(error instanceof Error ? error.message : String(error));
    stop();
  }
  function play(bytes: ArrayBuffer) {
    if (!output || !bytes.byteLength) return;
    const pcm = new Int16Array(bytes);
    const buffer = output.createBuffer(1, pcm.length, 24000);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
    const node = output.createBufferSource();
    node.buffer = buffer;
    node.connect(output.destination);
    nextSample = Math.max(output.currentTime + 0.015, nextSample);
    node.start(nextSample);
    if (!heard) {
      heard = true;
      view.latency(Math.round(performance.now() - committed + (nextSample - output.currentTime) * 1000));
      view.phase('Speaking');
    }
    nextSample += buffer.duration;
  }
  async function start() {
    try {
      view.phase('Connecting');
      capture = new AudioContext({ sampleRate: 16000 });
      output = new AudioContext({ latencyHint: 'interactive' });
      await Promise.all([output.resume(), capture.resume(), capture.audioWorklet.addModule('/capture.js')]);
      if (stopped) return;
      mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      if (stopped) { mic.getTracks().forEach(t => t.stop()); return; }
      const source = capture.createMediaStreamSource(mic);
      worklet = new AudioWorkletNode(capture, 'microphone', { numberOfOutputs: 0 });
      worklet.port.onmessage = ({ data }) => {
        if (stopped || socket?.readyState !== WebSocket.OPEN) return;
        if (data === 'flushed') {
          mic?.getTracks().forEach(t => t.stop());
          socket.send(JSON.stringify({ type: 'commit' }));
        } else {
          if (socket.bufferedAmount > 1048576) return fail('Audio connection fell behind. Try again.');
          socket.send(data);
          const pcm = new Int16Array(data);
          let sum = 0;
          for (const sample of pcm) sum += (sample / 32768) ** 2;
          view.level(Math.min(1, Math.sqrt(sum / pcm.length) * 6));
        }
      };
      socket = new WebSocket('ws://127.0.0.1:8787/agent');
      socket.binaryType = 'arraybuffer';
      socket.onerror = () => fail('Cannot reach the voice server on port 8787.');
      socket.onclose = () => { if (!complete && !stopped) fail('Connection ended before the turn finished.'); };
      socket.onmessage = ({ data }) => {
        if (stopped) return;
        try {
          if (data instanceof ArrayBuffer) return play(data);
          const e = JSON.parse(data);
          if (e.type === 'ready') { source.connect(worklet!); view.phase('Listening'); }
          if (e.type === 'transcript.delta') view.transcript(text += e.text);
          if (e.type === 'transcript') view.transcript(e.text);
          if (e.type === 'reply.delta') view.reply(answer += e.text);
          if (e.type === 'error') fail(e.text);
          if (e.type === 'done') {
            complete = true;
            drainTimer = setTimeout(stop, Math.max(0, nextSample - output!.currentTime) * 1000 + 50);
          }
        } catch (e) { fail(e); }
      };
    } catch (e) { fail(e); }
  }
  return { start, stop, commit() {
    committed = performance.now();
    view.phase('Thinking');
    worklet?.port.postMessage('flush');
  } };
}

