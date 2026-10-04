import { readFileSync } from "node:fs";
import {
  type DebriefStatus,
  type EndSessionResponse,
  type OpenQuestion,
  WorkMap,
} from "@shadow/schema";
import { describe, expect, it } from "vitest";
import {
  currentVariant,
  type DebriefEvent,
  type DebriefState,
  debriefReducer,
  initialDebriefState,
  MAX_CORRECTION_ROUNDS,
  MAX_DEBRIEF_QUESTIONS,
  type PredictionVariant,
  pendingOp,
} from "./machine";

const workMap = WorkMap.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../seed/fixtures/workmap.json", import.meta.url), "utf8"),
  ),
);

const q = (id: string, priority: number): OpenQuestion => ({
  id,
  slot: "exception",
  text: `question ${id}`,
  priority,
});

const ended: EndSessionResponse = {
  workMapId: "wm_1",
  coverage: 0.6,
  openQuestions: [q("q_low", 0.65), q("q_high", 0.8), q("q_mid", 0.7)],
};

const variants: PredictionVariant[] = [
  { id: "v1", description: "T3 without the tag", predictedOutcome: "refund", becauseStepId: "S2" },
  {
    id: "v2",
    description: "T4 from a new account",
    predictedOutcome: "handoff_security",
    becauseStepId: "S4",
  },
];

const run = (events: DebriefEvent[], from: DebriefState = initialDebriefState) =>
  events.reduce(debriefReducer, from);

function status(partial: Partial<DebriefStatus>): DebriefStatus {
  return { coverage: 0.75, openQuestions: [], asked: 1, done: false, ...partial };
}

function expectPhase<P extends DebriefState["phase"]>(
  state: DebriefState,
  phase: P,
): Extract<DebriefState, { phase: P }> {
  expect(state.phase).toBe(phase);
  return state as Extract<DebriefState, { phase: P }>;
}

const asking = () => run([{ type: "END" }, { type: "END_OK", result: ended }]);

describe("debrief questions", () => {
  it("ends the task and asks the highest-priority question first", () => {
    const ending = run([{ type: "END" }]);
    expect(pendingOp(ending)).toBe("end");
    const s = expectPhase(asking(), "asking");
    expect(s.currentId).toBe("q_high");
    expect(s.ctx.questions.map((x) => x.id)).toEqual(["q_high", "q_mid", "q_low"]);
    expect(s.ctx.coverage).toBe(0.6);
    expect(pendingOp(s)).toBeNull();
  });

  it("submits an answer, updates coverage and moves to the next open question", () => {
    const submitted = run([{ type: "ANSWER", segmentIds: ["l2", "l3"] }], asking());
    expect(pendingOp(submitted)).toBe("answer");
    expect(expectPhase(submitted, "asking").submitting).toEqual(["l2", "l3"]);

    const s = expectPhase(
      run(
        [
          {
            type: "ANSWER_OK",
            status: status({
              coverage: 0.75,
              asked: 1,
              openQuestions: [q("q_low", 0.65), q("q_mid", 0.7)],
            }),
          },
        ],
        submitted,
      ),
      "asking",
    );
    expect(s.ctx.coverage).toBe(0.75);
    expect(s.ctx.answeredIds).toEqual(["q_high"]);
    expect(s.currentId).toBe("q_mid");
    expect(s.ctx.questions.map((x) => x.id)).toEqual(["q_high", "q_mid", "q_low"]);
    expect(s.submitting).toBeNull();
  });

  it("ignores an answer with no segments (the API requires at least one)", () => {
    const before = asking();
    expect(debriefReducer(before, { type: "ANSWER", segmentIds: [] })).toBe(before);
  });

  it("stops asking as soon as the API reports done", () => {
    const s = run(
      [
        { type: "ANSWER", segmentIds: ["l2"] },
        {
          type: "ANSWER_OK",
          // Still an open question left, but done wins.
          status: status({
            coverage: 0.9,
            asked: 3,
            done: true,
            openQuestions: [q("q_low", 0.65)],
          }),
        },
      ],
      asking(),
    );
    const t = expectPhase(s, "teachback");
    expect(t.text).toBeNull();
    expect(t.ctx.done).toBe(true);
    expect(t.ctx.coverage).toBe(0.9);
    expect(pendingOp(t)).toBe("teachback");
  });

  it("keeps asking while not done, then moves on when no question is left", () => {
    let s = asking();
    s = run(
      [
        { type: "ANSWER", segmentIds: ["a"] },
        { type: "ANSWER_OK", status: status({ asked: 1, openQuestions: [q("q_mid", 0.7)] }) },
      ],
      s,
    );
    expect(expectPhase(s, "asking").currentId).toBe("q_mid");
    s = run(
      [
        { type: "ANSWER", segmentIds: ["b"] },
        { type: "ANSWER_OK", status: status({ asked: 2, openQuestions: [] }) },
      ],
      s,
    );
    expect(expectPhase(s, "teachback").ctx.done).toBe(false);
  });

  it("adds new questions from the rebuild and honours the hard cap", () => {
    let s = asking();
    s = run(
      [
        { type: "ANSWER", segmentIds: ["a"] },
        { type: "ANSWER_OK", status: status({ asked: 1, openQuestions: [q("q_new", 0.95)] }) },
      ],
      s,
    );
    expect(expectPhase(s, "asking").currentId).toBe("q_new");
    s = run(
      [
        { type: "ANSWER", segmentIds: ["b"] },
        {
          type: "ANSWER_OK",
          status: status({ asked: MAX_DEBRIEF_QUESTIONS, openQuestions: [q("q_more", 0.9)] }),
        },
      ],
      s,
    );
    expect(s.phase).toBe("teachback");
  });

  it("goes straight to the teach-back when the API has nothing to ask", () => {
    const s = run([{ type: "END" }, { type: "END_OK", result: { ...ended, openQuestions: [] } }]);
    expect(pendingOp(s)).toBe("teachback");
  });
});

