"use client";

import { useMemo } from "react";
import { TeachDock } from "../../app/teach/TeachDock";
import { InterventionPanel } from "../tutor/InterventionPanel";
import { buildIntervention } from "../tutor/logic";
import { resolveItem } from "../tutor/MasteryReport";
import { PredictPanel } from "../tutor/PredictPanel";
import { Panel } from "../ui/Card";
import { cx } from "../ui/cx";
import { sampleWorkMap } from "../workmap/fixture";
import type { TeachFrame } from "./frame";
import { focusClass, ReplayDesk } from "./ReplayDesk";
import type { ReplayScript } from "./script";

/**
 * Chapter 3: Jonas works the standalone DeskSim app with the real TeachDock over it, as /teach
 * looks live. On N2, a judgment point, Shadow's predict callout (the real PredictPanel) asks
 * before he acts. On N1 the guard pauses the refund and the real InterventionPanel, built by the
 * tutor's own `buildIntervention` from the guard's verdict and the sample Work Map, is anchored
 * under the held action. At Finish the mastery report takes the page over.
 */
export function TeachStage({ frame, teach }: { frame: TeachFrame; teach: ReplayScript["teach"] }) {
  const intervention = useMemo(
    () => buildIntervention(sampleWorkMap, teach.verdict, teach.ticketId, teach.attempted),
    [teach],
  );
  if (frame.showMastery) {
    return (
      <div className={focusClass(true)}>
        <MasterySummary teach={teach} />
      </div>
    );
  }
  const predict = frame.predict;
  return (
    <ReplayDesk
      view={frame.desk}
      attempt={{ outcome: teach.attempted, verdict: teach.verdict }}
      className={cx("h-[48rem] sm:h-[46rem]", focusClass(true))}
      coach={
        frame.showIntervention ? (
          <InterventionPanel
            intervention={intervention}
            expertName={sampleWorkMap.expertName}
            resolvedOutcome={frame.resolvedOutcome}
            tutorNotified
            onReplay={null}
          />
        ) : null
      }
      dock={
        <TeachDock
          learnerName="Jonas"
          since={null}
          saved={frame.saved}
          total={teach.tickets.length}
          held={frame.held}
          voiceState="listening"
          voice={{
            status: "connected",
            mode: "listening",
            error: null,
            transcript: [],
            onStart: noop,
            onStop: noop,
          }}
          expertName={sampleWorkMap.expertName}
          onFinish={noop}
          finishing={false}
          callout={
            predict ? (
              <PredictPanel
                ticketId={teach.predict.ticketId}
                condition={teach.predict.condition}
                expertName={sampleWorkMap.expertName}
                voiceLive
                pending={false}
                chosen={predict.chosen}
                result={predict.revealed ? teach.predict.result : null}
                error={null}
                onChoose={noop}
              />
            ) : null
          }
        />
      }
    />
  );
}

const noop = () => {};

function MasterySummary({ teach }: { teach: ReplayScript["teach"] }) {
  const { mastery } = teach;
  const groups = [
    { status: "independent", title: "Independent" },
    { status: "assisted", title: "Assisted" },
    { status: "missed", title: "Missed" },
  ] as const;
  const practice = mastery.practiceNext
    .map((id) => resolveItem(sampleWorkMap, id))
    .filter((x) => x !== null);
  return (
    <Panel
      id="mastery"
      title="Mastery report"
      meta="Jonas, two unseen tickets, taught from Maya’s Work Map"
      flush
    >
      <dl className="grid grid-cols-3 gap-px border-b border-rule bg-rule">
        {groups.map((g) => {
          const entries = mastery.entries.filter((e) => e.status === g.status);
          return (
            <div key={g.status} className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3">
              <dt className="text-xs font-medium text-ink-muted">{g.title}</dt>
              <dd className="figures text-2xl leading-8 font-semibold tracking-tight text-ink">
                {entries.length}
              </dd>
              <dd className="truncate font-mono text-2xs text-ink-faint">
                {entries.map((e) => `${e.ticketId}, ${e.stepOrGuardrailId}`).join("; ") || "none"}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs font-medium text-ink-muted">Practise next</p>
        {practice.map((item) => (
          <figure key={item.id}>
            <p className="text-ui font-medium text-ink">{practiceTitle(item.id)}</p>
            <blockquote className="mt-2 border-l-2 border-rule-strong pl-3 text-ui text-ink">
              “{item.quote}”
            </blockquote>
            <figcaption className="figures mt-1.5 font-mono text-2xs text-ink-faint">
              Maya, {item.id}
            </figcaption>
          </figure>
        ))}
      </div>
    </Panel>
  );
}

/** "Signs of account takeover: stop; no refund, …" for a guardrail; the step title for a step. */
function practiceTitle(id: string): string {
  const g = sampleWorkMap.guardrails.find((x) => x.id === id);
  if (g) return `${g.condition.charAt(0).toUpperCase()}${g.condition.slice(1)}: ${g.action}`;
  return sampleWorkMap.steps.find((x) => x.id === id)?.title ?? id;
}
