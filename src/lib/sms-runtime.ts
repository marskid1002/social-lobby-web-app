import type { FlowTraceEvent } from './flow-trace-store';

export type SmsRuntimeStatus = {
  state: 'no_data' | 'healthy' | 'degraded';
  attempts24h: number;
  failures24h: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureCode?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeSmsRuntime(
  events: FlowTraceEvent[],
  now = Date.now(),
): SmsRuntimeStatus {
  const smsEvents = events
    .filter((event) => event.eventType === 'sms.otp')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const recent = smsEvents.filter((event) => {
    const createdAt = Date.parse(event.createdAt);
    return Number.isFinite(createdAt) && createdAt >= now - DAY_MS && createdAt <= now;
  });
  const last = smsEvents[0];
  const lastSuccess = smsEvents.find((event) => event.outcome === 'success');
  const lastFailure = smsEvents.find((event) => event.outcome === 'failure');
  return {
    state: !last ? 'no_data' : last.outcome === 'failure' ? 'degraded' : 'healthy',
    attempts24h: recent.length,
    failures24h: recent.filter((event) => event.outcome === 'failure').length,
    ...(last ? { lastAttemptAt: last.createdAt } : {}),
    ...(lastSuccess ? { lastSuccessAt: lastSuccess.createdAt } : {}),
    ...(lastFailure ? {
      lastFailureAt: lastFailure.createdAt,
      ...(lastFailure.code ? { lastFailureCode: lastFailure.code } : {}),
    } : {}),
  };
}
