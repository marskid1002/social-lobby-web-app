import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSnapshotReader } from '../src/lib/redis-snapshot.ts';

function fixture() {
  const values = new Map();
  const sizes = [];
  let fail = false;
  return { values, sizes, setFail: () => { fail = true; }, redis: {
    async eval(_script, [key], [kind, previous]) {
      if (fail) throw new Error('unavailable');
      const value = values.get(key) ?? (kind === 'hash' ? [] : null);
      const json = JSON.stringify(value);
      const rev = createHash('sha1').update(json).digest('hex');
      const result = previous === rev ? [rev] : [rev, value];
      sizes.push(JSON.stringify(result).length);
      return result;
    },
  } };
}

test('unchanged large collections transfer only a digest; direct edits and deletes are detected', async () => {
  const f = fixture(); const read = createSnapshotReader();
  f.values.set('messages', ['a', JSON.stringify({ id: 'a', text: 'x'.repeat(100_000) })]);
  const first = await read(f.redis, 'messages', 'hash');
  assert.deepEqual(await read(f.redis, 'messages', 'hash'), first);
  assert.ok(f.sizes[0] > 100_000);
  assert.ok(f.sizes[1] < 100);
  f.values.set('messages', ['b', JSON.stringify({ id: 'b' })]);
  assert.deepEqual(await read(f.redis, 'messages', 'hash'), { b: '{"id":"b"}' });
  f.values.delete('messages');
  assert.deepEqual(await read(f.redis, 'messages', 'hash'), {});
});

test('account snapshots are isolated from caller mutations; disabled accounts refresh immediately', async () => {
  const f = fixture(); const read = createSnapshotReader();
  f.values.set('accounts', { A: { disabled: false } });
  const a = await read(f.redis, 'accounts', 'string'); a.A.disabled = true;
  assert.equal((await read(f.redis, 'accounts', 'string')).A.disabled, false);
  f.values.set('accounts', { A: { disabled: true } });
  assert.equal((await read(f.redis, 'accounts', 'string')).A.disabled, true);
  f.setFail();
  await assert.rejects(read(f.redis, 'accounts', 'string'), /unavailable/);
});

test('cache eviction and cold starts fetch a full snapshot safely', async () => {
  const f = fixture(); const read = createSnapshotReader();
  for (let i = 0; i < 70; i++) { f.values.set(`k${i}`, { i }); await read(f.redis, `k${i}`, 'string'); }
  assert.deepEqual(await read(f.redis, 'k0', 'string'), { i: 0 });
  assert.deepEqual(await createSnapshotReader()(f.redis, 'k0', 'string'), { i: 0 });
});
