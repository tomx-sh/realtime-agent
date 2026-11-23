import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

const host = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

async function request(path, body, signal) {
  const response = await fetch(new URL(path, host), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  });
  if (!response.ok) throw new Error('Ollama ' + response.status + ': ' + (await response.text()).slice(0, 300));
  return response.body;
}

export async function* chat(text, signal) {
  const body = await request('/api/chat', {
    model: 'bonsai-2:2b', stream: true, keep_alive: '15m', options: { num_predict: 180 },
    messages: [
      { role: 'system', content: 'Réponds en français parlé, brièvement, sans Markdown.' },
      { role: 'user', content: text },
    ],
  }, signal);
  const lines = createInterface({ input: Readable.fromWeb(body), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.error) throw new Error(event.error);
    if (event.message?.content) yield event.message.content;
    if (event.done) return;
  }
  throw new Error('Bonsai stopped before finishing its reply.');
}

export async function speak(text, signal, send) {
  const stream = await request('/v1/audio/speech', {
    model: 'phonon:fr', voice: 'default', input: text, response_format: 'pcm',
  }, signal);
  // HTTP chunks can split a 16-bit sample between two reads.
  let tail = Buffer.alloc(0);
  for await (const chunk of stream) {
    const bytes = Buffer.concat([tail, chunk]);
    const end = bytes.length - bytes.length % 2;
    if (end) await send(bytes.subarray(0, end));
    tail = bytes.subarray(end);
  }
  if (tail.length) throw new Error('Truncated Phonon audio.');
}

export async function reply(text, controller, emit, sendAudio) {
  let buffer = '';
  let speech = Promise.resolve();
  function enqueue(phrase) {
    if (!phrase.trim()) return;
    speech = speech.then(() => speak(phrase.trim(), controller.signal, sendAudio));
    speech.catch(error => controller.abort(error));
  }
  for await (const token of chat(text, controller.signal)) {
    emit({ type: 'reply.delta', text: token });
    buffer += token;
    // A short first clause can start playing while Bonsai writes the rest.
    for (;;) {
      const match = /[.!?…;:\n]|[,，](?=\s|$)/u.exec(buffer);
      let cut = match ? match.index + 1 : 0;
      if (!cut && buffer.length >= 96) cut = buffer.lastIndexOf(' ', 96) + 1 || 96;
      if (!cut) break;
      enqueue(buffer.slice(0, cut));
      buffer = buffer.slice(cut);
    }
  }
  enqueue(buffer);
  await speech;
}

