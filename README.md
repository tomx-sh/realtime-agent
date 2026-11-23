# Realtime Agent

A local French voice studio for Apple Silicon. Voxtral Mini 4B Realtime transcribes the microphone, Bonsai 2 generates a short French reply, and Phonon speaks it. Each turn is independent.

## Run on your Mac

Install a current Apple Silicon build of Ollama (Phonon requires at least 0.40.9), Node.js 22.12+, Bun 1.3.11, uv, and Git. Open Ollama or run `ollama serve`. From the repository root, run:

```sh
bun install --frozen-lockfile
bun run models:pull
bun run models:voxtral
```

Leave Voxtral running. Its launcher uses uv to install Python 3.12 and a pinned MLX Audio server. The server loads the 4-bit Voxtral checkpoint on the first connection. Allow time and network access for that initial download. If your Python build reports a missing PortAudio library, install it with `brew install portaudio` and restart Voxtral.

In a second terminal, from the same folder:

```sh
bun run dev
```

Open [the studio](http://127.0.0.1:3000), select **Start talking**, allow microphone access, and wait for **Listening**. Speak and select **Send turn**. **Stop** cancels an in-progress response and clears scheduled playback. The first-audio reading estimates the time from sending the turn until the browser schedules the first sample. Cold model loads and audio device latency affect what you hear.

## Streaming

The audio worklet captures mono signed 16-bit PCM at 16 kHz and sends 320 samples every 20 ms. The Node server forwards audio to the MLX realtime WebSocket, relays partial transcripts, and commits immediately when the user sends the turn. The Voxtral launcher requests a 480 ms transcription delay. You can increase it for more context.

Once the transcript is final, Bonsai streams tokens over Ollama's chat endpoint. Complete clauses enter an ordered speech queue while generation continues. Phonon streams mono 24 kHz PCM to the browser, where Web Audio schedules each chunk on the same timeline. The orb reacts to microphone level and playback state. Closing the browser socket cancels upstream requests.

## Use the server directly

Connect to one WebSocket per turn on `ws://127.0.0.1:8787`. Wait for the JSON `ready` event before sending input.

| Path | Input | Streaming results |
| --- | --- | --- |
| `/agent` | Binary 16 kHz mono PCM16LE frames, then `{"type":"commit"}` | Transcript events, reply text, binary 24 kHz mono PCM16LE |
| `/transcribe` | Same audio frames and commit | Partial and final transcript |
| `/chat` | One JSON message with a `text` string | Bonsai text deltas |
| `/speech` | One JSON message with a `text` string | Phonon PCM frames |

Text events carry a `type` and a `text` field (`transcript.delta`, `transcript`, `reply.delta`, or `error`). A successful turn ends with `{"type":"done"}` and socket closure. `GET /health` checks the gateway process. The web app and gateway bind to loopback. To point the gateway at your own model hosts, put `OLLAMA_BASE_URL` or `VOXTRAL_WS_URL` in a root `.env` file. Defaults are `http://127.0.0.1:11434` and `ws://127.0.0.1:8000/v1/realtime`.

## Development

The Bun workspace contains the gateway in `apps/server` and the Next.js TypeScript client in `apps/web/src/app`. React Compiler is enabled. The Canvas orb and its animation live in `orb.tsx`. The UI uses local assets, Next.js telemetry is disabled, and there is no Vercel deployment, analytics SDK, or linter.

Run `bun run build` for the production build and strict TypeScript check. Run `bun run test` for the loopback streaming integration test. It uses simulated model servers and requires the gateway to deliver audio before the simulated language model can finish its answer.

Model details and licenses: [Voxtral Mini 4B Realtime](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602), [MLX Audio streaming](https://neywa-labs.github.io/mlx-audio/guides/web-ui-api-server/), [Bonsai](https://ollama.com/library/bonsai-2:2b), and [French Phonon](https://ollama.com/library/phonon:fr). The French Phonon checkpoint has a noncommercial license.

