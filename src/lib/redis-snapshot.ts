// Compare inside Redis so unchanged collections never cross the network.
// This also detects legacy/direct writers without relying on invalidation hooks.
export const SNAPSHOT_SCRIPT = `
local value
if ARGV[1] == 'hash' then
  local flat = redis.call('HGETALL', KEYS[1])
  local keys = {}
  local fields = {}
  for i = 1, #flat, 2 do
    table.insert(keys, flat[i])
    fields[flat[i]] = flat[i + 1]
  end
  table.sort(keys)
  value = {}
  for _, key in ipairs(keys) do
    table.insert(value, key)
    table.insert(value, fields[key])
  end
  value = cjson.encode(value)
else
  value = redis.call('GET', KEYS[1]) or 'null'
end
local revision = redis.sha1hex(value)
if revision == ARGV[2] then return {revision} end
return {revision, value}
`;

type RedisReader = { eval: (script: string, keys: string[], args: string[]) => Promise<unknown> };
type Entry = { revision: string; json: string };

export function createSnapshotReader() {
  const cache = new Map<string, Entry>();
  let bytes = 0;
  return async function read(redis: RedisReader, key: string, kind: 'hash' | 'string', namespace = ''): Promise<unknown> {
    const cacheKey = `${namespace}:${kind}:${key}`;
    const previous = cache.get(cacheKey);
    const result = await redis.eval(SNAPSHOT_SCRIPT, [key], [kind, previous?.revision ?? '']) as unknown[];
    if (!Array.isArray(result) || typeof result[0] !== 'string') throw new Error('Invalid Redis snapshot');
    let entry: Entry;
    if (result.length === 1) {
      if (!previous || previous.revision !== result[0]) throw new Error('Missing Redis snapshot');
      entry = previous;
    } else {
      // Upstash may automatically deserialize JSON strings in EVAL results.
      const json = typeof result[1] === 'string' ? result[1] : JSON.stringify(result[1]);
      JSON.parse(json); // Validate before caching; failures must never return stale data.
      entry = { revision: result[0], json };
      bytes -= cache.get(cacheKey)?.json.length ?? 0;
      cache.delete(cacheKey);
      if (json.length <= 8_000_000) {
        cache.set(cacheKey, entry);
        bytes += json.length;
      }
      while (cache.size > 64 || bytes > 8_000_000) {
        const oldest = cache.keys().next().value!;
        bytes -= cache.get(oldest)!.json.length;
        cache.delete(oldest);
      }
    }
    // Callers modify accounts/retention records; never share mutable cache objects.
    const value = JSON.parse(entry.json);
    if (kind === 'string') return value;
    const fields: Record<string, unknown> = {};
    for (let i = 0; i < value.length; i += 2) fields[value[i]] = value[i + 1];
    return fields;
  };
}

const read = createSnapshotReader();
export function readRedisSnapshot(redis: RedisReader, key: string, kind: 'hash' | 'string') {
  return read(redis, key, kind, process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '');
}
