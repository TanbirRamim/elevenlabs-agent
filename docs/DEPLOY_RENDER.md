# Deploying the API to Render (free)

Hugging Face Docker Spaces are now paid, so `docs/DEPLOY_SPACE.md` is optional. This guide runs the
whole backend (Fastify API plus Presidio) on Render's **free Docker web service**. The web app
stays on Vercel.

| | |
| --- | --- |
| Cost | free: 512 MB RAM, 0.1 CPU, sleeps after 15 min without traffic |
| Files | `render.yaml` (Blueprint), `infra/render/Dockerfile`, `infra/render/start.sh` (process runner), `infra/render/presidio_shim.py` (one-process Presidio) |
| Public port | Render's `$PORT` (10000 by default); `start.sh` maps it to `API_PORT`. Presidio listens on 127.0.0.1:5101 only. |
| Storage | ephemeral: wiped on every sleep, restart and deploy. The published Work Map comes back from `seed/boot` (`SHADOW_BOOT_DIR=/app/seed/boot`); sessions do not, unless `S3_*` points at durable storage. |

## How it fits in 512 MB

The Space image (`infra/space/Dockerfile`) runs three Presidio processes with spaCy
`en_core_web_lg` and idles at about 1.7 GB. The Render image instead:

- runs **one** Python process (`presidio_shim.py`, gunicorn, 1 worker, 4 threads) serving
  `/analyze`, `/anonymize` and `/redact` with the same request and response shapes as Microsoft's
  REST apps, so the API needs no change (all three `PRESIDIO_*_URL` point at `127.0.0.1:5101`);
- loads spaCy **`en_core_web_sm`** once and shares the analyzer between text and image redaction;
- imports the image redactor (opencv-headless, tesseract) lazily on the first frame;
- starts the API first and Presidio only once the API's port is open, so Render sees the port
  quickly even at 0.1 CPU.

Until Presidio answers, redaction **fails closed**: transcript text is stored as
`[redaction unavailable]` and frames are dropped (`apps/api/src/privacy/presidio*.ts`,
`apps/api/src/pipeline/frames.ts`). Nothing unredacted is stored or sent to Claude.

## Measured locally

Docker Desktop on the founder's Mac (arm64, native build), `docker run -m 512m --memory-swap 512m`.
Render runs amd64; expect the same range, not identical numbers.

| | `--cpus 0.5` | `--cpus 0.1` (Render free) |
| --- | --- | --- |
| Image size | 1.5 GB | |
| Container start → API `/health` 200 | 23 s (measured with an earlier start.sh that waited for Presidio first) | 57 s |
| Container start → Presidio ready | 19 s | 176 s |
| Memory idle (API + Presidio) | 255 MiB (Python 239 MiB, Node 84 MiB RSS) | 189 MiB |
| Memory after text and image redaction | 287 MiB | 263 MiB; cgroup peak 331 MiB |
| `infra/space/smoke.mjs` (health, tickets, session, WebSocket hello → ready, transcript) | PASS, 1.6 s | PASS, 2.4 s |
| Transcript `Email Jane Doe at jane.doe@example.com or call 212-555-0187 about the refund.` stored as | `<PERSON> at <EMAIL_ADDRESS> or call <PHONE_NUMBER> about the refund.` | same |
| Image redaction, 1280×720 JPEG with a name, email and phone | 3.0 s first, 0.5 s after (800×200) | 55 s first (lazy import), then 8–9 s |

What this means for the demo on the free tier:

- **Cold start**: after 15 idle minutes Render sleeps the service. The first request then waits
  for the container (about 1 min to `/health`), and redaction fails closed for about 3 more
  minutes while spaCy loads. Open the API URL a few minutes before a demo.
- **Text**: en_core_web_sm is less precise than lg. It caught the name, email and phone above,
  but swallowed the word "Email" into the `<PERSON>` span. The API's own email regex still
  runs on every result.
- **Frames**: at 0.1 CPU a frame takes 8–9 s of OCR (the first one about a minute), longer than
  most frame intervals; frames over the API's 15 s timeout are dropped (fail closed), and OCR
  slows the rest of the API while it runs. Set `SHADOW_IMAGE_REDACTOR=0` to switch the image
  redactor off: `/redact` then answers 503, every frame is dropped, and Claude vision sees no
  frames while transcripts and guard checks keep working.

## Deploy (about 10 minutes)

1. Sign up or log in at <https://dashboard.render.com> with GitHub.
2. **New → Blueprint**, connect `TanbirRamim/elevenlabs-agent`, branch `main`. Render reads
   `render.yaml` and proposes one free web service, `shadow-api`.
3. When asked for `ANTHROPIC_API_KEY` (marked `sync: false`), paste the key. It is stored in
   Render only, never in the repo. Add `ELEVENLABS_API_KEY`,
   `ELEVENLABS_INTERVIEWER_AGENT_ID` and `ELEVENLABS_TUTOR_AGENT_ID` the same way under
   **Environment** if the voice agents are used.
4. **Apply**. The first build takes several minutes. When the deploy is live, note the URL,
   `https://shadow-api-<suffix>.onrender.com`.
5. Check it: `node infra/space/smoke.mjs https://shadow-api-<suffix>.onrender.com` must print
   `PASS`. Wait about 3 minutes after a cold start before expecting redacted (not
   `[redaction unavailable]`) transcripts.
6. Point the web app at it: in Vercel set `NEXT_PUBLIC_API_URL=https://shadow-api-<suffix>.onrender.com`
   and `NEXT_PUBLIC_API_WS_URL=wss://shadow-api-<suffix>.onrender.com` (`apps/web/src/env.ts`;
   inlined at build time), then redeploy the web app.

`autoDeploy` is off in the Blueprint: redeploy with **Manual Deploy → Deploy latest commit**.

Without the Blueprint: **New → Web Service**, the repo, runtime **Docker**, Dockerfile path
`infra/render/Dockerfile`, build context `.`, instance type **Free**, health check path `/health`,
then the environment variables from `render.yaml`.

## Build and check locally

```bash
docker build -f infra/render/Dockerfile -t shadow-render .
docker run --rm -m 512m --memory-swap 512m --cpus 0.1 -p 7891:10000 \
  -e PORT=10000 -e ANTHROPIC_API_KEY shadow-render
node infra/space/smoke.mjs http://localhost:7891
```
