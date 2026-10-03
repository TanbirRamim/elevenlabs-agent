import {
  Container,
  getContainer,
  type OutboundHandlerContext,
  switchPort,
} from "@cloudflare/containers";

const API_PORT = 4000;
const PRESIDIO_PORT = 3000;

/** Private hostnames the API container uses for Presidio. Intercepted below, never resolved publicly. */
const PRESIDIO_HOSTS = {
  analyzer: "presidio-analyzer.internal",
  anonymizer: "presidio-anonymizer.internal",
  imageRedactor: "presidio-image-redactor.internal",
} as const;

class PresidioContainer extends Container<Env> {
  override defaultPort = PRESIDIO_PORT;
  override sleepAfter = "2h";
  override enableInternet = false;
}
export class PresidioAnalyzer extends PresidioContainer {}
export class PresidioAnonymizer extends PresidioContainer {}
export class PresidioImageRedactor extends PresidioContainer {}

const toPresidio =
  (pick: (env: Env) => DurableObjectNamespace<PresidioContainer>) =>
  (req: Request, env: unknown, _ctx: OutboundHandlerContext) =>
    getContainer(pick(env as Env)).fetch(switchPort(req, PRESIDIO_PORT));

/**
 * The Fastify API (apps/api). One named instance holds all live sessions in memory, so every
 * request goes to the same container. State that must survive a restart goes to R2.
 */
export class ApiContainer extends Container<Env> {
  override defaultPort = API_PORT;
  override sleepAfter = "2h";
  override enableInternet = true; // Claude API, ElevenLabs, R2

  static override outboundByHost = {
    [PRESIDIO_HOSTS.analyzer]: toPresidio((env) => env.PRESIDIO_ANALYZER),
    [PRESIDIO_HOSTS.anonymizer]: toPresidio((env) => env.PRESIDIO_ANONYMIZER),
    [PRESIDIO_HOSTS.imageRedactor]: toPresidio((env) => env.PRESIDIO_IMAGE_REDACTOR),
  };

  constructor(ctx: ConstructorParameters<typeof Container<Env>>[0], env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: "production",
      API_PORT: String(API_PORT),
      LOG_LEVEL: env.LOG_LEVEL,
      WEB_ORIGIN: env.WEB_ORIGIN,
      SHADOW_MODEL: env.SHADOW_MODEL,
      DEMO_FALLBACK_RULES: env.DEMO_FALLBACK_RULES,
      MOCK_AI: env.MOCK_AI,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_BUCKET: env.S3_BUCKET,
      S3_ACCESS_KEY: env.S3_ACCESS_KEY,
      S3_SECRET_KEY: env.S3_SECRET_KEY,
      PRESIDIO_ANALYZER_URL: `http://${PRESIDIO_HOSTS.analyzer}`,
      PRESIDIO_ANONYMIZER_URL: `http://${PRESIDIO_HOSTS.anonymizer}`,
      PRESIDIO_IMAGE_REDACTOR_URL: `http://${PRESIDIO_HOSTS.imageRedactor}`,
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // switchPort + fetch (not containerFetch) so WebSocket upgrades pass through.
    return getContainer(env.API, "main").fetch(switchPort(request, API_PORT));
  },
} satisfies ExportedHandler<Env>;
