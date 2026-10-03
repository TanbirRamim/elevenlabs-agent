# Demo walkthrough (≈ 8 minutes)

**Roles:** an expert ("Maya", senior support lead) and a new hire ("Jonas"). Anyone can play either role, including someone who hasn't seen the product before. The insight panel runs on a second screen.

**Setup:** production URL in a browser profile with microphone and screen permissions granted, `DEMO_FALLBACK_RULES=0`, the Tutor agent's knowledge base holding the newly published map.

---

## 1. The problem (30 s)

Maya has triaged escalations for nine years. She knows which refunds are fraud, which tickets go to Legal, and when to stop and ask. None of it is written down. Jonas started this week. Shadow learns from Maya and teaches Jonas.

## 2. Capture (2:30) · `/capture`, sharing the current tab

Maya works the expert queue and thinks aloud as she normally would.

| Ticket | Typical decision | What Shadow does |
| --- | --- | --- |
| T1 invoice request | Reply | Stays quiet |
| T2 €49 duplicate charge | Refund | Stays quiet, or asks about a refund limit |
| T3 €240 refund, open chargeback | Handoff to Billing disputes | At the next pause, asks why she didn't refund (a guardrail question) |
| T4 "someone changed my email" + refund | Handoff to Security | At the next pause, asks why Security instead of a refund |

At any point Maya can say "off the record", speak freely, then "back on the record". The timeline shows a grey gap; nothing from that span is stored.

The insight panel shows, for each question, the pause that allowed it and the gap it was meant to fill.

## 3. Map (2:00)

1. Maya clicks **End task**. The coverage meter shows what is still unclear.
2. Shadow runs the debrief: at least three questions it did not ask live, including cases it never saw (fraud, legal and privacy requests).
3. Shadow explains the whole process back. Maya corrects anything that's wrong; Shadow repeats the correction and asks again until she confirms.
4. The Work Map: each step opens its screen moment, the decision, Maya's own words with a timestamp, and the guardrails around it.

## 4. Teach (2:00) · `/teach`

1. Jonas opens **N1**, a ticket Maya never handled: a €180 refund request that also says the card was used without permission.
2. Shadow asks him to predict the decision.
3. If he clicks **Refund**, the save is paused before it happens. Shadow asks why Maya would stop here, then explains with her words and replays her screen moment.
4. Jonas routes the ticket correctly and moves on to N2 (a GDPR request).
5. The mastery report shows what he handled alone, what needed help, and what to practise next.

## 5. Where this goes (1:00)

People first, then agents. The Work Map that taught Jonas is also a policy an AI agent can follow: the same steps, the same stops, judgment calls handed to a human. Today it's one expert and one workflow; next, every expert's judgment kept current as a shared memory for a company's people and its agents.

---

## The five Apprentice Test questions

1. **When to ask:** a deterministic gate on silence, typing, screen motion, gap value and a question budget. The model decides how to ask, never when.
2. **What to ask:** gaps ranked by value and surprise; anything the screen already answers is dropped.
3. **When it has understood:** coverage ≥ 90 %, no high-priority gaps left, a confirmed teach-back, and correct predictions on new variants.
4. **Whether the new hire learned:** an unseen case, predict-then-act, a guard on every save, and the mastery report.
5. **Trust:** off the record by voice, hotkey or button, with nothing stored for that span; personal data redacted before storage and before any model sees it; the expert can delete anything before publishing.

## Fallbacks

| Situation | Response |
| --- | --- |
| Shadow waits longer than expected | It only speaks at real pauses; pause briefly |
| Vision events lag | DeskSim's DOM events keep timing exact; vision catches up |
| Network failure | Phone hotspot; otherwise a backup video, introduced as a recording |
