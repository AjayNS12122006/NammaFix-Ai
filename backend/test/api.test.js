const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { after, before, test } = require('node:test');

const children = [];
let databaseApi;
let demoApi;
let geoServer;
let citizenToken;
let secondCitizenToken;
let adminToken;
let complaint;

async function findFreePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Backend exited before becoming ready (code ${server.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.status >= 100) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Backend did not start before the test timeout.');
}

function startBackend(port, overrides) {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      JWT_SECRET: 'test-only-secret-that-is-long-enough-for-jwt-signing',
      ADMIN_USERNAME: 'test-admin',
      ADMIN_PASSWORD: 'test-only-password',
      GNANI_API_KEY: '',
      GNANI_TTS_API_KEY: '',
      ...overrides,
    },
    stdio: 'ignore',
  });
  children.push(server);
  return server;
}

async function apiRequest(apiBase, route, options = {}) {
  return fetch(`${apiBase}${route}`, options);
}

before(async () => {
  const geoPort = await findFreePort();
  geoServer = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify([{ lat: '13.0827', lon: '80.2707' }]));
  });
  await new Promise((resolve, reject) => {
    geoServer.once('error', reject);
    geoServer.listen(geoPort, '127.0.0.1', resolve);
  });

  const databasePort = await findFreePort();
  databaseApi = `http://127.0.0.1:${databasePort}/api`;
  const databaseServer = startBackend(databasePort, { MONGO_URI: 'mongodb://127.0.0.1:1/nammafix_test' });
  await waitForServer(`${databaseApi}/health`, databaseServer);

  const demoPort = await findFreePort();
  demoApi = `http://127.0.0.1:${demoPort}/api`;
  const demoServer = startBackend(demoPort, {
    MONGO_URI: '',
    NOMINATIM_BASE_URL: `http://127.0.0.1:${geoPort}`,
  });
  await waitForServer(`${demoApi}/health`, demoServer);

  const firstUserResponse = await apiRequest(demoApi, '/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Citizen', email: 'citizen1@example.test', password: 'test-password-123', role: 'admin' }),
  });
  assert.equal(firstUserResponse.status, 201);
  citizenToken = (await firstUserResponse.json()).token;

  const secondUserResponse = await apiRequest(demoApi, '/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Other Citizen', email: 'citizen2@example.test', password: 'test-password-456' }),
  });
  assert.equal(secondUserResponse.status, 201);
  secondCitizenToken = (await secondUserResponse.json()).token;

  const adminLogin = await apiRequest(demoApi, '/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'test-only-password' }),
  });
  assert.equal(adminLogin.status, 200);
  adminToken = (await adminLogin.json()).token;
});

after(async () => {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  if (geoServer) await new Promise((resolve) => geoServer.close(resolve));
});

test('database health reports unavailable storage rather than memory mode when a Mongo URI is configured', async () => {
  const response = await apiRequest(databaseApi, '/health');
  assert.equal(response.status, 503);
  const health = await response.json();
  assert.equal(health.database.connected, false);
  assert.equal(health.mode, 'mongodb_error');
});

test('protected complaint and analytics APIs reject unauthenticated users', async () => {
  const [complaints, dashboard, citizenList] = await Promise.all([
    apiRequest(demoApi, '/admin/complaints'),
    apiRequest(demoApi, '/dashboard'),
    apiRequest(demoApi, '/citizen/complaints'),
  ]);
  assert.equal(complaints.status, 401);
  assert.equal(dashboard.status, 401);
  assert.equal(citizenList.status, 401);
});

test('signup ignores a client-supplied privileged role', async () => {
  const response = await apiRequest(demoApi, '/auth/me', {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert.equal(response.status, 200);
  const user = await response.json();
  assert.equal(user.role, 'citizen');
});

test('complaint creation validates title, location, and explicit confirmation', async () => {
  const headers = {
    Authorization: `Bearer ${citizenToken}`,
    'Content-Type': 'application/json',
  };
  const missingLocation = await apiRequest(demoApi, '/complaints', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Road damage', complaintText: 'Road damage near the bus stop.', confirmed: true }),
  });
  assert.equal(missingLocation.status, 400);
  assert.match((await missingLocation.json()).message, /Location is required/);

  const missingConfirmation = await apiRequest(demoApi, '/complaints', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Road damage',
      complaintText: 'Road damage near the bus stop.',
      location: 'Anna Nagar, Chennai',
    }),
  });
  assert.equal(missingConfirmation.status, 400);
  assert.match((await missingConfirmation.json()).message, /confirmation is required/);
});