describe("teach-back", () => {
  const reading = () =>
    run(
      [{ type: "TEACHBACK_OK", text: "You refund under 200 euros." }],
      run(
        [
          { type: "ANSWER", segmentIds: ["a"] },
          { type: "ANSWER_OK", status: status({ asked: 3, done: true, coverage: 0.95 }) },
        ],
        asking(),
      ),
    );

  it("confirms and moves to the prediction proof with the confirmation time", () => {
    const confirming = run([{ type: "CONFIRM" }], reading());
    expect(pendingOp(confirming)).toBe("confirm");
    const s = expectPhase(
      run(
        [
          {
            type: "CONFIRM_OK",
            confirmed: true,
            tMs: 462_000,
            workMap: { ...workMap, teachBackConfirmedAtMs: 462_123 },
          },
        ],
        confirming,
      ),
      "predicting",
    );
    expect(s.ctx.teachBackConfirmedAtMs).toBe(462_123);
    expect(pendingOp(s)).toBe("predictions");
  });

  it("falls back to the local time when the map has no confirmation time", () => {
    const s = run(
      [
        { type: "CONFIRM" },
        {
          type: "CONFIRM_OK",
          confirmed: true,
          tMs: 1000,
          workMap: { ...workMap, teachBackConfirmedAtMs: null },
        },
      ],
      reading(),
    );
    expect(expectPhase(s, "predicting").ctx.teachBackConfirmedAtMs).toBe(1000);
  });

  it("applies a correction, reads the re-check back, then confirms", () => {
    let s = run([{ type: "CORRECT" }], reading());
    expectPhase(s, "correcting");
    s = run([{ type: "SUBMIT_CORRECTION", segmentIds: ["c1"] }], s);
    expect(pendingOp(s)).toBe("confirm");
    s = run(
      [
        {
          type: "CONFIRM_OK",
          confirmed: false,
          tMs: 0,
          workMap,
          recheckText: "So above 500 euros it goes to Legal.",
        },
      ],
      s,
    );
    const t = expectPhase(s, "teachback");
    expect(t.text).toBe("So above 500 euros it goes to Legal.");
    expect(t.recheck).toBe(true);
    expect(t.round).toBe(1);
    s = run([{ type: "CONFIRM" }, { type: "CONFIRM_OK", confirmed: true, tMs: 5000, workMap }], s);
    expect(s.phase).toBe("predicting");
  });

  it("allows at most two correction rounds", () => {
    let s = reading();
    for (let i = 0; i < MAX_CORRECTION_ROUNDS; i++) {
      s = run(
        [
          { type: "CORRECT" },
          { type: "SUBMIT_CORRECTION", segmentIds: [`c${i}`] },
          { type: "CONFIRM_OK", confirmed: false, tMs: 0, workMap, recheckText: `recheck ${i}` },
        ],
        s,
      );
    }
    const t = expectPhase(s, "teachback");
    expect(t.round).toBe(MAX_CORRECTION_ROUNDS);
    expect(debriefReducer(t, { type: "CORRECT" })).toBe(t);
    expect(run([{ type: "CONFIRM" }], t).phase).toBe("teachback");
    expect(pendingOp(run([{ type: "CONFIRM" }], t))).toBe("confirm");
  });

  it("keeps the old text when a correction comes back without a re-check", () => {
    const s = run(
      [
        { type: "CORRECT" },
        { type: "SUBMIT_CORRECTION", segmentIds: ["c"] },
        { type: "CONFIRM_OK", confirmed: false, tMs: 0, workMap },
      ],
      reading(),
    );
    const t = expectPhase(s, "teachback");
    expect(t.text).toBe("You refund under 200 euros.");
    expect(t.recheck).toBe(false);
  });

  it("can back out of a correction before sending it", () => {
    const s = run([{ type: "CORRECT" }, { type: "CANCEL_CORRECTION" }], reading());
    expect(expectPhase(s, "teachback").round).toBe(0);
  });
});

