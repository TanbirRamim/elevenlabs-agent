# Shadow — the AI Apprentice for Support Escalations

**Product plan** (why and what). The *how* and *when* live in `docs/IMPLEMENTATION_PLAN.md`, which wins on any conflict. · Hack-Nation × ElevenLabs, 7th Global AI Hackathon, Challenge 01 "The AI Apprentice" · as of 2026-10-03

> **One-line pitch:** Shadow sits beside your best support lead while they triage tickets, asks *why* at the right moments, turns their judgment into a Work Map of steps and guardrails, then coaches every new agent — and, later, your AI agents — to decide the way they would.

---


## 1. What the brief actually asks for

The brief (`docs/challenge-brief.pdf`) is Challenge 01 of the Hack-Nation × ElevenLabs hackathon. It asks for a working end-to-end MVP that **captures** an expert's judgment while they work, **maps** it into a clickable Work Map, and **teaches** it to a new hire through a voice tutor. "Support escalations" is one of four use cases the brief names explicitly, so our idea is in scope.

**The caveat that shapes everything.** The brief says *"an apprentice, not a recorder"* and *"an automation tool copies the clicks."* A service that just reads a ticket and decides reply / refund / escalate is exactly the automation tool it warns against. So our product **learns** the triage judgment from a senior support lead and **teaches** it to a new agent. The auto-decide idea survives as the stretch goal "agent-ready guardrails" (Section 2).

### Hard requirements (pass/fail in the demo)

| Module | What must happen live | Our proof point |
| --- | --- | --- |
| 1. Capture | Agent asks **≥ 3 questions** during a real task, each at a natural pause, each about something visible on screen; **≥ 1 about a guardrail** | Expert triages 4 tickets; agent asks e.g. *"You sent that one to Security instead of refunding. What tipped it?"* |
| 2. Map | Debrief asks **≥ 3 follow-ups** not answered during the task; ends with a **teach-back the expert confirms**; every step and guardrail links to a **screen moment** and the **expert's own words** | Work Map with a timestamped frame, a quote and guardrails on every step |
| 3. Teach | A judge plays a new hire on a case the expert **never showed**; tutor **catches ≥ 1 wrong decision before it is saved** and explains it with the expert's reasoning | New hire clicks "Refund €180" on a ticket with a fraud signal; Shadow blocks the save and replays the expert's moment |

### The five "Apprentice Test" questions the demo must answer

1. **When to ask** — how we detect a pause and stay quiet while the expert types, reads or talks → *Turn Gate*
2. **What to ask** — how we pick a question that reveals a reason or guardrail, not one the screen already answers → *Curiosity Engine*
3. **When it has understood** — how the debrief decides it's done and how the teach-back proves it → *Coverage score + teach-back + prediction proof*
4. **Whether the new hire learned** — showing they handle a new case alone → *Unseen-case test + mastery report*
5. **Trust** — taking something off the record, protecting on-screen personal data → *Off the record + redaction*

### Also expected

- **Stretch goals:** two experts on one task (diff + ask each why); any language (expert in German, tutor in English); agent-ready guardrails export.
- **Pitch:** must end with one moonshot slide and the path from MVP to it.
- **Built with ElevenLabs:** ElevenAgents plays interviewer *and* tutor (Expressive Mode); our choice of LLM behind it; Scribe v2 Realtime for listening and pause detection.
- **Brief's tips:** start with voice + one screen; ask only **3–5 live questions per 10 minutes**, save the rest for the debrief.
- **Suggested resources:** own workflow, WebArena sandbox, O*NET tasks, Microsoft Presidio for redaction, ElevenLabs MCP tools.

---

## 2. Product concept: from "auto-triage" to "apprentice"

### The reframe

| Your original idea | What we build instead | Why |
| --- | --- | --- |
| A service reviews a ticket and decides reply / refund / escalate / security-legal handoff | Shadow **learns how a senior lead makes that decision**, then **teaches** a new agent to make it | Judges score "apprentice, not recorder/automation"; the auto-decider alone would fail Modules 1–3 |
| Decision rules written by us | Rules **captured from the expert's own words**, linked to screen moments | Required by Module 2; also the real product moat |
| Auto-triage in production | **Triage Copilot export**: Work Map → agent policy, run in shadow mode on held-out tickets | Hits the "agent-ready guardrails" stretch goal and the "people first, then agents" moonshot — your idea becomes the finale |

