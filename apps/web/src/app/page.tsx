import {
  ArrowRight,
  CircleDot,
  EyeOff,
  GraduationCap,
  MicOff,
  Play,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { HeroMark } from "@/components/brand/HeroMark";
import { CaptureCrop, MapCrop, TeachCrop } from "@/components/brand/LandingCrops";
import {
  Avatar,
  Badge,
  ButtonLink,
  KbdCombo,
  SectionHeading,
  Stat,
  StatGroup,
  StatusPill,
} from "@/components/ui";

type Module = {
  step: number;
  name: string;
  icon: ReactNode;
  crop: ReactNode;
  caption: string;
  body: string;
  result: string;
  href: string;
  action: string;
};

const MODULES: readonly Module[] = [
  {
    step: 1,
    name: "Capture",
    icon: <CircleDot />,
    crop: <CaptureCrop />,
    caption: "Capture: recorder, Singoda AI asking at a pause, the expert's answer",
    body: "Your senior lead triages real tickets and thinks aloud. Singoda AI stays quiet while they read or type, and at natural pauses asks a few short questions about what just happened on screen.",
    result: "Reasons and guardrails, each pinned to the moment it was said.",
    href: "/capture",
    action: "Start a capture session",
  },
  {
    step: 2,
    name: "Map",
    icon: <Workflow />,
    crop: <MapCrop />,
    caption: "Work Map: steps on the session timeline, judgment calls marked",
    body: "A short spoken debrief closes the gaps. Singoda AI explains the whole process back, the expert corrects what it got wrong, and confirms the rest.",
    result:
      "A Work Map: steps, reasons and guardrails, each linked to a screen moment and a quote.",
    href: "/map/latest?fixture=1",
    action: "Open the sample Work Map",
  },
  {
    step: 3,
    name: "Teach",
    icon: <GraduationCap />,
    crop: <TeachCrop />,
    caption: "Teach: a wrong refund held before it is saved, with the rule and the quote",
    body: "A new agent works tickets the expert never saw. Singoda AI coaches in the expert’s words, asks them to predict the next decision, and stops a wrong refund before it is saved.",
    result: "A new hire who can explain why, not just what.",
    href: "/teach",
    action: "Coach a new hire",
  },
];

/** The guard figures come from `pnpm eval:guard` on the seed tickets (same as the Proof row). */
const PROOF_CHIPS = [
  "Any helpdesk: screen share to learn, one API call to block",
  "No evidence, no rule: every rule cites a quote and a frame",
  "Measured: 9/9 caught, 0/16 false blocks",
] as const;

export default function Home() {
  return (
    <main>
      <Hero />
      <Proof />
      <Sequence />
      <Privacy />
      <Closing />
      <Footer />
    </main>
  );
}

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pt-14 pb-16 sm:pt-20 sm:pb-20">
      <Container>
        <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <HeroMark className="-my-4 -ms-4 w-32 sm:w-40 lg:order-last lg:m-0 lg:w-full" />
          <div className="max-w-3xl">
            <StatusPill tone="ask">An AI apprentice for support escalations</StatusPill>
            <h1
              id="hero-title"
              className="mt-5 max-w-[22ch] text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-5xl sm:leading-[1.05]"
            >
              Your best support lead’s judgment, taught to every new hire.
            </h1>
            <p className="mt-5 max-w-[38rem] text-base leading-relaxed text-pretty text-ink-muted sm:text-lg">
              Singoda AI sits beside your senior lead while they triage, asks why at the moments
              that matter, and turns the answers into a Work Map that coaches the people who come
              after them.
            </p>
            <ul aria-label="Proof" className="mt-6 flex flex-wrap gap-2">
              {PROOF_CHIPS.map((c) => (
                <li
                  key={c}
                  className="rounded-full border border-rule bg-surface px-3 py-1 text-xs text-ink"
                >
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <ButtonLink href="/teach" size="lg" icon={<ShieldCheck aria-hidden="true" />}>
                See it stop a wrong refund
              </ButtonLink>
              <ButtonLink
                href="/demo"
                size="lg"
                variant="secondary"
                icon={<Play aria-hidden="true" />}
              >
                Watch it work · 90 s
              </ButtonLink>
              <ButtonLink href="/map/latest?fixture=1" size="lg" variant="ghost">
                Open the sample Work Map
                <ArrowRight aria-hidden="true" />
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-ink-faint">
              Voice by ElevenLabs Agents · reasoning by Claude
            </p>
          </div>
        </div>

        <ProductFrame />
      </Container>
    </section>
  );
}

/** A static, labelled picture of a capture session, built from the real tokens. */
function ProductFrame() {
  return (
    <figure className="mt-14 sm:mt-16">
      <div className="overflow-hidden rounded-overlay border border-rule bg-surface shadow-overlay">
        <div className="flex h-11 items-center justify-between gap-3 border-b border-rule bg-canvas px-4">
          <div className="flex min-w-0 items-center gap-2 text-ui">
            <span className="truncate text-ink-muted">Capture</span>
            <span className="text-ink-faint">/</span>
            <span className="truncate font-medium text-ink">Refund triage</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill tone="rec">
              REC <span className="figures font-mono">06:44</span>
            </StatusPill>
            <span className="hidden sm:inline-flex">
              <StatusPill tone="ok">Redaction on</StatusPill>
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)_18rem]">
          <ul
            aria-label="Example ticket queue"
            className="hidden flex-col border-r border-rule p-2 lg:flex"
          >
            {[
              { id: "Refund request", meta: "Billing", current: false },
              { id: "Login email changed", meta: "Account", current: true },
              { id: "Duplicate charge", meta: "Billing", current: false },
              { id: "Cancel subscription", meta: "Account", current: false },
            ].map((t) => (
              <li
                key={t.id}
                className={`flex flex-col gap-0.5 rounded-control px-2.5 py-2 ${t.current ? "bg-selected" : ""}`}
              >
                <span className="truncate text-ui font-medium text-ink">{t.id}</span>
                <span className="text-xs text-ink-faint">{t.meta}</span>
              </li>
            ))}
          </ul>

          <ol aria-label="Example transcript" className="flex flex-col">
            <TranscriptRow time="06:38" who="Screen">
              <p className="text-ui text-ink-muted">
                Expert routes a refund request to Security instead of refunding it.
              </p>
            </TranscriptRow>
            <TranscriptRow time="06:41" who="Singoda AI" shadow>
              <p className="text-sm text-ink">
                You sent that one to Security instead of refunding. What tipped it?
              </p>
            </TranscriptRow>
            <TranscriptRow time="06:44" who="Expert">
              <blockquote className="border-l-2 border-rule-strong pl-3 text-sm leading-relaxed text-ink">
                “The login email changed an hour before they asked for the money back. Until
                Security clears it, that’s a takeover. No refund, and no account details in the
                reply.”
              </blockquote>
            </TranscriptRow>
          </ol>

          <div className="flex flex-col gap-3 border-t border-rule bg-sunken p-4 lg:border-t-0 lg:border-l">
            <p className="text-xs font-medium text-ink-muted">Saved to the Work Map</p>
            <div className="rounded-panel border border-rule bg-surface p-3">
              <Badge tone="guard" dot>
                Guardrail
              </Badge>
              <p className="mt-2 text-ui font-medium text-ink">
                Login email changed just before a refund request
              </p>
              <p className="mt-1 text-ui text-ink-muted">
                Route to Security. No refund, no account details in the reply.
              </p>
              <p className="mt-2 font-mono text-2xs text-ink-faint">Frame 06:38 · quote 06:44</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-ink-faint">
        Example capture session. Customer details are redacted before anything is stored.
      </figcaption>
    </figure>
  );
}

