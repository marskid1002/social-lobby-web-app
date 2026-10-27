/** One request in flight and a short start-to-start cooldown for repeated UI events. */
export function coalescedSync(read: () => Promise<void>, now = Date.now) {
  let inFlight: Promise<void> | null = null;
  let lastStartedAt = -Infinity;
  return function run(): Promise<void> {
    if (inFlight) return inFlight;
    if (now() - lastStartedAt < 1000) return Promise.resolve();
    lastStartedAt = now();
    inFlight = Promise.resolve().then(read).finally(() => { inFlight = null; });
    return inFlight;
  };
}