### The workflow we capture: escalation triage

A senior support lead ("Maya", 9 years, Tier-2) works a queue in a sandbox helpdesk. Each ticket ends in one of these outcomes:

| Outcome | Example trigger | Hidden judgment / guardrail (what Shadow must learn) |
| --- | --- | --- |
| **Reply** (macro or custom) | "Where's my invoice?" | VIP / enterprise tag → never use a macro, write a custom reply |
| **Refund** (full / partial / credit) | Duplicate charge €49 | Above €100 → needs a second approval; credit instead of refund for annual plans |
| **Hold / request info** | Missing order number | Ask once; after 48 h with no answer, close |
| **Escalate to Tier 2 / Engineering** | "App crashes on export" | Known bug ID exists → link it, don't refund for bugs with a fix ETA |
| **Security handoff** | "Someone changed my email" | Account-takeover signal → **stop**: no refund, no account details in reply, route to Security |
| **Legal / privacy handoff** | GDPR deletion request; "my lawyer…"; open chargeback | Lawyer mentioned → stop replying, route to Legal; open chargeback → **never refund** (double payout) |

These guardrails are the demo script, not product logic. In the real demo the expert says them in their own words, and Shadow captures them.

### The three modules, applied

1. **Capture** — Maya shares her screen and triages 4 tickets while Shadow listens in a side panel. At pauses, it asks 3–5 short questions about what just happened on screen.
2. **Map** — A 2–3 minute spoken debrief closes gaps, then Shadow explains the whole triage process back. Maya corrects one detail and confirms. Output: the Work Map.
3. **Teach** — A new hire ("Jonas") works unseen tickets. Shadow explains steps in Maya's words, asks him to predict decisions, and blocks a wrong refund before it's saved.
4. **Export (stretch, our differentiator)** — Work Map → Triage Copilot policy. Copilot decides on the 10 held-out tickets in shadow mode, cites the rule it used, and hands judgment calls back to a human.

### The demo ticket set

| Session | Ticket | Correct outcome | What it tests |
| --- | --- | --- | --- |
| Expert | T1 "Where's my invoice?" | Reply (macro) | Happy path, baseline |
| Expert | T2 Duplicate charge €49 | Refund | Refund under limit |
| Expert | T3 Refund €240, customer has open chargeback | Hold → Billing disputes | **Guardrail**: never refund with open chargeback |
| Expert | T4 "Someone changed my email, refund my plan" | Security handoff, no refund | **Guardrail**: account takeover beats refund |
| New hire | N1 €180 refund + "my card was used without permission" | Security / fraud, no refund | **Never shown**; combines limit + fraud → tutor intercepts |
| New hire | N2 GDPR deletion request | Legal / privacy | Asked about only in debrief |

---

## 3. Product-market fit review

> Market figures below are *approximate and from general knowledge*; verify before putting them on a slide. The brief's own sourced figures (Gartner, O*NET, Destatis) are safe to quote.

### Who has the problem

| Segment | Buyer | Pain | Fit |
| --- | --- | --- | --- |
| Mid-size SaaS / e-commerce support (50–500 agents) | Head of Support, Support Ops | New agents take weeks to ramp; escalations inconsistent; seniors are the bottleneck | **Primary** — high turnover, high cost of a wrong refund or mishandled security case |
| BPO / outsourced support | Ops director | Must onboard hundreds of agents per client, per client's rules | Strong — repeated onboarding, client-specific guardrails |
| Fintech / regulated support | Compliance + Support | Wrong handling of fraud, KYC, legal requests = regulatory risk | Strong, but slower procurement |
| Small teams (< 10 agents) | Founder | Knowledge lives in one head | Weak willingness to pay |

### Why now

- Tier-1 tickets are being absorbed by AI agents (Intercom Fin, Zendesk AI agents, Salesforce Agentforce). What remains for humans is the **judgment-heavy escalation work** — exactly the knowledge that is never written down.
- Those same AI agents need written policies and guardrails to act safely. Gartner (cited in the brief) expects **over 40% of agentic AI projects to be canceled by end of 2027**, partly over inadequate risk controls. Shadow produces those controls as a by-product of training people.
- Voice capture lowers the cost of documenting: an expert who won't write a policy doc will explain while working.

### Competitive landscape

