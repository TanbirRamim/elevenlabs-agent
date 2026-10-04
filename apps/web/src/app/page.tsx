import { EyeOff, MicOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { Badge, ButtonLink, Card, KeyboardKey, Reveal, SectionHeading } from "@/components/ui";
import { OrbFallback } from "@/components/voice/OrbFallback";
import { OrbStateDemo } from "@/components/voice/OrbStateDemo";

type Module = {
  step: string;
  name: string;
  body: string;
  result: string;
  href: string;
  action: string;
};

const MODULES: readonly Module[] = [
  {
    step: "01",
    name: "Capture",
    body: "Your senior lead triages real tickets and thinks aloud. Shadow stays quiet while they read or type, and at natural pauses asks a few short questions about what just happened on screen.",
    result: "Reasons and guardrails, each pinned to the moment it was said.",
    href: "/capture",
    action: "Start a capture session",
  },
  {
    step: "02",
    name: "Map",
    body: "A short spoken debrief closes the gaps. Shadow explains the whole process back, the expert corrects what it got wrong, and confirms the rest.",
    result:
      "A Work Map: steps, reasons and guardrails, each linked to a screen moment and a quote.",
    href: "/map/latest?fixture=1",
    action: "Open the sample Work Map",
  },
  {
    step: "03",
    name: "Teach",
    body: "A new agent works tickets the expert never saw. Shadow coaches in the expert’s words, asks them to predict the next decision, and stops a wrong refund before it is saved.",
    result: "A new hire who can explain why, not just what.",
    href: "/teach",
    action: "Coach a new hire",
  },
];

export default function Home() {
  return (
    <main>
      <Hero />
      <Apprentice />
      <Sequence />
      <Privacy />
      <Footer />
    </main>
  );
}

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pt-14 pb-20 sm:pt-20 sm:pb-28">
      <Container className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <h1
            id="hero-title"
            className="max-w-[16ch] font-display text-[2.75rem] leading-[1.02] font-normal tracking-[-0.025em] text-balance sm:text-[4rem] lg:text-[4.5rem]"
          >
            Your best support lead’s judgment, taught to every new hire.
          </h1>
          <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-pretty text-ink-muted">
            Shadow is an AI apprentice for support escalations. It sits beside your senior lead
            while they triage, asks why at the moments that matter, and turns the answers into a
            Work Map that coaches the people who come after them.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <ButtonLink href="/demo" size="lg">
              Watch it work · 90 s
            </ButtonLink>
            <ButtonLink href="/capture" size="lg">
              Start a capture session
            </ButtonLink>
            <ButtonLink href="/map/latest?fixture=1" size="lg" variant="secondary">
              Open the sample Work Map
            </ButtonLink>
          </div>
        </div>
        <div className="lg:col-span-5">
          <OrbStateDemo />
        </div>
      </Container>
    </section>
  );
}

