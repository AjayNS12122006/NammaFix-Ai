const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { after, before, test } = require('node:test');

let port;
let baseUrl;
let server;

before(async () => {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  baseUrl = `http://127.0.0.1:${port}/api`;

  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      JWT_SECRET: 'test-only-secret-that-is-long-enough-for-jwt-signing',
      ADMIN_USERNAME: 'test-admin',
      ADMIN_PASSWORD: 'test-only-password',
      MONGO_URI: 'mongodb://127.0.0.1:1/nammafix_test',
    },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Backend exited before becoming ready (code ${server.exitCode}).`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200 || response.status === 503) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Backend did not start before the test timeout.');
});

after(() => {
  if (server && server.exitCode === null) server.kill();
});

test('database health reports unavailable storage in the isolated test server', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 503);
  const health = await response.json();
  assert.equal(health.database.connected, false);
  assert.equal(health.mode, 'mongodb_error');
});

test('complaint and analytics lists require admin authorization', async () => {
  const [complaints, dashboard] = await Promise.all([
    fetch(`${baseUrl}/complaints`),
    fetch(`${baseUrl}/dashboard`),
  ]);
  assert.equal(complaints.status, 401);
  assert.equal(dashboard.status, 401);
});

test('complaint creation rejects a missing location before persistence', async () => {
  const response = await fetch(`${baseUrl}/complaints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ complaintText: 'Road damage near the bus stop.' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Location is required/);
});

test('transcription rejects invalid audio without contacting Gnani', async () => {
  const form = new FormData();
  form.append('audio', new Blob(['not an audio file'], { type: 'audio/webm' }), 'invalid.webm');
  form.append('language', 'Tamil');
  const response = await fetch(`${baseUrl}/complaints/transcribe`, {
    method: 'POST',
    body: form,
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Unsupported or invalid audio/);
});
