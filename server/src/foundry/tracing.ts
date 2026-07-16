import { trace, context, SpanStatusCode, type Span } from '@opentelemetry/api';

let initialized = false;

/**
 * Initialise platform tracing/observability.
 *
 * When APPLICATIONINSIGHTS_CONNECTION_STRING is set, agent runs, tool calls and
 * model latency are exported to Application Insights and surface in the Foundry
 * portal (Agents ▸ Traces). OpenTelemetry spans we create below are correlated
 * into the same trace so a demo walkthrough shows the full pipeline end-to-end.
 */
export function initTracing(): void {
  if (initialized) return;
  initialized = true;

  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    console.log('[tracing] APPLICATIONINSIGHTS_CONNECTION_STRING not set — using local spans only.');
    return;
  }

  try {
    // Lazy require so the app still boots if the monitor package is absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAzureMonitor } = require('@azure/monitor-opentelemetry');
    useAzureMonitor({
      azureMonitorExporterOptions: { connectionString },
      instrumentationOptions: {
        http: { enabled: true },
      },
    });
    // Opt in to recording prompt/response content on Foundry agent spans.
    process.env.AZURE_TRACING_GEN_AI_CONTENT_RECORDING_ENABLED = 'true';
    console.log('[tracing] Azure Monitor OpenTelemetry enabled — exporting to Application Insights.');
  } catch (err) {
    console.warn('[tracing] Failed to initialise Azure Monitor; continuing with local spans only.', err);
  }
}

const tracer = trace.getTracer('kyc-foundry-orchestrator');

/**
 * Run `fn` inside a span named `name`. Records attributes, marks errors, and
 * returns whatever `fn` resolves to. The active span is passed to `fn` so it can
 * attach step-specific attributes (agent name, case id, tool calls, …).
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Returns the W3C trace id of the currently active span, if any (for demo walkthrough links). */
export function currentTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  const id = span?.spanContext().traceId;
  return id && id !== '00000000000000000000000000000000' ? id : undefined;
}