function Apprentice() {
  return (
    <section aria-labelledby="apprentice-title" className="border-t border-rule py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <SectionHeading
            id="apprentice-title"
            title="An apprentice, not a recorder."
            description="A screen recording keeps the clicks. The reasons stay in the expert’s head, and they are what a new agent actually needs. Shadow asks for them while the moment is still on screen."
          />
          <ul className="mt-8 flex flex-col gap-3 border-l border-rule pl-5 text-[0.9375rem] leading-relaxed text-ink-muted">
            <li>It waits for a pause instead of interrupting the work.</li>
            <li>
              It asks about what the screen cannot show: the reason, the exception, the limit.
            </li>
            <li>It keeps every answer next to the frame it was about.</li>
          </ul>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
              <span className="text-sm text-ink-muted">Capture session, ticket triage</span>
              <span className="font-mono text-xs text-ink-faint">Example</span>
            </div>
            <ol className="flex flex-col">
              <TranscriptRow time="06:38">
                <p className="text-[0.9375rem] text-ink-muted">
                  Expert routes a refund request to Security instead of refunding it.
                </p>
              </TranscriptRow>
              <TranscriptRow time="06:41" signal>
                <p className="mb-1.5 flex items-center gap-2 text-sm text-signal-text">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-signal" />
                  Shadow asks
                </p>
                <p className="text-[1.0625rem] leading-snug">
                  You sent that one to Security instead of refunding. What tipped it?
                </p>
              </TranscriptRow>
              <TranscriptRow time="06:44">
                <p className="mb-1.5 text-sm text-ink-muted">Expert</p>
                <blockquote className="font-display text-[1.25rem] leading-snug italic">
                  “The login email changed an hour before they asked for the money back. Until
                  Security clears it, that’s a takeover. No refund, and no account details in the
                  reply.”
                </blockquote>
              </TranscriptRow>
            </ol>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule bg-sunken/60 px-5 py-3.5">
              <Badge tone="signal" dot>
                Guardrail
              </Badge>
              <span className="text-sm text-ink-muted">
                Saved with the expert’s words and the frame at{" "}
                <span className="font-mono text-ink">06:38</span>
              </span>
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}

function TranscriptRow({
  time,
  signal = false,
  children,
}: {
  time: string;
  signal?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[3.25rem_1fr] gap-3 border-b border-rule px-5 py-4 last:border-b-0">
      {signal ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-signal" />
      ) : null}
      <span className="pt-0.5 font-mono text-xs text-ink-faint tabular-nums">{time}</span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

function Sequence() {
  return (
    <section aria-labelledby="sequence-title" className="border-t border-rule py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="sequence-title"
          title="One expert’s shift becomes every new hire’s first week."
          description="Three sessions, in order. Each one hands the next a concrete result."
        />
        <ol className="relative mt-14 grid gap-12 md:mt-20 md:grid-cols-3 md:gap-x-10 md:gap-y-0">
          {/* The rail the three steps hang from. */}
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-[5px] w-px bg-rule-strong md:top-[5px] md:right-0 md:bottom-auto md:left-0 md:h-px md:w-auto"
          />
          {MODULES.map((m, i) => (
            <Reveal
              key={m.name}
              as="li"
              delay={i * 0.1}
              className="relative pl-9 md:row-span-5 md:grid md:grid-rows-subgrid md:pt-10 md:pl-0"
            >
              <span
                aria-hidden="true"
                className="absolute top-1.5 left-0 size-[11px] rounded-full border border-rule-strong bg-canvas md:top-0"
              />
              <p className="font-mono text-sm text-ink-faint">{m.step}</p>
              <h3 className="mt-2 font-display text-[2rem] leading-none tracking-[-0.015em]">
                {m.name}
              </h3>
              <p className="mt-5 max-w-[36ch] text-[0.9375rem] leading-relaxed text-ink-muted">
                {m.body}
              </p>
              <p className="mt-5 max-w-[36ch] self-start border-t border-rule pt-4 text-[0.9375rem] leading-relaxed">
                {m.result}
              </p>
              <Link
                href={m.href}
                className="mt-6 inline-flex min-h-11 items-center self-start justify-self-start text-[0.9375rem] font-medium underline decoration-rule-strong decoration-1 underline-offset-[6px] transition-colors hover:decoration-ink"
              >
                {m.action}
              </Link>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Privacy() {
  return (
    <section aria-labelledby="privacy-title" className="border-t border-rule py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <SectionHeading
            id="privacy-title"
            title="Off the record means off the record."
            description="Experts talk about customers, colleagues and mistakes. Shadow is built so they can say what they really think, and so the customer data on their screen is protected before anything is kept."
          />
          <div className="mt-10 hidden size-36 lg:block">
            <OrbFallback state="off-record" />
          </div>
        </div>

        <dl className="grid gap-10 sm:grid-cols-2 lg:col-span-6 lg:col-start-7 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-rule">
          <PrivacyItem icon={<MicOff />} title="Pause it with a word or a key">
            Say “off the record”, press <KeyboardKey>Alt</KeyboardKey> +{" "}
            <KeyboardKey>O</KeyboardKey>, or use the button. The browser stops sending screen and
            voice, the orb goes grey, and the span is left out of the Work Map. Say “back on the
            record” to continue.
          </PrivacyItem>
          <PrivacyItem icon={<EyeOff />} title="Redacted before anything is stored">
            Personal details are blurred on screen frames in the browser, then redacted again on the
            server. Transcript text is redacted before it is stored or sent to a model. The
            recording is made from the redacted view, never the raw tab.
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
    <div className="lg:py-8 lg:first:pt-0 lg:last:pb-0">
      <dt className="flex items-center gap-3 text-lg font-medium">
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-full border border-rule text-ink-muted [&_svg]:size-[18px] [&_svg]:stroke-[1.5]"
        >
          {icon}
        </span>
        {title}
      </dt>
      <dd className="mt-3 max-w-[42ch] text-[0.9375rem] leading-relaxed text-ink-muted">
        {children}
      </dd>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-rule py-10">
      <Container className="flex flex-col gap-4 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2 text-ink">
          <BrandMark className="size-5" />
          <span className="font-display text-lg">Shadow</span>
        </span>
        <p>Built for Hack-Nation and ElevenLabs, challenge 01: The AI Apprentice.</p>
      </Container>
    </footer>
  );
}
