import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { chat, reply, speak } from './ollama.js';

const port = Number(process.env.PORT || 8787);
const server = http.createServer((req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'realtime-agent' }));
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if ((origin && !/^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(origin)) ||
      !['/agent', '/transcribe', '/chat', '/speech'].includes(req.url)) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, ws => session(ws, req.url));
});

function session(client, route) {
  const controller = new AbortController();
  let recognizer;
  let state = 'connecting';
  const emit = event => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event));
  };
  function fail(error) {
    if (state === 'closed') return;
    state = 'closed';
    emit({ type: 'error', text: error.message || 'Model request failed.' });
    controller.abort(error);
    client.close(1011);
    recognizer?.terminate();
  }
  const timeout = setTimeout(() => fail(new Error('Turn timed out. Start a new turn.')), 300000);
  client.on('error', fail);
  client.on('close', () => {
    state = 'closed';
    clearTimeout(timeout);
    controller.abort();
    recognizer?.terminate();
  });
  const sendAudio = bytes => new Promise((resolve, reject) => {
    client.send(bytes, error => error ? reject(error) : resolve());
  });
  async function finish(text) {
    state = 'replying';
    recognizer?.close();
    if (text.trim()) {
      if (route === '/agent') await reply(text, controller, emit, sendAudio);
      if (route === '/speech') await speak(text, controller.signal, sendAudio);
      if (route === '/chat') {
        for await (const token of chat(text, controller.signal)) emit({ type: 'reply.delta', text: token });
      }
    }
    emit({ type: 'done' });
    client.close(1000);
  }
  function ready() {
    state = 'ready';
    emit({ type: 'ready' });
  }
  client.on('message', (data, binary) => {
    try {
      if (state !== 'ready') throw new Error('Unexpected input for this turn.');
      if (!recognizer) {
        const text = JSON.parse(data).text;
        if (binary || typeof text !== 'string' || text.length > 4096) throw new Error('Expected up to 4096 characters.');
        finish(text).catch(fail);
      } else if (binary) {
        if (data.length % 2 || recognizer.bufferedAmount > 1048576) throw new Error('Invalid or delayed audio.');
        recognizer.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.toString('base64') }));
      } else {
        if (JSON.parse(data).type !== 'commit') throw new Error('Expected commit.');
        state = 'finishing';
        recognizer.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      }
    } catch (error) { fail(error); }
  });
  if (route === '/chat' || route === '/speech') return ready();

  recognizer = new WebSocket(process.env.VOXTRAL_WS_URL || 'ws://127.0.0.1:8000/v1/realtime', { handshakeTimeout: 15000 });
  recognizer.on('error', e => fail(new Error('Voxtral: ' + e.message)));
  recognizer.on('close', () => {
    if (state !== 'replying' && state !== 'closed') fail(new Error('Voxtral disconnected.'));
  });
  recognizer.on('message', raw => {
    try {
      const e = JSON.parse(raw);
      switch (e.type) {
        case 'session.created':
          recognizer.send(JSON.stringify({ type: 'session.update', session: {
            audio: { input: { format: { type: 'audio/pcm', rate: 16000 }, turn_detection: null } },
          } }));
          break;
        case 'session.updated': ready(); break;
        case 'conversation.item.input_audio_transcription.delta': emit({ type: 'transcript.delta', text: e.delta }); break;
        case 'conversation.item.input_audio_transcription.completed':
          emit({ type: 'transcript', text: e.transcript });
          finish(e.transcript).catch(fail);
          break;
        case 'error': fail(new Error('Voxtral: ' + (e.error?.message || e.message || 'transcription failed'))); break;
      }
    } catch (error) { fail(error); }
  });
}
server.listen(port, '127.0.0.1', () => console.log('Voice server listening on ' + server.address().port));