test('citizen complaint creation preserves ownership and public tracking omits private details', async () => {
  const response = await apiRequest(demoApi, '/complaints', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${citizenToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Blocked street drain',
      complaintText: 'The storm drain is blocked near the apartment entrance.',
      category: 'Drainage Problem',
      location: '  Anna Nagar, Chennai  ',
      language: 'English',
      description: 'Water is collecting near the entrance.',
      confirmed: true,
    }),
  });
  assert.equal(response.status, 201);
  complaint = await response.json();
  assert.equal(complaint.title, 'Blocked street drain');
  assert.equal(complaint.location, '  Anna Nagar, Chennai  ');
  assert.equal(complaint.persistenceMode, 'demo-memory');
  assert.equal(complaint.locationSource, 'geocoded');

  const ownDetail = await apiRequest(demoApi, `/citizen/complaints/${complaint.ticketId}`, {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert.equal(ownDetail.status, 200);
  const privateRecord = await ownDetail.json();
  assert.equal(privateRecord.complaintText, 'The storm drain is blocked near the apartment entrance.');
  assert.equal(privateRecord.location, '  Anna Nagar, Chennai  ');

  const otherDetail = await apiRequest(demoApi, `/citizen/complaints/${complaint.ticketId}`, {
    headers: { Authorization: `Bearer ${secondCitizenToken}` },
  });
  assert.equal(otherDetail.status, 404);

  const publicTracking = await apiRequest(demoApi, `/complaints/${complaint.ticketId}`);
  assert.equal(publicTracking.status, 200);
  const publicRecord = await publicTracking.json();
  assert.equal(publicRecord.ticketId, complaint.ticketId);
  assert.equal('location' in publicRecord, false);
  assert.equal('complaintText' in publicRecord, false);
  assert.equal('description' in publicRecord, false);

  const confirmation = await apiRequest(demoApi, `/complaints/${complaint.ticketId}/confirmation`, {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert.equal(confirmation.status, 200);
  const ttsFallback = await confirmation.json();
  assert.equal(ttsFallback.generated, false);
  assert.equal(ttsFallback.audioContentType, 'text/plain');
});

test('citizen complaint list returns only records owned by the authenticated user', async () => {
  const ownList = await apiRequest(demoApi, '/citizen/complaints', {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  assert.equal(ownList.status, 200);
  const ownData = await ownList.json();
  assert.equal(ownData.total, 1);
  assert.equal(ownData.complaints[0].ticketId, complaint.ticketId);

  const otherList = await apiRequest(demoApi, '/citizen/complaints', {
    headers: { Authorization: `Bearer ${secondCitizenToken}` },
  });
  assert.equal((await otherList.json()).total, 0);

  const otherSummary = await apiRequest(demoApi, '/citizen/summary', {
    headers: { Authorization: `Bearer ${secondCitizenToken}` },
  });
  assert.deepEqual(await otherSummary.json(), { total: 0, pending: 0, inProgress: 0, resolved: 0 });
});

test('admin complaint lists remain role-protected', async () => {
  const response = await apiRequest(demoApi, '/admin/complaints', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 200);
});

test('invalid audio is rejected before contacting Gnani', async () => {
  const form = new FormData();
  form.append('audio', new Blob(['not an audio file'], { type: 'audio/webm' }), 'invalid.webm');
  form.append('language', 'Tamil');
  const response = await apiRequest(demoApi, '/complaints/transcribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${citizenToken}` },
    body: form,
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Unsupported or invalid audio/);
});

test('password changes invalidate previous citizen tokens', async () => {
  const response = await apiRequest(demoApi, '/auth/change-password', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secondCitizenToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currentPassword: 'test-password-456',
      newPassword: 'test-password-789',
    }),
  });
  assert.equal(response.status, 200);

  const oldTokenResponse = await apiRequest(demoApi, '/citizen/complaints', {
    headers: { Authorization: `Bearer ${secondCitizenToken}` },
  });
  assert.equal(oldTokenResponse.status, 401);

  const loginResponse = await apiRequest(demoApi, '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'citizen2@example.test', password: 'test-password-789' }),
  });
  assert.equal(loginResponse.status, 200);
});