| Category | Examples | What they capture | Gap Shadow fills |
| --- | --- | --- | --- |
| Task mining / process mining | Celonis, UiPath Task Mining | Clicks and paths | No *why*, no guardrails |
| How-to capture | Scribe, Tango, Loom | Step screenshots / video | Records the happy path; no judgment, no exceptions |
| Knowledge bases | Guru, Notion, Confluence | Whatever someone writes | Requires authoring; goes stale |
| Digital adoption | WalkMe, Whatfix | Static in-app tours | Scripted, not learned from an expert; no decision coaching |
| Support AI | Fin, Zendesk AI, Agentforce | Automate replies from KB | Need policies as input — Shadow *produces* them |

**Positioning:** *the only tool that turns an expert's spoken reasoning into both a human training path and an AI agent policy, each linked to evidence.*

### PMF verdict

| Dimension | Score | Reasoning |
| --- | --- | --- |
| Problem severity | High | Wrong refunds, missed fraud and mishandled legal requests cost real money; ramp time is a known KPI |
| Frequency | High | Every new hire, every policy change |
| Willingness to pay | Medium–High | Support Ops has budget for QA and enablement tools |
| Differentiation | High | Capture *why* + teach + export to agents is a unique combo |
| Adoption friction | **Medium–High** | Screen capture of customer data triggers privacy/security review — redaction and off-the-record are not optional |
| Hackathon fit | Very high | Use case is named in the brief; escalation guardrails are crisp and easy to demo |

**Recommendation:** go, with privacy as a first-class feature rather than an afterthought. Post-hackathon, validate with 5 support-lead interviews before building integrations.

### Value metrics we'd sell on

- **Time to proficiency** for a new agent (weeks → days)
- **Escalation accuracy** (correct route on first touch)
- **Refund leakage** (refunds that should have been held)
- **Senior time saved** (shadowing hours avoided)

---

## 4. Feature scope: add, cut, keep

### Keep (core — required by the brief)

- Screen share + side-panel voice agent (Capture)
- Vision events from frames every 1–2 s
- Pause-aware questioning, ≥ 1 guardrail question
- Spoken debrief + teach-back → Work Map with evidence links
- Voice tutor on the new hire's screen, with pre-save interception
- Off-the-record + PII redaction

### Add (things your original idea lacked)

| Feature | Why it's needed |
| --- | --- |
| **DeskSim** — our own sandbox helpdesk with fake tickets | We control the data (no real PII), get exact DOM events, and can **block a save** — the Teach requirement is nearly impossible on a third-party app |
| **Turn Gate** (pause detector) | Answers Apprentice Test Q1; prevents mid-typing interruptions |
| **Curiosity Engine** (question ranker) | Answers Q2; filters out questions the screen already answers |
| **Gap Ledger + coverage score** | Answers Q3; objective "done" signal for the debrief |
| **Predict-the-decision quiz** | Proof of understanding beyond "expert said yes" |
| **Mastery Report** | Required "what they mastered / practice next" |
| **Triage Copilot export** | Your auto-triage idea, re-scoped as the stretch goal and moonshot bridge |

### Cut (for the hackathon)

| Cut | Reason |
| --- | --- |
| Real Zendesk / Intercom / Freshdesk integrations | OAuth + data-privacy work; zero demo points |
| Production auto-triage service | Fails the "apprentice" criterion; replaced by Copilot export in shadow mode |
| Multi-tenant auth, billing, admin | Not judged |
| Arbitrary-app interception (browser extension) | Interception works on DeskSim; mention extension as roadmap |
| Model fine-tuning | Prompting + structured output is enough |
| Analytics dashboards | Mastery Report covers the need |

### Stretch, in priority order

1. **Triage Copilot export** (agent-ready guardrails) — highest pitch value, reuses the Work Map
2. **Any language** — Maya explains in German, Jonas is taught in English (cheap: Scribe and the LLM are multilingual)
3. **Two experts, one task** — diff two Work Maps, ask each why (most expensive; do last)

---


---

## PMF validation after the hackathon

Interview 5 support leads or Support Ops managers (30 min each):

1. How long until a new agent handles escalations alone?
2. What was the last costly mistake a new agent made, and what did it cost?
3. Where do your escalation rules live today?
4. Would you let a tool watch your screen if PII is redacted? What would security require?
5. Would you use the same rules to govern an AI agent?

**Signal to continue:** at least 3 of 5 name a costly escalation mistake *and* would trial screen capture with redaction.
