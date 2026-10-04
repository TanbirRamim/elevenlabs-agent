import {
  AgentExport,
  ApiError,
  CopilotRun,
  CopilotRunRequest,
  CreateSessionRequest,
  CreateSessionResponse,
  DebriefAnswerRequest,
  DebriefStatus,
  EndSessionResponse,
  GuardVerdict,
  Id,
  LearnerPrediction,
  LearnerPredictionResult,
  MasteryReport,
  PendingAction,
  PredictionVariants,
  TeachBackConfirmRequest,
  TeachBackConfirmResponse,
  TeachBackResponse,
  TicketSet,
  TicketsResponse,
  WorkMap,
  WorkMapPatch,
} from "@shadow/schema";
import { z } from "zod";
import { publicEnv } from "../env";
import { WAKE_STATUSES, type WaitOptions, waitForApi } from "./wake";

/**
 * Typed client for every REST route in `packages/schema/src/api.ts`.
 * Every response is parsed with its schema; anything that isn't a 2xx with the
 * documented shape throws an `ApiClientError`. All HTTP from the web app goes through here.
 */

export type TicketSetName = z.infer<typeof TicketSet>;
export type CreateSessionInput = z.input<typeof CreateSessionRequest>;
export type DebriefAnswerInput = z.input<typeof DebriefAnswerRequest>;
export type TeachBackText = z.infer<typeof TeachBackResponse>;
export type TeachBackConfirmInput = z.input<typeof TeachBackConfirmRequest>;
export type TeachBackConfirmResult = z.infer<typeof TeachBackConfirmResponse>;
export type PredictionVariantsResponse = z.infer<typeof PredictionVariants>;
export type WorkMapPatchInput = z.input<typeof WorkMapPatch>;
export type LearnerPredictionInput = z.input<typeof LearnerPrediction>;
export type LearnerPredictionResponse = z.infer<typeof LearnerPredictionResult>;

/** `POST /workmaps/:id/publish -> { id }` (documented as a comment, not a schema, in api.ts). */
export const PublishWorkMapResponse = z.object({ id: Id });
export type PublishWorkMapResponse = z.infer<typeof PublishWorkMapResponse>;

/** `PUT /sessions/:id/recording` and `GET /sessions/:id/recording` carry this media type. */
export const RECORDING_CONTENT_TYPE = "video/webm";

export type ApiClientErrorKind = "http" | "invalid_response" | "network";

export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  /** HTTP status of the response; 0 when no response arrived. */
  readonly status: number;
  readonly method: string;
  readonly path: string;
  /** The parsed `ApiError` body when the API sent one. */
  readonly body: ApiError | undefined;
  /** Zod issues when the body failed validation. */
  readonly issues: z.core.$ZodIssue[] | undefined;

  constructor(
    kind: ApiClientErrorKind,
    args: {
      status: number;
      method: string;
      path: string;
      body?: ApiError;
      issues?: z.core.$ZodIssue[];
      cause?: unknown;
    },
  ) {
    const detail =
      args.body?.message ?? args.body?.code ?? (kind === "http" ? "request failed" : kind);
    super(`${args.method} ${args.path} -> ${args.status}: ${detail}`, { cause: args.cause });
    this.name = "ApiClientError";
    this.kind = kind;
    this.status = args.status;
    this.method = args.method;
    this.path = args.path;
    this.body = args.body;
    this.issues = args.issues;
  }

  /** The API's error code, when it sent one. */
  get code(): string | undefined {
    return this.body?.code;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** Defaults to `publicEnv.apiUrl`. */
  baseUrl?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** How long to wait for a sleeping API to wake (tests shorten it). */
  wait?: WaitOptions;
}

type Method = "GET" | "POST" | "PUT" | "PATCH";

interface RequestSpec<T> {
  method: Method;
  path: string;
  /** JSON body (already validated) or raw bytes with their content type. */
  body?: { json: unknown } | { blob: Blob; contentType: string };
  /** How to read the response: JSON parsed with `schema`, text, or nothing (204). */
  response: { kind: "json"; schema: z.ZodType<T> } | { kind: "text" } | { kind: "none" };
  /** Extra request headers (e.g. `x-shadow-session`). */
  headers?: Record<string, string>;
}

