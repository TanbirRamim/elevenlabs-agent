import { describe, expect, it } from "vitest";
import {
  collectAnswer,
  type DebriefLine,
  detectConfirmation,
  firstConfirmation,
  predictionSentence,
} from "./speech";

const agent = (id: string, text = "…"): DebriefLine => ({ id, role: "agent", text });
const user = (id: string, text = "…"): DebriefLine => ({ id, role: "user", text });

describe("collectAnswer", () => {
  it("collects expert lines until Shadow speaks again", () => {
    const lines = [user("l0"), agent("l1"), user("l2"), user("l3"), agent("l4"), user("l5")];
    expect(collectAnswer(lines, 1)).toEqual({
      segmentIds: ["l2", "l3"],
      complete: true,
      endIndex: 4,
    });
  });

  it("is incomplete while the expert is still the last speaker", () => {
    const lines = [agent("l1"), user("l2")];
    expect(collectAnswer(lines, 0)).toEqual({ segmentIds: ["l2"], complete: false, endIndex: -1 });
  });

  it("ignores Shadow lines before the answer starts", () => {
    const lines = [agent("l1"), agent("l2")];
    expect(collectAnswer(lines, 0)).toEqual({ segmentIds: [], complete: false, endIndex: -1 });
  });

  it("skips lines that were never sent to the API", () => {
    const lines = [agent("l1"), user("l2"), user("l3"), agent("l4")];
    const sent = new Set(["l3"]);
    expect(collectAnswer(lines, 0, (id) => sent.has(id)).segmentIds).toEqual(["l3"]);
  });
});

describe("detectConfirmation", () => {
  it.each([
    "Yes, that's how it works.",
    "Yeah exactly",
    "That's right.",
    "Correct.",
    "Yep, spot on",
  ])("hears yes in %j", (text) => {
    expect(detectConfirmation(text)).toBe("yes");
  });

  it.each([
    "No, above 500 euros it goes to Legal.",
    "Not quite.",
    "That's not right, it's Security.",
    "Yes, but only for business accounts.",
    "Actually it's the other way round.",
    "Let me correct that one detail.",
    "Wrong.",
  ])("hears no in %j", (text) => {
    expect(detectConfirmation(text)).toBe("no");
  });

  it("returns null for lines that are neither", () => {
    expect(detectConfirmation("Hmm, let me think about the chargeback part.")).toBeNull();
  });

  it("finds the first yes/no among the expert's lines", () => {
    const lines = [agent("a", "Is that right?"), user("b", "Hmm."), user("c", "Yes it is.")];
    expect(firstConfirmation(lines, 0)).toEqual({ answer: "yes", index: 2 });
    expect(firstConfirmation(lines, 0, (id) => id !== "c")).toBeNull();
  });
});

describe("predictionSentence", () => {
  it("states the prediction, the outcome and the step", () => {
    const sentence = predictionSentence(
      {
        id: "v1",
        description: "T3 without the chargeback tag.",
        predictedOutcome: "refund",
        becauseStepId: "S2",
      },
      0,
      2,
      "Check for a chargeback",
    );
    expect(sentence).toBe(
      'Prediction 1 of 2: T3 without the chargeback tag. I would refund it, because of the step "Check for a chargeback". Is that right or wrong?',
    );
  });
});
