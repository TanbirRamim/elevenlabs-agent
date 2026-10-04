# Deploying the API to a Hugging Face Space (optional)

> Hugging Face Docker Spaces are now paid, so this path is optional. The free path is Render: `docs/DEPLOY_RENDER.md`.

This guide moves the whole backend (the API plus Presidio) into **one Docker image** on a Hugging Face Space. The web app stays on Cloudflare Workers.

```mermaid
flowchart LR
  B[Browser] -->|HTTPS| V[shadow-web on Cloudflare Workers]
  B -->|HTTPS + WebSocket| S["Hugging Face Space<br/>https://&lt;user&gt;-&lt;space&gt;.hf.space"]
  subgraph S1 [One container, port 7860]
    A[Fastify API :7860] --> P[Presidio analyzer / anonymizer / image redactor<br/>127.0.0.1 only]
  end
  S --> A
  A --> C[(Claude API)]
```

| | |
| --- | --- |
| Cost | free (CPU basic: 2 vCPU, 16 GB RAM) |
| Files | `infra/space/Dockerfile`, `infra/space/start.sh` (process runner), `infra/space/README.md` (Space card), `infra/space/deploy.sh` (bundle + push), `infra/space/smoke.mjs` (check) |
| Public port | 7860 (the API). Presidio listens on 127.0.0.1 and is never reachable from outside. |
| Storage | the container disk is wiped on every restart; the published Work Map and its clips come back from `seed/boot` ([Keep the demo map across restarts](#keep-the-demo-map-across-restarts)); everything else needs [durable storage](#optional-durable-storage) |

## Measured locally

Measured on the founder's Mac (Docker Desktop, arm64). Hugging Face builds and runs on amd64, so expect numbers in the same range, not identical.

| | |
| --- | --- |
| Image size | 2.6 GB unpacked (about 0.8 GB compressed) |
| Image build | about 3.5 min |
| Cold start, real mode (container start → `/health` 200) | 18 s with a warm disk cache (also with `--cpus 2`); 45–66 s on a cold disk (66 s with `--cpus 2` while another build was running). Almost all of it is Presidio loading the spaCy `en_core_web_lg` model (analyzer and image redactor each load it). Hugging Face adds the time to pull the image onto a machine. |
| Cold start, `MOCK_AI=1` | under 7 s (Presidio is not started in fixture mode) |
| Memory, real mode, idle | about 1.7 GB of the 16 GB |
| Memory, `MOCK_AI=1` | about 120 MB |

Checked with the built image: `/health` 200, the session WebSocket (`hello` → `ready`), a transcript segment containing a name, an email and a phone number stored as `<PERSON> at <EMAIL_ADDRESS> or call <PHONE_NUMBER> about the refund.`, the image redactor blanking text in a test JPEG, and the container exiting (so the Space restarts it) when a Presidio process dies.

## 1. Create the Space (one time, about 5 minutes)

1. Sign up or log in at <https://huggingface.co>.
2. Create a write token: avatar (top right) → **Settings** → **Access Tokens** → **Create new token** → token type **Write** → name it `shadow-deploy` → **Create token**. Copy it somewhere safe; you will paste it as the git password in step 2.
3. Create the Space: <https://huggingface.co/new-space>
   - **Owner**: your account. **Space name**: `shadow-api` (any name works; it becomes part of the URL).
   - **License**: leave empty or pick one.
   - **Select the Space SDK**: **Docker** → template **Blank**.
   - **Space hardware**: **CPU basic · 2 vCPU · 16 GB · FREE**.
   - Visibility: **Public**. (A private Space needs a Hugging Face token on every request, which the browser does not have.)
   - Click **Create Space**.
4. Add the settings: on the Space page → **Settings** → **Variables and secrets**.

   Under **Secrets** (**New secret**; values are hidden), add by name:

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the Anthropic key (the same one as in your local `.env`) |

   Under **Variables** (**New variable**; values are visible), add:

   | Name | Value |
   | --- | --- |
   | `WEB_ORIGIN` | `https://shadow-web.tanbirramim420.workers.dev` |
   | `DEMO_FALLBACK_RULES` | `0` |
   | `SHADOW_MODEL` | only if you want a model other than the default `claude-opus-5-5` |

   Not needed on the Space: `ELEVENLABS_*` (only the web app uses them), `DATABASE_URL` (unused), `API_PORT`, `PRESIDIO_*`, `SHADOW_BOOT_DIR` and `GUARD_JUDGE_TIMEOUT_MS` (set inside the image). The image sets `GUARD_JUDGE_TIMEOUT_MS=6000`: how long a save waits for the LLM guard judge before it is let through as `timeout_allow`. The judge takes about 2.7 s at p50 on a good link and longer from a shared free CPU, and a timed-out judge can miss a rule only the judge catches, so 6 s favours catching the rule over a fast save. Override it as a Space variable if needed. Never set `MOCK_AI=1` here; it serves fixture data instead of the real pipeline.

## 2. Push the code (every time you want to update the API)

From an up-to-date checkout of `main`:

```bash
git switch main && git pull
bash infra/space/deploy.sh --push <your-hf-username>/shadow-api
```

When git asks: **Username** = your Hugging Face username, **Password** = the write token from step 1.2.

The script copies only what the image needs (the API, shared packages, seed data and the Dockerfile, all text files) from the last commit into a temporary folder and force-pushes that to the Space. Uncommitted changes and `.env` are never included. The Space's own git history is not kept; every deploy replaces it.

Hugging Face then builds the image (watch it on the Space page → **Logs** → **Build**; expect 5–10 minutes) and starts it. The status badge next to the Space name goes **Building** → **Running**. In **Logs** → **Container** you should see:

```
[space] presidio ready after …s
[space] API starting on 0.0.0.0:7860
… "Server listening at http://…:7860"
```

Web upload instead of git: run `bash infra/space/deploy.sh` (without `--push`). It prints a folder path. On the Space page → **Files** → **+ Contribute** → **Upload files**, drag in everything inside that folder, keeping the folder structure, and commit. The git push is less error-prone.

## 3. Find the Space URL and check it

The API URL is `https://<username>-<space-name>.hf.space`, all lowercase, with `.` and `_` turned into `-`. Example: user `TanbirRamim`, Space `shadow-api` → `https://tanbirramim-shadow-api.hf.space`. You can also copy it from the Space page → **⋮** (top right) → **Embed this Space** → **Direct URL**.

```bash
curl https://<username>-shadow-api.hf.space/health
# {"ok":true,"model":"claude-opus-5-5"}
node infra/space/smoke.mjs https://<username>-shadow-api.hf.space
# ... PASS (health, tickets, session, WebSocket hello -> ready, transcript accepted)
```

## 4. Point the web app at the Space

In the `shadow-web` Worker's build variables, change:

| Name | New value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<username>-shadow-api.hf.space` |
| `NEXT_PUBLIC_API_WS_URL` | `wss://<username>-shadow-api.hf.space` |

Then redeploy the web Worker. These values are baked in at build time, so the redeploy is required. The Space URL never changes, so this is a one-time edit.

Finally open <https://shadow-web.tanbirramim420.workers.dev> and run Capture → Map → Teach once.

## Sleep and cold starts

- Free Spaces go to sleep after a period without traffic (Hugging Face documents this as about **48 hours**; the setting is under **Settings** → **Sleep time**, and on free hardware it cannot be turned off). A sleeping Space wakes on the next visit to its page or URL.
- A wake-up is a full container start: Hugging Face starts the image, then Presidio loads (measured above at 18–66 s), then the API answers. The first judge request after a sleep can therefore take a minute or more, and an API request may fail with a gateway error while the Space shows **Starting**. Restarts after a push or a settings change behave the same.
- To avoid that before a demo or judging window: open `https://<username>-shadow-api.hf.space/health` yourself a few minutes earlier and wait for `{"ok":true,...}`.
- To keep it awake through a judging period, a free uptime monitor (for example UptimeRobot or a scheduled GitHub Action) can request `/health` once every few hours. Whether Hugging Face's terms allow keep-alive pings has not been verified; check before relying on it. With a 48-hour sleep window, one request a day is enough.

## What does not persist, and what fails closed

- **Sessions and Work Maps** live as JSONL on the container disk. They survive API restarts inside the container but are **lost when the Space restarts or wakes from sleep**, unless durable storage is configured below. The exception is the map in `seed/boot`: it is published again at every start ([next section](#keep-the-demo-map-across-restarts)).
- **Screen recordings and redacted frames** go to S3-compatible storage when configured, otherwise to the container disk (`/app/infra/data/objects`). On disk, an uploaded recording replays (with seeking) until the Space restarts; the recordings in `seed/boot/recordings` are put back at every start.
- **Screen frames** are redacted by the bundled Presidio image redactor (tesseract OCR) before anything sees them. If redaction fails or times out, the frame is dropped, never stored or sent to Claude.
- **Transcripts** are redacted by Presidio before they are stored. During the first seconds of a cold start, or if Presidio is down, segments are stored as `[redaction unavailable]` instead of raw text. If Presidio has not answered after 240 s (`PRESIDIO_WAIT_SECONDS`), the API starts anyway with that fail-closed behaviour.

## Keep the demo map across restarts

Judges can open the site at any time, including right after the Space woke up with an empty disk. So the image ships the state they need in `seed/boot` and sets `SHADOW_BOOT_DIR=/app/seed/boot`. At startup the API (`apps/api/src/boot.ts`):

- publishes `seed/boot/workmap.json` if nothing is published yet, after validating it against the `WorkMap` schema and its evidence checks. A map published while the Space is up is never replaced; an invalid file is logged (`boot map rejected`) and the API starts without it;
- puts every `seed/boot/recordings/<sessionId>.webm` into storage under the key `GET /sessions/<sessionId>/recording` serves, unless one is already there. The published map's `sourceSessionId` stays replayable even though the session itself is gone.

The container log shows what was restored, ids only: `boot map published` (`workMapId`) and `boot recordings restored` (`sessionIds`).

Until the real session is recorded, `seed/boot/workmap.json` is the **sample** map (`wm_mock_1`, a copy of `seed/fixtures/workmap.json`), with no recording. To replace it with the founder's real session:

1. Record Capture → debrief → **Publish** against the Space (or a local API) as usual.
2. Export the published map into the repo. Either the Work Map page → **Export** (it downloads `<id>-v<version>.json`; save it as `seed/boot/workmap.json`), or:

   ```bash
   API=https://<username>-shadow-api.hf.space
   curl -fsS "$API/workmaps/published" -o seed/boot/workmap.json
   ```

3. Export the capture recording, named by the map's `sourceSessionId`:

   ```bash
   SID=$(node -p "require('./seed/boot/workmap.json').sourceSessionId")
   mkdir -p seed/boot/recordings
   curl -fsS "$API/sessions/$SID/recording" -o "seed/boot/recordings/$SID.webm"
   ```

   Do this before the Space restarts: without durable storage the recording only lives on the container disk until then.
4. Check the map still validates: `pnpm --filter @shadow/api exec vitest run src/boot.test.ts` covers the loader; for the file itself, start the API locally with `SHADOW_BOOT_DIR=$PWD/seed/boot` (absolute path) and an empty `infra/data/state`, and look for `boot map published` in the log.
5. Commit `seed/boot` and redeploy: `bash infra/space/deploy.sh --push <your-hf-username>/shadow-api`. Hugging Face only accepts binary files through Git LFS, so the push needs `git lfs` installed once a `.webm` is in `seed/boot` (the script stops with a message if it is missing).

After the redeploy, check: `curl $API/workmaps/published` returns the new map id, and `curl -r 0-99 -o /dev/null -w '%{http_code}\n' $API/sessions/$SID/recording` prints `206`.

The tutor plays clips only when the teach page knows the capture session: open it as `/teach?expertSession=<sourceSessionId>`.

## Optional: durable storage

Any S3-compatible bucket works. Cloudflare R2's free tier (10 GB) is enough.

1. Cloudflare dashboard → **R2** → **Create bucket** → name `shadow-frames`.
2. **R2** → **Manage API tokens** → **Create API token**. The API calls `CreateBucket` at boot, so the token needs **Admin Read & Write**. With an object-only token the container log shows `s3 unreachable, storage disabled` and storage stays off. (I have not tested R2 against this image; that log line is how to tell.)
3. Add to the Space: Secrets `S3_ACCESS_KEY`, `S3_SECRET_KEY`; Variables `S3_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`, `S3_BUCKET` = `shadow-frames`.

With storage set, every recording and redacted frame is kept, and sessions and maps are mirrored to the bucket and restored after a restart. A map restored from the bucket counts as published, so `seed/boot/workmap.json` is then only used when the bucket holds none.

## Run the image locally

```bash
docker build -f infra/space/Dockerfile -t shadow-space .
docker run --rm -p 7861:7860 -e WEB_ORIGIN=http://localhost:3000 shadow-space   # real mode, no keys
docker run --rm -p 7861:7860 -e MOCK_AI=1 -e DEMO_FALLBACK_RULES=1 shadow-space  # fixture mode
node infra/space/smoke.mjs http://localhost:7861
```

Add `-e ANTHROPIC_API_KEY=...` (or `--env-file .env`, but then override the `PRESIDIO_*`, `S3_*` and `API_PORT` values, which point at the local Docker setup) to run the full pipeline.
