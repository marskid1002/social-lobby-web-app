import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKey, getAccount } from '../src/lib/auth-store.ts';
import { isTaiwanMobile } from '../src/lib/phone.ts';

test('the provisioned trial identifier is accepted without becoming a phone or automatic account', async () => {
  assert.equal(normalizeKey('TEST1234'), 'TEST1234');
  assert.equal(normalizeKey(' test1234 '), 'TEST1234');
  assert.equal(isTaiwanMobile('TEST1234'), false);
  assert.equal(await getAccount('TEST1234'), null);
  assert.equal(normalizeKey('TEST12345'), 'TEST12345');
  assert.equal(normalizeKey('TEST9999'), 'TEST9999');
  assert.equal(normalizeKey('a001'), 'A001');
  assert.equal(normalizeKey('+886912345678'), '0912345678');
});