const seg = (id: string): string => encodeURIComponent(Id.parse(id));

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? publicEnv.apiUrl).replace(/\/+$/, "");
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(spec: RequestSpec<T>): Promise<T> {
    const { method, path } = spec;
    const headers: Record<string, string> = {
      ...spec.headers,
      accept: "application/json, text/*",
    };
    let body: BodyInit | undefined;
    if (spec.body && "json" in spec.body) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(spec.body.json);
    } else if (spec.body) {
      headers["content-type"] = spec.body.contentType;
      body = spec.body.blob;
    }

    const send = () => fetchImpl(`${baseUrl}${path}`, { method, headers, body });
    let res: Response;
    try {
      res = await send();
    } catch (cause) {
      // A sleeping or redeploying host refuses connections for up to a minute: wait, then retry once.
      if (!(await waitForApi(baseUrl, options.wait))) {
        throw new ApiClientError("network", { status: 0, method, path, cause });
      }
      try {
        res = await send();
      } catch (retryCause) {
        throw new ApiClientError("network", { status: 0, method, path, cause: retryCause });
      }
    }
    if (WAKE_STATUSES.has(res.status) && (await waitForApi(baseUrl, options.wait))) {
      try {
        res = await send();
      } catch (cause) {
        throw new ApiClientError("network", { status: 0, method, path, cause });
      }
    }

    if (!res.ok) {
      throw new ApiClientError("http", {
        status: res.status,
        method,
        path,
        body: await readApiError(res),
      });
    }

    switch (spec.response.kind) {
      case "none":
        return undefined as T;
      case "text": {
        const text = await res.text().catch(() => undefined);
        if (typeof text !== "string") {
          throw new ApiClientError("invalid_response", { status: res.status, method, path });
        }
        return text as T;
      }
      case "json": {
        let raw: unknown;
        try {
          raw = await res.json();
        } catch (cause) {
          throw new ApiClientError("invalid_response", { status: res.status, method, path, cause });
        }
        const parsed = spec.response.schema.safeParse(raw);
        if (!parsed.success) {
          throw new ApiClientError("invalid_response", {
            status: res.status,
            method,
            path,
            issues: parsed.error.issues,
          });
        }
        return parsed.data;
      }
    }
  }

  const json = <T>(schema: z.ZodType<T>): RequestSpec<T>["response"] => ({ kind: "json", schema });

  return {
    /** `GET /tickets?set=expert|new_hire|held_out` */
    getTickets: async (set: TicketSetName): Promise<TicketsResponse> =>
      request({
        method: "GET",
        path: `/tickets?set=${encodeURIComponent(TicketSet.parse(set))}`,
        response: json(TicketsResponse),
      }),

    /** `POST /sessions` */
    createSession: async (body: CreateSessionInput): Promise<CreateSessionResponse> =>
      request({
        method: "POST",
        path: "/sessions",
        body: { json: CreateSessionRequest.parse(body) },
        response: json(CreateSessionResponse),
      }),

    /** `POST /sessions/:id/end` builds the draft map and returns what the debrief must ask. */
    endSession: async (sessionId: string): Promise<EndSessionResponse> =>
      request({
        method: "POST",
        path: `/sessions/${seg(sessionId)}/end`,
        response: json(EndSessionResponse),
      }),

    /** `POST /sessions/:id/debrief/answer` */
    answerDebrief: async (sessionId: string, body: DebriefAnswerInput): Promise<DebriefStatus> =>
      request({
        method: "POST",
        path: `/sessions/${seg(sessionId)}/debrief/answer`,
        body: { json: DebriefAnswerRequest.parse(body) },
        response: json(DebriefStatus),
      }),

    /** `POST /sessions/:id/teachback` returns the text for the agent to read back. */
    requestTeachBack: async (sessionId: string): Promise<TeachBackText> =>
      request({
        method: "POST",
        path: `/sessions/${seg(sessionId)}/teachback`,
        response: json(TeachBackResponse),
      }),

    /** `POST /sessions/:id/teachback/confirm` */
    confirmTeachBack: async (
      sessionId: string,
      body: TeachBackConfirmInput,
    ): Promise<TeachBackConfirmResult> =>
      request({
        method: "POST",
        path: `/sessions/${seg(sessionId)}/teachback/confirm`,
        body: { json: TeachBackConfirmRequest.parse(body) },
        response: json(TeachBackConfirmResponse),
      }),

    /** `GET /workmaps/:id` */
    getWorkMap: async (workMapId: string): Promise<WorkMap> =>
      request({
        method: "GET",
        path: `/workmaps/${seg(workMapId)}`,
        response: json(WorkMap),
      }),

    /** `PATCH /workmaps/:id` (expert deletes steps or guardrails) */
    patchWorkMap: async (workMapId: string, body: WorkMapPatchInput): Promise<WorkMap> =>
      request({
        method: "PATCH",
        path: `/workmaps/${seg(workMapId)}`,
        body: { json: WorkMapPatch.parse(body) },
        response: json(WorkMap),
      }),

    /** `POST /workmaps/:id/publish -> { id }` */
    publishWorkMap: async (workMapId: string): Promise<PublishWorkMapResponse> =>
      request({
        method: "POST",
        path: `/workmaps/${seg(workMapId)}/publish`,
        response: json(PublishWorkMapResponse),
      }),

    /** `GET /workmaps/published` returns the latest published map. */
    getPublishedWorkMap: async (): Promise<WorkMap> =>
      request({ method: "GET", path: "/workmaps/published", response: json(WorkMap) }),

    /** `GET /workmaps/:id/markdown` returns `text/markdown` for the tutor's knowledge base. */
    getWorkMapMarkdown: async (workMapId: string): Promise<string> =>
      request({
        method: "GET",
        path: `/workmaps/${seg(workMapId)}/markdown`,
        response: { kind: "text" },
      }),

    /** `POST /workmaps/:id/predictions` returns the variants the apprentice predicts. */
    getPredictionVariants: async (workMapId: string): Promise<PredictionVariantsResponse> =>
      request({
        method: "POST",
        path: `/workmaps/${seg(workMapId)}/predictions`,
        response: json(PredictionVariants),
      }),

    /** `POST /sessions/:id/predictions` records the learner's answer to a `[PREDICT]`. */
    submitLearnerPrediction: async (
      sessionId: string,
      body: LearnerPredictionInput,
    ): Promise<LearnerPredictionResponse> =>
      request({
        method: "POST",
        path: `/sessions/${seg(sessionId)}/predictions`,
        body: { json: LearnerPrediction.parse(body) },
        response: json(LearnerPredictionResult),
      }),

    /** `GET /sessions/:id/mastery` */
    getMastery: async (sessionId: string): Promise<MasteryReport> =>
      request({
        method: "GET",
        path: `/sessions/${seg(sessionId)}/mastery`,
        response: json(MasteryReport),
      }),

    /**
     * `POST /guard/presave` evaluates a pending DeskSim action before it is saved. With a
     * `sessionId` (teach mode) the verdict is recorded on that session for the mastery report;
     * it goes in the `x-shadow-session` header so the URL stays the same.
     */
    preSave: async (action: PendingAction, sessionId?: string): Promise<GuardVerdict> =>
      request({
        method: "POST",
        path: "/guard/presave",
        body: { json: PendingAction.parse(action) },
        response: json(GuardVerdict),
        ...(sessionId ? { headers: { "x-shadow-session": Id.parse(sessionId) } } : {}),
      }),

    /** `GET /workmaps/:id/export?format=agent` (id may be "published") -> the map as a policy. */
    getAgentExport: async (workMapId: string): Promise<AgentExport> =>
      request({
        method: "GET",
        path: `/workmaps/${seg(workMapId)}/export?format=agent`,
        response: json(AgentExport),
      }),

    /** `POST /copilot/run` runs the map (id may be "published") over the held-out tickets. */
    runCopilot: async (workMapId: string): Promise<CopilotRun> =>
      request({
        method: "POST",
        path: "/copilot/run",
        body: { json: CopilotRunRequest.parse({ workMapId }) },
        response: json(CopilotRun),
      }),

    /** `PUT /sessions/:id/recording` (body `video/webm`) -> 204 */
    uploadRecording: async (sessionId: string, recording: Blob): Promise<void> =>
      request({
        method: "PUT",
        path: `/sessions/${seg(sessionId)}/recording`,
        body: { blob: recording, contentType: RECORDING_CONTENT_TYPE },
        response: { kind: "none" },
      }),

    /** `GET /sessions/:id/recording` as a URL for `<video src>`; the API supports Range requests. */
    recordingUrl: (sessionId: string): string => `${baseUrl}/sessions/${seg(sessionId)}/recording`,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Reads the documented `ApiError` body from a non-2xx response, if there is one. */
async function readApiError(res: Response): Promise<ApiError | undefined> {
  const raw: unknown = await res.json().catch(() => undefined);
  const parsed = ApiError.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** The default client, bound to `publicEnv.apiUrl` and the global `fetch`. */
export const api: ApiClient = createApiClient();

export const {
  getTickets,
  createSession,
  endSession,
  answerDebrief,
  requestTeachBack,
  confirmTeachBack,
  getWorkMap,
  patchWorkMap,
  publishWorkMap,
  getPublishedWorkMap,
  getWorkMapMarkdown,
  getPredictionVariants,
  submitLearnerPrediction,
  getMastery,
  preSave,
  getAgentExport,
  runCopilot,
  uploadRecording,
  recordingUrl,
} = api;