function TranscriptRow({
  time,
  who,
  shadow = false,
  children,
}: {
  time: string;
  who: string;
  shadow?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[3rem_1fr] gap-3 border-b border-rule px-4 py-4 last:border-b-0 sm:px-5">
      <span className="figures pt-0.5 font-mono text-xs text-ink-faint">{time}</span>
      <div className="min-w-0">
        <p className="mb-1.5 flex items-center gap-2 text-xs font-medium">
          {shadow ? (
            <>
              <Avatar name="Singoda AI" size="xs" shadow />
              <span className="text-ask-text">Singoda AI asks</span>
            </>
          ) : (
            <span className="text-ink-muted">{who}</span>
          )}
        </p>
        {children}
      </div>
    </li>
  );
}

function Sequence() {
  return (
    <section aria-labelledby="sequence-title" className="border-t border-rule py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="sequence-title"
          title="Capture, map, teach. One expert’s shift becomes every new hire’s first week."
          description="Three sessions, in order. Each one hands the next a concrete result. These are the real components, not mockups."
        />
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {MODULES.map((m) => (
            <li
              key={m.name}
              className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface"
            >
              <figure className="border-b border-rule bg-sunken">
                <div className="h-[17rem] overflow-hidden">{m.crop}</div>
                <figcaption className="sr-only">{m.caption}</figcaption>
              </figure>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-7 items-center justify-center rounded-control border border-rule bg-sunken text-ink-muted [&_svg]:size-4 [&_svg]:stroke-[1.75]"
                  >
                    {m.icon}
                  </span>
                  <h3 className="text-sm font-semibold text-ink">
                    <span className="figures mr-1.5 font-mono text-xs font-normal text-ink-faint">
                      {m.step}.
                    </span>
                    {m.name}
                  </h3>
                </div>
                <p className="mt-3 text-ui text-ink-muted">{m.body}</p>
                <p className="mt-3 border-t border-rule pt-3 text-ui text-ink">{m.result}</p>
                <Link
                  href={m.href}
                  className="mt-auto inline-flex items-center gap-1 self-start pt-4 text-ui font-medium text-ink underline decoration-rule-strong underline-offset-4 transition-colors hover:decoration-ink"
                >
                  {m.action}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/** What is measured, with the command that measures it. Figures come from `pnpm eval:guard`. */
function Proof() {
  return (
    <section aria-labelledby="proof-title" className="border-t border-rule bg-surface py-10">
      <Container>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="proof-title" className="text-sm font-semibold text-ink">
            What we measure, not what we promise
          </h2>
          <p className="text-xs text-ink-muted">
            Guard figures from <code className="font-mono text-ink">pnpm eval:guard</code> on the
            seed tickets
          </p>
        </div>
        <StatGroup className="mt-4">
          <Stat
            label="Wrong actions caught"
            value="100%"
            unit="9 / 9"
            note="naive new-hire actions on seed tickets"
          />
          <Stat
            label="False blocks"
            value="0"
            unit="/ 16"
            note="expert decisions the guard let through"
          />
          <Stat
            label="Redaction"
            value="Before storage"
            note="frames blurred in the browser, redacted again on the server"
          />
          <Stat
            label="Off the record"
            value="Nothing kept"
            note="say it or press Alt O; the span is left out"
          />
        </StatGroup>
      </Container>
    </section>
  );
}

function Closing() {
  return (
    <section aria-labelledby="closing-title" className="border-t border-rule py-16 sm:py-20">
      <Container className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading
          id="closing-title"
          title="People first, then agents."
          description="The Work Map that teaches the new hire also runs as an AI triage policy: the same rules, the same quotes, and every judgment call handed back to a person."
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ButtonLink href="/demo" size="lg" icon={<Play aria-hidden="true" />}>
            Play the 90-second replay
          </ButtonLink>
          <ButtonLink href="/copilot" size="lg" variant="secondary">
            Run the triage Copilot
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

function Privacy() {
  return (
    <section aria-labelledby="privacy-title" className="border-t border-rule py-16 sm:py-20">
      <Container className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHeading
            id="privacy-title"
            title="Off the record means off the record."
            description="Experts talk about customers, colleagues and mistakes. Singoda AI is built so they can say what they really think, and so the customer data on their screen is protected before anything is kept."
          />
        </div>

        <dl className="grid gap-px overflow-hidden rounded-panel border border-rule bg-rule sm:grid-cols-2 lg:col-span-7">
          <PrivacyItem icon={<MicOff />} title="Pause it with a word or a key">
            Say “off the record”, press <KbdCombo keys={["Alt", "O"]} className="align-middle" />,
            or use the button. The browser stops sending screen and voice and the span is left out
            of the Work Map. Say “back on the record” to continue.
          </PrivacyItem>
          <PrivacyItem icon={<EyeOff />} title="Redacted before anything is stored">
            Personal details are blurred on screen frames in the browser, then redacted again on the
            server. Transcript text is redacted before it is stored or sent to a model.
          </PrivacyItem>
          <PrivacyItem icon={<ShieldCheck />} title="Recorded from the redacted view">
            The recording is made from the redacted view, never the raw tab, so a missed field on
            screen is still caught before it is kept.
          </PrivacyItem>
          <PrivacyItem icon={<Workflow />} title="Every rule has a source">
            Each guardrail in a Work Map links back to the frame and the expert’s own words, so a
            reviewer can check where it came from.
          </PrivacyItem>
        </dl>
      </Container>
    </section>
  );
}

function PrivacyItem({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface p-5">
      <dt className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <span aria-hidden="true" className="text-ink-muted [&_svg]:size-4 [&_svg]:stroke-[1.75]">
          {icon}
        </span>
        {title}
      </dt>
      <dd className="mt-2 text-ui leading-relaxed text-ink-muted">{children}</dd>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-rule py-8">
      <Container className="flex flex-col gap-3 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2 text-ink">
          <BrandMark className="size-4" />
          <span className="text-ui font-semibold">Singoda AI</span>
        </span>
        <p>Built for Hack-Nation and ElevenLabs, challenge 01: The AI Apprentice.</p>
      </Container>
    </footer>
  );
}
