# seed/boot: the state the API restores after a wiped disk

The Hugging Face Space resets its disk on every restart and wake from sleep. When
`SHADOW_BOOT_DIR` points here (the Space image sets `/app/seed/boot`), the API reads this folder
at startup (`apps/api/src/boot.ts`):

| File | What happens at boot |
| --- | --- |
| `workmap.json` | Validated against the `WorkMap` schema (including its evidence checks), then saved and **published**, but only if nothing is published yet. A map published during the current uptime is never replaced. An invalid file is logged as `boot map rejected` and the API starts without it. |
| `recordings/<sessionId>.webm` | Put into object storage under `recordings/<sessionId>.webm`, the key `GET /sessions/:id/recording` reads, unless something is already stored there. The published map's `sourceSessionId` stays replayable even though that session itself is gone. |

## Current contents: SAMPLE, replace before judging

`workmap.json` is a copy of `seed/fixtures/workmap.json` (id `wm_mock_1`, Maya's sample map).
It is **sample data, not a real capture**. It has no `sourceSessionId` and there is no
`recordings/` folder yet, so after a restart `/teach`, `/copilot` and `/map/latest` work from the
sample map, but no expert clip plays.

## Replacing it with the founder's real session

After recording the real Capture → debrief → publish run (steps in `docs/DEPLOY_SPACE.md`,
"Keep the demo map across restarts"):

1. `workmap.json`: the published map, from the Work Map page → **Export** (it downloads
   `<id>-v<version>.json`; rename it to `workmap.json`), or
   `curl -s "$API/workmaps/published" > seed/boot/workmap.json`.
2. `recordings/<sourceSessionId>.webm`: the capture session's recording, named by the map's
   `sourceSessionId`:
   `curl -s "$API/sessions/<sourceSessionId>/recording" -o seed/boot/recordings/<sourceSessionId>.webm`.
3. Commit both and redeploy the Space.
