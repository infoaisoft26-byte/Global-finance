import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/usdt-bep20-deposit.js';

test('legacy self-service auto-credit route is retired', () => {
  const headers = {};
  let body;
  const res = { setHeader: (key, value) => { headers[key] = value; }, end: value => { body = JSON.parse(value); } };
  handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 410);
  assert.match(body.error, /reviewed/);
  assert.equal(headers['Cache-Control'], 'no-store');
});
