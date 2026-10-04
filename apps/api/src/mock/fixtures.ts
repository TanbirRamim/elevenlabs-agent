import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findSeedDir } from "@shadow/guard/fixtures";
import { CandidateQuestion, EndSessionResponse, MasteryReport, WorkMap } from "@shadow/schema";
import { z } from "zod";

const QuestionsFixture = z.record(z.string(), CandidateQuestion);

/**
 * Loads and validates every MOCK_AI fixture once, at boot. A fixture that
 * drifts from its schema fails the boot loudly instead of surprising Tanbir.
 */
export function loadMockFixtures(dir = join(findSeedDir(), "fixtures")) {
  const read = (file: string): unknown => JSON.parse(readFileSync(join(dir, file), "utf8"));
  return {
    questions: QuestionsFixture.parse(read("questions.json")),
    endSession: EndSessionResponse.parse(read("end-session.json")),
    workMap: WorkMap.parse(read("workmap.json")),
    mastery: MasteryReport.parse(read("mastery.json")),
  };
}

export type MockFixtures = ReturnType<typeof loadMockFixtures>;