describe("prediction proof", () => {
  const predicting = () =>
    run(
      [
        { type: "END" },
        { type: "END_OK", result: { ...ended, openQuestions: [] } },
        { type: "TEACHBACK_OK", text: "t" },
        { type: "CONFIRM" },
        { type: "CONFIRM_OK", confirmed: true, tMs: 7000, workMap },
      ],
      initialDebriefState,
    );

  it("marks each prediction and ends confirmed", () => {
    let s = run([{ type: "PREDICTIONS_OK", variants }], predicting());
    const p = expectPhase(s, "predicting");
    expect(currentVariant(p.variants, p.marks)?.id).toBe("v1");
    s = run([{ type: "MARK", variantId: "v1", mark: "right" }], s);
    const p2 = expectPhase(s, "predicting");
    expect(currentVariant(p2.variants, p2.marks)?.id).toBe("v2");
    s = run([{ type: "MARK", variantId: "v2", mark: "wrong" }], s);
    const c = expectPhase(s, "confirmed");
    expect(c.marks).toEqual({ v1: "right", v2: "wrong" });
    expect(c.ctx.teachBackConfirmedAtMs).toBe(workMap.teachBackConfirmedAtMs ?? 7000);
  });

  it("ignores marks for unknown variants", () => {
    const s = run([{ type: "PREDICTIONS_OK", variants }], predicting());
    expect(debriefReducer(s, { type: "MARK", variantId: "nope", mark: "right" })).toBe(s);
  });

  it("ends confirmed right away when there are no variants", () => {
    expect(run([{ type: "PREDICTIONS_OK", variants: [] }], predicting()).phase).toBe("confirmed");
  });
});

describe("errors", () => {
  it("turns a failed call into an error and retries the same call", () => {
    const ending = run([{ type: "END" }]);
    const failed = run([{ type: "FAILED", op: "end", message: "API down" }], ending);
    const e = expectPhase(failed, "error");
    expect(e.message).toBe("API down");
    expect(e.canSkip).toBe(false);
    expect(pendingOp(e)).toBeNull();
    expect(debriefReducer(e, { type: "SKIP" })).toBe(e);

    const retried = run([{ type: "RETRY" }], failed);
    expect(retried).not.toBe(ending); // fresh object so the host performs the call again
    expect(pendingOp(retried)).toBe("end");
    expect(run([{ type: "END_OK", result: ended }], retried).phase).toBe("asking");
  });

  it("retries a failed answer with the same segments", () => {
    const s = run(
      [
        { type: "ANSWER", segmentIds: ["l7"] },
        { type: "FAILED", op: "answer", message: "500" },
        { type: "RETRY" },
      ],
      asking(),
    );
    expect(expectPhase(s, "asking").submitting).toEqual(["l7"]);
  });

  it("ignores a failure for a call that is not in flight", () => {
    const s = asking();
    expect(debriefReducer(s, { type: "FAILED", op: "teachback", message: "x" })).toBe(s);
  });

  it("lets the expert continue past a missing teach-back endpoint", () => {
    const s = run(
      [
        { type: "END" },
        { type: "END_OK", result: { ...ended, openQuestions: [] } },
        { type: "FAILED", op: "teachback", message: "404" },
      ],
      initialDebriefState,
    );
    expect(expectPhase(s, "error").canSkip).toBe(true);
    const skipped = expectPhase(run([{ type: "SKIP" }], s), "predicting");
    expect(skipped.ctx.teachBackConfirmedAtMs).toBeNull();
    expect(pendingOp(skipped)).toBe("predictions");

    const done = run(
      [{ type: "FAILED", op: "predictions", message: "404" }, { type: "SKIP" }],
      skipped,
    );
    const c = expectPhase(done, "confirmed");
    expect(c.variants).toEqual([]);
    expect(c.ctx.teachBackConfirmedAtMs).toBeNull();
  });
});
