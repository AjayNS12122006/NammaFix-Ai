const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'nammafix-demo-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const GNANI_API_KEY = process.env.GNANI_API_KEY || '';
const GNANI_TTS_API_KEY = process.env.GNANI_TTS_API_KEY || GNANI_API_KEY;
const GNANI_STT_URL = process.env.GNANI_API_URL || 'https://api.vachana.ai/stt/v3';
const GNANI_TTS_URL = process.env.GNANI_TTS_API_URL || 'https://api.vachana.ai/api/v1/tts/inference';
const GNANI_TIMEOUT_MS = Number(process.env.GNANI_TIMEOUT_MS || 25000);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Resolved'];
const URGENCY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];

function normalizeStatus(status) {
  const value = (status || '').trim();
  if (!value) return 'Pending';
  const normalized = value.toLowerCase();
  if (normalized.includes('in progress')) return 'In Progress';
  if (normalized.includes('progress')) return 'In Progress';
  if (normalized.includes('resolved')) return 'Resolved';
  if (normalized.includes('pending')) return 'Pending';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeUrgency(value) {
  const normalized = (value || '').trim();
  if (!normalized) return 'Medium';
  const next = normalized.toLowerCase();
  if (next.includes('critical')) return 'Critical';
  if (next.includes('high')) return 'High';
  if (next.includes('medium')) return 'Medium';
  if (next.includes('low')) return 'Low';
  return 'Medium';
}

function buildTimeline(status, note) {
  return {
    status: normalizeStatus(status),
    note: note || `Status updated to ${normalizeStatus(status)}`,
    timestamp: new Date().toISOString(),
  };
}

function generateTicketId() {
  const prefix = 'NF';
  const stamp = new Date().toISOString().slice(2, 10).replace(/[-:T]/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${randomPart}`;
}

function deriveDemoCoordinates(location) {
  const target = (location || 'Chennai, Tamil Nadu').toLowerCase();
  let hash = 0;
  for (let i = 0; i < target.length; i += 1) {
    hash = target.charCodeAt(i) + ((hash << 5) - hash);
  }
  const baseLat = 13.0827;
  const baseLng = 80.2707;
  const latOffset = ((hash % 500) - 250) / 10000;
  const lngOffset = (((hash * 7) % 600) - 300) / 10000;
  return [Number((baseLat + latOffset).toFixed(5)), Number((baseLng + lngOffset).toFixed(5))];
}

function determineUrgency(text) {
  const value = (text || '').toLowerCase();
  if (
    value.includes('burst') ||
    value.includes('flood') ||
    value.includes('road collapse') ||
    value.includes('electrocution') ||
    value.includes('leakage') ||
    value.includes('வெடிப்பு') ||
    value.includes('சிக்கல்') && value.includes('மிக') ||
    value.includes('மிகவும்') && value.includes('அவசரம்')
  ) {
    return 'Critical';
  }

  if (
    value.includes('damaged') ||
    value.includes('blocked') ||
    value.includes('garbage') ||
    value.includes('road') ||
    value.includes('drainage') ||
    value.includes('broken') ||
    value.includes('குப்பை') ||
    value.includes('சாலை') ||
    value.includes('வடிகால்') ||
    value.includes('கசிவு')
  ) {
    return 'High';
  }

  if (
    value.includes('minor') ||
    value.includes('small') ||
    value.includes('light') ||
    value.includes('slow') ||
    value.includes('மிதமான') ||
    value.includes('சிறிய')
  ) {
    return 'Medium';
  }

  return 'Low';
}

function classifyComplaint(text) {
  const input = (text || '').toLowerCase();
  const rules = {
    'Garbage Collection': ['garbage', 'trash', 'waste', 'dump', 'bin', 'solid waste', 'litter', 'kuppai', 'குப்பை', 'கழிவு', 'அசுத்தம்', 'தூசு', 'dump yard'],
    'Water Leakage': ['water leak', 'leakage', 'pipe burst', 'water pipe', 'water problem', 'dripping', 'moisture', 'நீர்', 'கசிவு', 'பைப்பு', 'water', 'pipe'],
    'Road Damage': ['road', 'pothole', 'damaged road', 'crack', 'surface', 'lane', 'bus stand', 'சாலை', 'பாதை', 'துளை', 'road damage'],
    'Drainage Problem': ['drainage', 'blocked drain', 'sewer', 'stagnant water', 'water logging', 'drain', 'வடிகால்', 'கழிவுநீர்', 'சாக்கடை', 'drain blocked'],
    'Electricity Problem': ['electricity', 'power cut', 'electrical', 'transformer', 'line issue', 'power outage', 'live wire', 'mains', 'மின்சாரம்', 'கம்பி', 'transformer'],
    'Streetlight Problem': ['streetlight', 'street light', 'lamp post', 'light not working', 'dark street', 'street lamp', 'சாலை விளக்கு', 'விளக்கு', 'லைட்', 'lamp'],
    'Public Sanitation': ['toilet', 'sanitation', 'public toilet', 'restroom', 'cleanliness', 'hygiene', 'smell', 'public sanitation', 'சுகாதாரம்', 'கழிப்பறை', 'மலம்', 'sani'],
  };

  const matches = [];
  for (const [category, keywords] of Object.entries(rules)) {
    const matchedKeyword = keywords.find((keyword) => input.includes(keyword.toLowerCase()));
    if (matchedKeyword) {
      matches.push({ category, keyword: matchedKeyword });
    }
  }

  if (!matches.length) {
    return {
      category: 'Other',
      confidence: 0.35,
      explanation: 'No clear keyword match found. Marked as Other for manual review.',
      urgency: determineUrgency(text),
    };
  }

  const bestMatch = matches[0];
  const confidence = Math.min(0.97, 0.6 + bestMatch.keyword.length / 30);
  return {
    category: bestMatch.category,
    confidence: Number(confidence.toFixed(2)),
    explanation: `Matched keyword: "${bestMatch.keyword}" using a transparent rule-based classifier.`,
    urgency: determineUrgency(text),
  };
}

const inMemoryUsers = [];

const inMemoryComplaints = [
  {
    ticketId: 'NF-2025-001',
    complaintText: 'குப்பை கழிவு தெருவில் தேங்கியிருக்கிறது, அருகில் உள்ள தெரு மிகவும் அசுத்தமாக உள்ளது.',
    category: 'Garbage Collection',
    location: 'Anna Nagar, Chennai',
    coordinates: deriveDemoCoordinates('Anna Nagar, Chennai'),
    language: 'Tamil',
    urgency: 'High',
    status: 'Pending',
    description: 'Garbage pile blocking footpath and causing hygiene concerns.',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    source: 'demo',
    isSample: true,
    adminRemarks: '',
    classificationReason: 'Matched keyword: "குப்பை" using a transparent rule-based classifier.',
    timeline: [
      { status: 'Pending', note: 'Sample complaint created for dashboard preview.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() },
    ],
  },
  {
    ticketId: 'NF-2025-002',
    complaintText: 'Water leakage is visible near the bus stand and road is getting flooded.',
    category: 'Water Leakage',
    location: 'T Nagar, Chennai',
    coordinates: deriveDemoCoordinates('T Nagar, Chennai'),
    language: 'English',
    urgency: 'Critical',
    status: 'In Progress',
    description: 'Pipeline burst near bus stand causing puddling and traffic concerns.',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    source: 'demo',
    isSample: true,
    adminRemarks: 'Utility team assigned to inspect the burst line.',
    classificationReason: 'Matched keyword: "leakage" using a transparent rule-based classifier.',
    timeline: [
      { status: 'Pending', note: 'Sample complaint created for dashboard preview.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() },
      { status: 'In Progress', note: 'Utility team assigned.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    ],
  },
  {
    ticketId: 'NF-2025-003',
    complaintText: 'Road damaged near bus stop and many potholes are dangerous.',
    category: 'Road Damage',
    location: 'Velachery, Chennai',
    coordinates: deriveDemoCoordinates('Velachery, Chennai'),
    language: 'Tanglish',
    urgency: 'High',
    status: 'Resolved',
    description: 'Potholes reported near bus stop after recent rain.',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    source: 'demo',
    isSample: true,
    adminRemarks: 'Road patched and public safety inspection completed.',
    classificationReason: 'Matched keyword: "road" using a transparent rule-based classifier.',
    timeline: [
      { status: 'Pending', note: 'Sample complaint created for dashboard preview.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString() },
      { status: 'Resolved', note: 'Road patching completed.', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() },
    ],
  },
];

const complaintSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true, index: true },
    complaintText: { type: String, required: true },
    category: { type: String, required: true },
    location: { type: String, required: true },
    coordinates: { type: [Number], default: [] },
    language: { type: String, default: 'English' },
    urgency: { type: String, default: 'Medium' },
    status: { type: String, default: 'Pending' },
    description: { type: String, default: '' },
    source: { type: String, default: 'voice' },
    isSample: { type: Boolean, default: false },
    adminRemarks: { type: String, default: '' },
    classificationReason: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
    timeline: [{ status: String, note: String, timestamp: Date }],
  },
  { timestamps: true },
);

const Complaint = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);

function ensureComplaintShape(complaint) {
  if (!complaint) return null;
  const normalized = { ...complaint };
  normalized.status = normalizeStatus(complaint.status);
  normalized.urgency = normalizeUrgency(complaint.urgency);
  normalized.submittedAt = complaint.submittedAt ? new Date(complaint.submittedAt).toISOString() : new Date().toISOString();
  normalized.coordinates = Array.isArray(complaint.coordinates) && complaint.coordinates.length === 2 ? complaint.coordinates : deriveDemoCoordinates(complaint.location || 'Chennai, Tamil Nadu');
  normalized.timeline = Array.isArray(complaint.timeline) ? complaint.timeline.map((entry) => ({
    status: normalizeStatus(entry.status),
    note: entry.note || `Updated to ${normalizeStatus(entry.status)}`,
    timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
  })) : [{ status: normalized.status, note: 'Complaint created.', timestamp: normalized.submittedAt }];
  return normalized;
}

async function getComplaintStore() {
  if (mongoose.connection.readyState === 1) {
    const complaints = await Complaint.find({}).sort({ submittedAt: -1 }).lean();
    return complaints.map((complaint) => ensureComplaintShape(complaint));
  }

  return [...inMemoryComplaints]
    .map((complaint) => ensureComplaintShape(complaint))
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

async function findComplaintById(id) {
  if (mongoose.connection.readyState === 1) {
    const complaint = await Complaint.findOne({ ticketId: id }).lean();
    return ensureComplaintShape(complaint);
  }

  return ensureComplaintShape(inMemoryComplaints.find((entry) => entry.ticketId === id) || null);
}

async function createComplaintFromPayload(payload) {
  const complaintText = (payload.complaintText || payload.transcript || '').trim();
  const categoryResult = classifyComplaint(complaintText);
  const normalizedStatus = normalizeStatus(payload.status || 'Pending');
  const locationValue = payload.location || 'Chennai, Tamil Nadu';
  const complaintRecord = {
    ticketId: payload.ticketId || generateTicketId(),
    complaintText,
    category: payload.category || categoryResult.category,
    location: locationValue,
    coordinates: payload.coordinates || deriveDemoCoordinates(locationValue),
    language: payload.language || 'English',
    urgency: normalizeUrgency(payload.urgency || categoryResult.urgency),
    status: normalizedStatus,
    description: payload.description || '',
    source: payload.source || 'voice',
    isSample: Boolean(payload.isSample),
    adminRemarks: payload.adminRemarks || '',
    classificationReason: payload.classificationReason || categoryResult.explanation,
    submittedAt: new Date().toISOString(),
    timeline: [
      {
        status: normalizedStatus,
        note: payload.note || 'Complaint submitted to the civic tracking dashboard.',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  if (mongoose.connection.readyState === 1) {
    const saved = await Complaint.create(complaintRecord);
    return ensureComplaintShape(saved.toObject());
  }

  inMemoryComplaints.unshift(complaintRecord);
  return ensureComplaintShape(complaintRecord);
}

async function updateComplaintStatus(id, status, note, urgency) {
  const normalizedStatus = normalizeStatus(status);
  const normalizedUrgency = normalizeUrgency(urgency || undefined);

  if (mongoose.connection.readyState === 1) {
    const complaint = await Complaint.findOne({ ticketId: id });
    if (!complaint) return null;
    complaint.status = normalizedStatus;
    if (urgency) complaint.urgency = normalizedUrgency;
    complaint.timeline = complaint.timeline || [];
    complaint.timeline.push(buildTimeline(normalizedStatus, note || `Status updated to ${normalizedStatus}.`));
    await complaint.save();
    return ensureComplaintShape(complaint.toObject());
  }

  const complaintIndex = inMemoryComplaints.findIndex((entry) => entry.ticketId === id);
  if (complaintIndex === -1) return null;
  const complaint = inMemoryComplaints[complaintIndex];
  complaint.status = normalizedStatus;
  if (urgency) complaint.urgency = normalizedUrgency;
  complaint.timeline = complaint.timeline || [];
  complaint.timeline.push(buildTimeline(normalizedStatus, note || `Status updated to ${normalizedStatus}.`));
  return ensureComplaintShape(complaint);
}

async function updateComplaintFields(id, updates) {
  if (mongoose.connection.readyState === 1) {
    const complaint = await Complaint.findOne({ ticketId: id });
    if (!complaint) return null;
    if (updates.category) complaint.category = updates.category;
    if (updates.location) complaint.location = updates.location;
    if (updates.coordinates) complaint.coordinates = updates.coordinates;
    if (updates.urgency) complaint.urgency = normalizeUrgency(updates.urgency);
    if (updates.adminRemarks) complaint.adminRemarks = updates.adminRemarks;
    if (updates.description) complaint.description = updates.description;
    if (updates.status) complaint.status = normalizeStatus(updates.status);
    complaint.timeline = complaint.timeline || [];
    if (updates.status) {
      complaint.timeline.push(buildTimeline(updates.status, updates.note || `Status updated to ${normalizeStatus(updates.status)}.`));
    }
    await complaint.save();
    return ensureComplaintShape(complaint.toObject());
  }

  const complaintIndex = inMemoryComplaints.findIndex((entry) => entry.ticketId === id);
  if (complaintIndex === -1) return null;
  const complaint = inMemoryComplaints[complaintIndex];
  if (updates.category) complaint.category = updates.category;
  if (updates.location) complaint.location = updates.location;
  if (updates.coordinates) complaint.coordinates = updates.coordinates;
  if (updates.urgency) complaint.urgency = normalizeUrgency(updates.urgency);
  if (updates.adminRemarks) complaint.adminRemarks = updates.adminRemarks;
  if (updates.description) complaint.description = updates.description;
  if (updates.status) {
    complaint.status = normalizeStatus(updates.status);
    complaint.timeline = complaint.timeline || [];
    complaint.timeline.push(buildTimeline(updates.status, updates.note || `Status updated to ${normalizeStatus(updates.status)}.`));
  }
  return ensureComplaintShape(complaint);
}

function createAdminToken(username) {
  return jwt.sign({ sub: username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function createUserToken(user) {
  return jwt.sign({ sub: user.email, role: user.role || 'user', name: user.name }, JWT_SECRET, { expiresIn: '12h' });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Admin authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired admin token.' });
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = GNANI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeWithGnani(audioBuffer, mimeType, originalName, languageCode = 'ta-IN') {
  if (!GNANI_API_KEY) {
    return null;
  }

  const formData = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
  formData.append('audio_file', audioBlob, originalName || 'voice-recording.webm');
  formData.append('language_code', languageCode);
  formData.append('model', 'prisma-v2.5');
  formData.append('format', 'transcribe');

  const response = await fetchWithTimeout(GNANI_STT_URL, {
    method: 'POST',
    headers: {
      'X-API-Key-ID': GNANI_API_KEY,
    },
    body: formData,
  });

  const rawText = await response.text();
  if (!response.ok) {
    let detail = rawText;
    try {
      const parsed = JSON.parse(rawText);
      detail = parsed?.message || parsed?.error || rawText;
    } catch (error) {
      // Response is not JSON; use the raw body for debugging.
    }
    throw new Error(`Gnani STT request failed (${response.status}): ${detail}`);
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    throw new Error('Gnani STT returned non-JSON data.');
  }

  const transcript = payload?.transcript || '';
  if (!transcript) {
    throw new Error('Gnani STT returned no transcript.');
  }

  return {
    transcript,
    model: payload.model || 'prisma-v2.5',
    detectedLanguageCode: payload.detected_language_code || languageCode,
    requestId: payload.request_id,
  };
}

async function synthesizeTamilConfirmation(text) {
  const key = GNANI_API_KEY || GNANI_TTS_API_KEY;
  if (!key) {
    return {
      generated: false,
      text,
      audioContentType: 'text/plain',
      message: 'TTS is unavailable because no Gnani credentials are configured.',
    };
  }

  const payload = {
    text,
    voice: 'Nalini',
    model: 'timbre-v2.5',
    language: 'ta-IN',
    speed: 1.0,
    audio_config: {
      sample_rate: 48000,
      num_channels: 1,
      sample_width: 2,
      encoding: 'linear_pcm',
      container: 'wav',
    },
  };

  try {
    const response = await fetchWithTimeout(GNANI_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key-ID': key,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gnani TTS request failed (${response.status}): ${errorText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return {
      generated: true,
      text,
      audioBase64: audioBuffer.toString('base64'),
      audioContentType: response.headers.get('content-type') || 'audio/wav',
      message: 'Tamil confirmation generated with Gnani Timbre.',
    };
  } catch (error) {
    return {
      generated: false,
      text,
      audioContentType: 'text/plain',
      message: 'Gnani TTS is unavailable right now. Showing the Tamil confirmation text instead.',
      error: error.message,
    };
  }
}

function getDashboardSummary(complaints) {
  const total = complaints.length;
  const pending = complaints.filter((complaint) => normalizeStatus(complaint.status) === 'Pending').length;
  const inProgress = complaints.filter((complaint) => normalizeStatus(complaint.status) === 'In Progress').length;
  const resolved = complaints.filter((complaint) => normalizeStatus(complaint.status) === 'Resolved').length;
  const highUrgency = complaints.filter((complaint) => ['High', 'Critical'].includes(normalizeUrgency(complaint.urgency))).length;
  const resolutionRate = total > 0 ? Number(((resolved / total) * 100).toFixed(1)) : 0;

  const dailyTrend = [];
  const map = new Map();
  complaints.forEach((complaint) => {
    const date = new Date(complaint.submittedAt).toISOString().slice(0, 10);
    map.set(date, (map.get(date) || 0) + 1);
  });
  const keys = [...map.keys()].sort();
  keys.forEach((date) => {
    dailyTrend.push({ date, count: map.get(date) });
  });

  const categoryDistribution = Object.entries(
    complaints.reduce((accumulator, complaint) => {
      const key = complaint.category || 'Other';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const areaStats = Object.entries(
    complaints.reduce((accumulator, complaint) => {
      const key = complaint.location || 'Unspecified';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const recentActivity = complaints
    .slice(0, 6)
    .map((complaint) => ({
      id: complaint.ticketId,
      title: `${complaint.category} reported in ${complaint.location}`,
      time: new Date(complaint.submittedAt).toLocaleString(),
      status: complaint.status,
      severity: complaint.urgency,
    }));

  const repeatedByLocation = Object.entries(
    complaints.reduce((accumulator, complaint) => {
      const key = complaint.location || 'Unspecified';
      accumulator[key] = accumulator[key] || { count: 0, pending: 0 };
      accumulator[key].count += 1;
      if (normalizeStatus(complaint.status) !== 'Resolved') accumulator[key].pending += 1;
      return accumulator;
    }, {}),
  )
    .map(([name, data]) => ({ location: name, count: data.count, pending: data.pending }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const categoryFocus = [...categoryDistribution].sort((a, b) => b.value - a.value)[0] || { name: 'Other', value: 0 };
  const unresolvedAreas = [...areaStats]
    .filter((area) => complaints.filter((complaint) => complaint.location === area.name && normalizeStatus(complaint.status) !== 'Resolved').length > 0)
    .slice(0, 5);

  const insightCards = [
    { label: 'Repeated issue locations', value: repeatedByLocation[0] ? repeatedByLocation[0].location : 'N/A' },
    { label: 'Most common category', value: categoryFocus.name },
    { label: 'High urgency complaints', value: highUrgency },
    { label: 'Unresolved areas', value: unresolvedAreas.length },
  ];

  return {
    total,
    pending,
    inProgress,
    resolved,
    highUrgency,
    resolutionRate,
    dailyTrend,
    categoryDistribution,
    areaStats,
    recentActivity,
    repeatedByLocation,
    categoryFocus,
    unresolvedAreas,
    insightCards,
  };
}

if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((error) => console.error('MongoDB connection error:', error.message));
} else {
  console.log('MongoDB not configured. Using in-memory complaint store.');
}

app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    mode: process.env.MONGO_URI ? 'mongodb' : 'demo',
    message: 'NammaFix AI backend is running.',
  });
});

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = inMemoryUsers.find((user) => user.email === normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const user = {
    id: `user-${Date.now()}`,
    name: String(name).trim(),
    email: normalizedEmail,
    role: 'user',
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  inMemoryUsers.push(user);
  const token = createUserToken(user);

  return res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    message: 'Account created successfully.',
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = inMemoryUsers.find((entry) => entry.email === normalizedEmail && entry.passwordHash === hashPassword(password));

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = createUserToken(user);

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    message: 'Login successful.',
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = inMemoryUsers.find((entry) => entry.email === req.user.sub) || null;

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ token: createAdminToken(username), user: username, role: 'admin' });
  }
  return res.status(401).json({ message: 'Invalid admin credentials.' });
});

app.post('/api/complaints/classify', (req, res) => {
  const { text } = req.body || {};
  if (!text) {
    return res.status(400).json({ message: 'Text is required to classify a complaint.' });
  }

  return res.json(classifyComplaint(text));
});

app.post('/api/complaints/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Audio file is required for transcription.' });
  }

  try {
    const result = await transcribeWithGnani(req.file.buffer, req.file.mimetype || 'audio/webm', req.file.originalname || 'voice-recording.webm', 'ta-IN');

    if (result) {
      return res.json({
        transcript: result.transcript,
        mode: 'api',
        source: 'gnani',
        message: 'Speech-to-text generated from Gnani Prisma.',
        model: result.model,
        requestId: result.requestId,
      });
    }

    return res.status(200).json({
      transcript: 'Demo transcription mode — please review and edit the text manually.',
      mode: 'demo',
      source: 'manual',
      message: 'No Gnani credentials configured. Manual text entry stays enabled.',
    });
  } catch (error) {
    return res.status(200).json({
      transcript: 'Demo transcription mode — please review and edit the text manually.',
      mode: 'demo',
      source: 'manual',
      message: 'Gnani API is not configured or unavailable. Demo mode is active.',
      error: error.message,
    });
  }
});

app.get('/api/complaints', async (req, res) => {
  try {
    const complaints = await getComplaintStore();
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch complaints', error: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const complaints = await getComplaintStore();
    return res.json(getDashboardSummary(complaints));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to calculate dashboard analytics', error: error.message });
  }
});

app.get('/api/complaints/:id', async (req, res) => {
  try {
    const complaint = await findComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    return res.json(complaint);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch complaint', error: error.message });
  }
});

app.post('/api/complaints', async (req, res) => {
  try {
    const complaint = await createComplaintFromPayload(req.body || {});
    return res.status(201).json(complaint);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save complaint', error: error.message });
  }
});

app.patch('/api/complaints/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status, note, urgency } = req.body || {};
    const updatedComplaint = await updateComplaintStatus(req.params.id, status, note, urgency);
    if (!updatedComplaint) return res.status(404).json({ message: 'Complaint not found' });
    return res.json(updatedComplaint);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update complaint status', error: error.message });
  }
});

app.patch('/api/complaints/:id', requireAdmin, async (req, res) => {
  try {
    const updatedComplaint = await updateComplaintFields(req.params.id, req.body || {});
    if (!updatedComplaint) return res.status(404).json({ message: 'Complaint not found' });
    return res.json(updatedComplaint);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update complaint details', error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const complaints = await getComplaintStore();
    const stats = {
      total: complaints.length,
      pending: complaints.filter((complaint) => normalizeStatus(complaint.status) === 'Pending').length,
      inProgress: complaints.filter((complaint) => normalizeStatus(complaint.status) === 'In Progress').length,
      resolved: complaints.filter((complaint) => normalizeStatus(complaint.status) === 'Resolved').length,
      urgent: complaints.filter((complaint) => ['High', 'Critical'].includes(normalizeUrgency(complaint.urgency))).length,
    };
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to calculate stats', error: error.message });
  }
});

app.get('/api/complaints/:id/confirmation', async (req, res) => {
  try {
    const complaint = await findComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    const text = `உங்கள் புகார் ${complaint.ticketId} பதிவு செய்யப்பட்டுள்ளது. ${complaint.category} பிரச்சனைக்கு விரைவாக நடவடிக்கை எடுக்கப்படும்.`;
    const result = await synthesizeTamilConfirmation(text);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate confirmation', error: error.message });
  }
});

app.get('/api/admin/complaints', requireAdmin, async (req, res) => {
  try {
    const complaints = await getComplaintStore();
    return res.json(complaints);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load admin complaints', error: error.message });
  }
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ message: 'Internal server error', error: error.message });
});

app.listen(PORT, () => {
  console.log(`NammaFix AI backend listening on http://localhost:${PORT}`);
  console.log(`Client origin configured for ${CLIENT_URL}`);
  console.log(`Admin credentials: ${ADMIN_USERNAME}/${ADMIN_PASSWORD}`);
});
