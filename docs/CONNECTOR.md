# The Shadow connector

Shadow works on top of any company's support tool. Most of it needs no integration:

- **Capture** needs nothing from the tool. The expert shares their screen and talks; Shadow
  watches the frames and listens. Any helpdesk works as it is.
- **Teach** needs one hook: the **Shadow connector**. Watching a screen can never stop a save,
  because by the time a frame shows the click, the refund has gone out. Only a call made
  *before* the tool commits can hold it. It works like Stripe Radar's check before a charge: one
  call, one verdict, and the tool decides what to do with it.

In this repo, DeskSim plays the company's tool and `/teach` is its host. The host's
`preSave` calls the connector (`apps/web/src/lib/connector/index.ts`).

## One call before commit

```ts
import { shadow } from "@/lib/connector";

const verdict = await shadow.check(action, { sessionId });
if (verdict.warning) showBanner(verdict.warning); // fail-open: saved without a check
if (verdict.decision === "BLOCK") return holdTheSave(verdict); // don't commit
commit(action); // ALLOW, WARN, REQUIRE_APPROVAL
```

`createShadowConnector({ transport, timeoutMs })` builds a connector with a different transport or
timeout (the tests use a fake transport).

## Request

`POST /guard/presave` on the Shadow API. The body is a `PendingAction`
(`packages/schema/src/guard.ts`):

```json
{
  "ticket": {
    "id": "N1",
    "subject": "Refund 180 EUR please",
    "body": "…",
    "customer": { "name": "…", "email": "…", "plan": "annual", "vip": false, "accountAgeDays": 60 },
    "amountEur": 180,
    "tags": ["billing"]
  },
  "outcome": "refund",
  "amountEur": 180
}
```

`outcome` is one of the `Outcome` values (`reply`, `refund`, `handoff_security`, …). The optional
header `x-shadow-session: <sessionId>` (or `?sessionId=`) links the verdict to a teach session, so
it counts in the mastery report. A body that fails validation gets `400 { code: "invalid_action" }`.

## Response

A `GuardVerdict`:

```json
{ "decision": "BLOCK", "ruleIds": ["G4", "G1"], "expectedOutcome": "handoff_security", "source": "machine_rule" }
```

| `decision` | What the tool does |
| --- | --- |
| `ALLOW` | Commit. |
| `WARN` | Commit; the host may show a note. |
| `REQUIRE_APPROVAL` | Commit and request a lead's approval. |
| `BLOCK` | Don't commit. Show "Paused by Shadow" with the rule; let the user pick another action, which is checked again. `expectedOutcome` is the route the expert takes. |

`source` says who decided: `machine_rule`, `llm_judge`, or `timeout_allow` (the server's judge ran
out of time and allowed it).

## Fail-open, with a warning

A support desk must never freeze because Shadow is down. If the API does not answer within
6 s (`DEFAULT_CHECK_TIMEOUT_MS`, which covers the server judge's own timeout plus the network) or
the request fails, `check` returns `ALLOW` with `source: "timeout_allow"` and a `warning`. The
same `warning` is set when the server itself answered `timeout_allow`. The host must show it, so
nobody believes an unchecked save was checked; `/teach` shows "Saved without a guard check".

## Wiring it into a helpdesk

The hook goes wherever the tool commits a ticket action, before the write:

- **Zendesk, Freshdesk and similar**: their app frameworks let an app run code when an agent
  saves or updates a ticket and, in some cases, cancel it (Zendesk's ZAF `ticket.save` hook, for
  example). Call `/guard/presave` there and cancel on `BLOCK`. Check the vendor's docs for which
  events can be intercepted; where none can, put the check in a custom action button that calls
  the vendor API only after an allowed verdict.
- **An internal tool**: call `shadow.check(action)` (or the HTTP endpoint) in the save handler, on
  the client before submit or, safer, on the server before the database write.

Map the tool's ticket to `PendingAction` (id, subject, body, customer, amount, tags) and
its action to an `Outcome`. Nothing else in the tool changes.
