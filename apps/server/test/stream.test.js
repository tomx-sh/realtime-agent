import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';

// Hold the second chat token until the client actually receives audio.
// A regression to buffering the whole answer will time out this test.
test('streams transcription and first-clause PCM before chat finishes', { timeout: 10000 }, async t => {
  const { promise: heard, resolve: acknowledge } = Promise.withResolvers();
  const phrases = [];
  const ollama = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (req.url === '/api/chat') {
      assert.equal(body.model, 'bonsai-2:2b');
      assert.equal(body.messages.at(-1).content, 'Salut');
      res.write('{"message":{"content":"Bonjour."},"done":false}\n');
      await heard;
      res.end('{"message":{"content":" Ça va ?"},"done":true}\n');
    } else {
      assert.equal(body.model, 'phonon:fr');
      assert.equal(body.response_format, 'pcm');
      phrases.push(body.input);
      res.write(Buffer.from([1]));
      setImmediate(() => res.end(Buffer.from([2,3,4])));
    }
  }).listen(0, '127.0.0.1');
  await once(ollama, 'listening');
  t.after(() => { acknowledge(); ollama.closeAllConnections(); ollama.close(); });
  const mlx = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(mlx, 'listening');
  t.after(() => { for (const peer of mlx.clients) peer.terminate(); mlx.close(); });
  mlx.on('connection', peer => {
    const send = event => peer.send(JSON.stringify(event));
    send({ type: 'session.created' });
    peer.on('message', data => {
      const msg = JSON.parse(data);
      if (msg.type === 'session.update') {
        assert.equal(msg.session.audio.input.format.rate, 16000);
        send({ type: 'session.updated' });
      } else if (msg.type === 'input_audio_buffer.append') {
        assert.equal(Buffer.from(msg.audio, 'base64').length, 640);
        send({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Sal' });
      } else if (msg.type === 'input_audio_buffer.commit') {
        send({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Salut' });
      }
    });
  });
  const child = spawn(process.execPath, [new URL('../server.js', import.meta.url).pathname], {
    env: { ...process.env, PORT: '0', OLLAMA_BASE_URL: 'http://127.0.0.1:' + ollama.address().port,
      VOXTRAL_WS_URL: 'ws://127.0.0.1:' + mlx.address().port }, stdio: ['ignore','pipe','inherit'],
  });
  t.after(() => child.kill());
  const [log] = await once(child.stdout, 'data');
  const client = new WebSocket('ws://127.0.0.1:' + log.toString().match(/(\d+)\s*$/)[1] + '/agent');
  t.after(() => client.terminate());
  const audio = [], events = [];
  client.on('message', (data, binary) => {
    if (binary) { audio.push(data); acknowledge(); return; }
    const event = JSON.parse(data);
    events.push(event);
    if (event.type === 'ready') client.send(Buffer.alloc(640));
    if (event.type === 'transcript.delta') client.send('{"type":"commit"}');
  });
  await once(client, 'close');
  assert.equal(events.at(-1).type, 'done');
  assert.deepEqual(phrases, ['Bonjour.', 'Ça va ?']);
  assert.deepEqual([...Buffer.concat(audio)], [1,2,3,4,1,2,3,4]);
  assert.equal(events.find(e => e.type === 'transcript').text, 'Salut');
});

