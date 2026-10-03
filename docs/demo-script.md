# Demo script (≈ 8 minutes)

**Cast:** Dev A plays **Maya** (senior support lead, the expert). Dev B plays **Jonas** (new hire) and drives the judge panel on a second screen. A judge may replace either of you; the script still works.

**Setup:** prod URL open in the demo browser profile, mic and screen permissions granted, `DEMO_FALLBACK_RULES=0`, judge panel on screen 2, backup video ready.

---

## 0:00 Problem (30 s), Dev A

> "Maya has triaged escalations for nine years. She knows which refunds are fraud, which tickets go to Legal, and when to stop and ask. None of it is written down. Jonas started on Monday. Shadow is the apprentice that learns from Maya and teaches Jonas."

## 0:30 Capture (2:30), Maya on `/capture`, sharing the DeskSim tab

| Ticket | Maya does | Maya says (think aloud) | Expected from Shadow |
| --- | --- | --- | --- |
| T1 invoice | Reply | "Easy one, resend the invoice." | Quiet |
| T2 €49 duplicate | Refund | "Duplicate charge, under a hundred, I just refund." | Quiet, or a limit question: "Is there an amount where you wouldn't just refund?" |
| T3 €240, chargeback tag | Handoff → Billing disputes | (silent, then pauses) | **Guardrail question:** "You didn't refund T3. Was it the chargeback?" → "Never refund with an open chargeback, we'd pay twice." |
| T4 email changed | Handoff → Security | "Hmm." (pause) | "Why Security and not a refund on T4?" → "Someone changed his email: that's a takeover. No refund, no account details, Security first." |

Mid-way, Maya says **"off the record"**, makes a remark about a colleague, then **"back on the record"**. Point at the grey gap on the timeline.

Dev B on the judge panel: *"Every question opened only after silence and no typing. Here's the gate's reason for each."*

## 3:00 Map (2:00)

1. Maya clicks **End task**. Coverage shows ~60 %.
2. Debrief (≥ 3 questions not asked live), for example:
   - "Is €100 the refund limit for every plan, and who approves above it?"
   - **Unseen case:** "I didn't see any fraud cases. What if a customer says their card was used without permission?" → "Never refund that. It goes to Security first."
   - "What if a customer mentions a lawyer or asks to delete their data?" → "Legal. Stop replying."
3. Teach-back is read aloud. **Maya corrects one detail** on purpose ("Above €100 it needs approval, it's not forbidden"). Shadow repeats the fix → Maya: "Yes, that's how it works." → **Confirmed** badge.
4. Click through the Work Map: step → frame → clip → quote with timestamp → guardrail.

## 5:00 Teach (2:00), Jonas on `/teach`

1. Jonas opens **N1** (€180 + "card used without my permission"). Shadow (PREDICT): "What would you do here?" Jonas: "Refund, I guess."
2. Jonas clicks **Refund** → **"Paused by Shadow"**.
3. Shadow: "Maya would stop here. Why do you think?" Jonas: "…the card thing?" Shadow quotes Maya and replays her clip.
4. Jonas routes to Security → saved. Opens N2 (GDPR) → routes to Legal unaided.
5. Mastery report: N1 fraud guardrail *assisted*, GDPR *independent*, practice next: fraud signals.

## 7:00 Moonshot (1:00), Dev A, one slide

> "People first, then agents. The Work Map that taught Jonas is also a policy an AI agent can follow: same steps, same stops, judgment calls handed to a human. Today: one expert, one workflow. Next: every expert's judgment as a living memory the company's people and agents both learn from."

If the Copilot export is built: show its agreement on the 10 held-out tickets.

---

## Apprentice Test answers (memorize)

1. **When to ask:** a deterministic gate on silence, typing, screen motion, value and budget. The LLM decides how, never when.
2. **What to ask:** gaps ranked by value and surprise; anything the screen already answers is dropped.
3. **When it has understood:** coverage ≥ 90 %, no high-priority gaps, a confirmed teach-back, two correct predictions.
4. **New hire learned:** an unseen case, predict-then-act, a guard on every save, the mastery report.
5. **Trust:** off the record by voice, hotkey or button, and nothing stored for that span; PII redacted before storage and before any model; the expert can delete anything before publishing.

## If something breaks

| Failure | Say | Do |
| --- | --- | --- |
| Agent silent too long | "It waits for real pauses." | Pause longer; stop typing |
| Vision lag | "DOM events keep timing exact; vision catches up." | Continue |
| Network | — | Hotspot; else the backup video, introduced as a recording |
