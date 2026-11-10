const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 5000);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MONGO_URI = process.env.MONGO_URI || '';
const GNANI_API_KEY = process.env.GNANI_API_KEY || '';
const GNANI_TTS_API_KEY = process.env.GNANI_TTS_API_KEY || GNANI_API_KEY;
const GNANI_STT_URL = process.env.GNANI_API_URL || 'https://api.vachana.ai/stt/v3';
const GNANI_TTS_URL = process.env.GNANI_TTS_API_URL || 'https://api.vachana.ai/api/v1/tts/inference';
const GNANI_TIMEOUT_MS = Number(process.env.GNANI_TIMEOUT_MS || 60000);
const GEOCODER_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const GEOCODER_USER_AGENT = `NammaFixAI/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || 'https://github.com/AjayNS12122006/NammaFix-Ai'})`;
const GEOCODER_TIMEOUT_MS = Number(process.env.NOMINATIM_TIMEOUT_MS || 7000);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!JWT_SECRET || JWT_SECRET.length < 32 || !ADMIN_USERNAME || !ADMIN_PASSWORD || !MONGO_URI)) {
  console.error('Production requires a 32-character JWT_SECRET, admin credentials, and MONGO_URI.');
  process.exit(1);
}

if (!isProduction && (!JWT_SECRET || !ADMIN_USERNAME || !ADMIN_PASSWORD)) {
  console.error('Missing required environment variables: JWT_SECRET, ADMIN_USERNAME, and ADMIN_PASSWORD must be configured.');
}

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const requestLimits = new Map();
const locationGeocodeCache = new Map();
let geocodeQueue = Promise.resolve();
let lastGeocodeRequestAt = 0;
const MAX_LOCATION_LENGTH = 250;
const MAX_COMPLAINT_LENGTH = 5000;
const COMPLAINT_CATEGORIES = [
  'Garbage Collection',
  'Water Leakage',
  'Road Damage',
  'Drainage Problem',
  'Electricity Problem',
  'Streetlight Problem',
  'Public Sanitation',
  'Other',
];
const LANGUAGE_OPTIONS = ['Tamil', 'English', 'Tanglish'];

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
  const randomPart = crypto.randomInt(36 ** 4).toString(36).padStart(4, '0').toUpperCase();
  return `${prefix}-${stamp}-${randomPart}`;
}

function rateLimit({ windowMs, maxRequests, message }) {
  return (req, res, next) => {
    const now = Date.now();
    if (requestLimits.size > 10000) {
      for (const [key, value] of requestLimits) {
        if (value.expiresAt <= now) requestLimits.delete(key);
      }
    }
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const entry = requestLimits.get(key);
    if (!entry || entry.expiresAt <= now) {
      requestLimits.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      res.set('Retry-After', String(Math.ceil((entry.expiresAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    return next();
  };
}

function isValidCoordinates(coordinates) {
  return Boolean(
    coordinates
    && Number.isFinite(coordinates.latitude)
    && Number.isFinite(coordinates.longitude)
    && coordinates.latitude >= -90
    && coordinates.latitude <= 90
    && coordinates.longitude >= -180
    && coordinates.longitude <= 180,
  );
}

async function geocodeLocation(location) {
  const cacheKey = location.trim().toLocaleLowerCase();
  if (locationGeocodeCache.has(cacheKey)) return locationGeocodeCache.get(cacheKey);

  const geocode = async () => {
    const waitMs = Math.max(0, 1000 - (Date.now() - lastGeocodeRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastGeocodeRequestAt = Date.now();

    const url = new URL('/search', GEOCODER_URL);
    url.searchParams.set('q', `${location}, Tamil Nadu, India`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'in');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEOCODER_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': GEOCODER_USER_AGENT,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        return { coordinates: null, locationSource: 'unavailable', geocodingStatus: 'unavailable' };
      }

      const results = await response.json();
      const latitude = Number(results[0]?.lat);
      const longitude = Number(results[0]?.lon);
      const coordinates = { latitude, longitude };
      if (!isValidCoordinates(coordinates)) {
        return {
          coordinates: null,
          locationSource: 'unavailable',
          geocodingStatus: Array.isArray(results) && results.length ? 'unavailable' : 'not_found',
        };
      }

      const result = { coordinates, locationSource: 'geocoded', geocodingStatus: 'success' };
      locationGeocodeCache.set(cacheKey, result);
      if (locationGeocodeCache.size > 3000) {
        locationGeocodeCache.delete(locationGeocodeCache.keys().next().value);
      }
      return result;
    } catch (error) {
      console.warn('Geocoding request failed:', error.name === 'AbortError' ? 'timeout' : 'provider_unavailable');
      return { coordinates: null, locationSource: 'unavailable', geocodingStatus: 'unavailable' };
    } finally {
      clearTimeout(timeout);
    }
  };

  const resultPromise = geocodeQueue.then(geocode, geocode);
  geocodeQueue = resultPromise.then(() => undefined, () => undefined);
  return resultPromise;
}

function detectAudioFormat(buffer) {
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'fLaC') return 'flac';
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 3) === 'ID3') return 'mp3';
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe6) === 0xe0) return 'mp3-or-aac';
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  return null;
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
    coordinates: null,
    locationSource: 'unavailable',
    geocodingStatus: 'unavailable',
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
    coordinates: null,
    locationSource: 'unavailable',
    geocodingStatus: 'unavailable',
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
    coordinates: null,
    locationSource: 'unavailable',
    geocodingStatus: 'unavailable',
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
    coordinates: {
      type: new mongoose.Schema({
        latitude: { type: Number, min: -90, max: 90 },
        longitude: { type: Number, min: -180, max: 180 },
      }, { _id: false }),
      default: null,
    },
    locationSource: { type: String, enum: ['geocoded', 'unavailable'], default: 'unavailable' },
    geocodingStatus: { type: String, enum: ['success', 'not_found', 'unavailable'], default: 'unavailable' },
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

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

function ensureComplaintShape(complaint) {
  if (!complaint) return null;
  const normalized = { ...complaint };
  normalized.status = normalizeStatus(complaint.status);
  normalized.urgency = normalizeUrgency(complaint.urgency);
  normalized.submittedAt = complaint.submittedAt ? new Date(complaint.submittedAt).toISOString() : new Date().toISOString();
  if (normalized.locationSource !== 'geocoded' || !isValidCoordinates(normalized.coordinates)) {
    normalized.coordinates = null;
    normalized.locationSource = 'unavailable';
    normalized.geocodingStatus = ['not_found', 'unavailable'].includes(normalized.geocodingStatus) ? normalized.geocodingStatus : 'unavailable';
  }
  normalized.timeline = Array.isArray(complaint.timeline) ? complaint.timeline.map((entry) => ({
    status: normalizeStatus(entry.status),
    note: entry.note || `Updated to ${normalizeStatus(entry.status)}`,
    timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
  })) : [{ status: normalized.status, note: 'Complaint created.', timestamp: normalized.submittedAt }];
  return normalized;
}

function toPublicTrackingRecord(complaint) {
  const record = ensureComplaintShape(complaint);
  if (!record) return null;
  return {
    ticketId: record.ticketId,
    category: record.category,
    status: record.status,
    urgency: record.urgency,
    location: record.location,
    submittedAt: record.submittedAt,
    geocodingStatus: record.geocodingStatus,
    timeline: record.timeline.map(({ status, timestamp }) => ({ status, timestamp })),
  };
}

function assertConfiguredMongoAvailable() {
  if (MONGO_URI && mongoose.connection.readyState !== 1) {
    const error = new Error('MongoDB is unavailable; complaint data was not read or written.');
    error.status = 503;
    throw error;
  }
}

async function getComplaintStore() {
  assertConfiguredMongoAvailable();
  if (mongoose.connection.readyState === 1) {
    const complaints = await Complaint.find({}).sort({ submittedAt: -1 }).lean();
    return complaints.map((complaint) => ensureComplaintShape(complaint));
  }

  return [...inMemoryComplaints]
    .map((complaint) => ensureComplaintShape(complaint))
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

async function findComplaintById(id) {
  assertConfiguredMongoAvailable();
  if (mongoose.connection.readyState === 1) {
    const complaint = await Complaint.findOne({ ticketId: id }).lean();
    return ensureComplaintShape(complaint);
  }

  return ensureComplaintShape(inMemoryComplaints.find((entry) => entry.ticketId === id) || null);
}

function validateComplaintPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'A complaint object is required.';
  }
  if (typeof payload.location !== 'string' || !payload.location.trim()) {
    return 'Location is required.';
  }
  if (payload.location.trim().length > MAX_LOCATION_LENGTH) {
    return `Location must be ${MAX_LOCATION_LENGTH} characters or fewer.`;
  }
  if (typeof payload.complaintText !== 'string' || !payload.complaintText.trim()) {
    return 'Complaint text is required.';
  }
  if (payload.complaintText.trim().length > MAX_COMPLAINT_LENGTH) {
    return `Complaint text must be ${MAX_COMPLAINT_LENGTH} characters or fewer.`;
  }
  if (payload.category !== undefined && !COMPLAINT_CATEGORIES.includes(payload.category)) {
    return 'Choose a valid complaint category.';
  }
  if (payload.language !== undefined && !LANGUAGE_OPTIONS.includes(payload.language)) {
    return 'Choose a valid language.';
  }
  if (payload.urgency !== undefined && !URGENCY_OPTIONS.includes(payload.urgency)) {
    return 'Choose a valid urgency.';
  }
  if (payload.description !== undefined && (typeof payload.description !== 'string' || payload.description.length > 2000)) {
    return 'Additional notes must be 2,000 characters or fewer.';
  }
  return null;
}

async function createComplaintFromPayload(payload) {
  const validationMessage = validateComplaintPayload(payload);
  if (validationMessage) {
    const error = new Error(validationMessage);
    error.status = 400;
    throw error;
  }
  assertConfiguredMongoAvailable();

  const complaintText = payload.complaintText.trim();
  const categoryResult = classifyComplaint(complaintText);
  const normalizedStatus = 'Pending';
  const locationValue = payload.location;
  const geocoding = await geocodeLocation(locationValue.trim());
  const complaintRecord = {
    ticketId: generateTicketId(),
    complaintText,
    category: payload.category || categoryResult.category,
    location: locationValue,
    ...geocoding,
    language: payload.language || 'English',
    urgency: normalizeUrgency(payload.urgency || categoryResult.urgency),
    status: normalizedStatus,
    description: payload.description || '',
    source: 'voice',
    isSample: false,
    adminRemarks: '',
    classificationReason: categoryResult.explanation,
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const saved = await Complaint.create(complaintRecord);
        return ensureComplaintShape(saved.toObject());
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error;
        complaintRecord.ticketId = generateTicketId();
      }
    }
  }

  inMemoryComplaints.unshift(complaintRecord);
  return ensureComplaintShape(complaintRecord);
}

async function updateComplaintStatus(id, status, note, urgency) {
  assertConfiguredMongoAvailable();
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
  assertConfiguredMongoAvailable();
  if (updates.category !== undefined && !COMPLAINT_CATEGORIES.includes(updates.category)) {
    const error = new Error('Choose a valid complaint category.');
    error.status = 400;
    throw error;
  }
  if (updates.location !== undefined && (typeof updates.location !== 'string' || !updates.location.trim() || updates.location.trim().length > MAX_LOCATION_LENGTH)) {
    const error = new Error(`Location must be a non-empty string of at most ${MAX_LOCATION_LENGTH} characters.`);
    error.status = 400;
    throw error;
  }
  if (updates.urgency !== undefined && !URGENCY_OPTIONS.includes(updates.urgency)) {
    const error = new Error('Choose a valid urgency.');
    error.status = 400;
    throw error;
  }
  if (updates.status !== undefined && !STATUS_OPTIONS.includes(updates.status)) {
    const error = new Error('Choose a valid status.');
    error.status = 400;
    throw error;
  }
  if (updates.adminRemarks !== undefined && (typeof updates.adminRemarks !== 'string' || updates.adminRemarks.length > 2000)) {
    const error = new Error('Admin remarks must be 2,000 characters or fewer.');
    error.status = 400;
    throw error;
  }
  const locationValue = updates.location === undefined ? null : updates.location;
  const geocoding = locationValue === null ? null : await geocodeLocation(locationValue.trim());

  if (mongoose.connection.readyState === 1) {
    const complaint = await Complaint.findOne({ ticketId: id });
    if (!complaint) return null;
    if (updates.category !== undefined) complaint.category = updates.category;
    if (locationValue !== null) {
      complaint.location = locationValue;
      complaint.coordinates = geocoding.coordinates;
      complaint.locationSource = geocoding.locationSource;
      complaint.geocodingStatus = geocoding.geocodingStatus;
    }
    if (updates.urgency !== undefined) complaint.urgency = updates.urgency;
    if (updates.adminRemarks !== undefined) complaint.adminRemarks = updates.adminRemarks;
    if (updates.description !== undefined && typeof updates.description === 'string') complaint.description = updates.description.slice(0, 2000);
    if (updates.status !== undefined) complaint.status = updates.status;
    complaint.timeline = complaint.timeline || [];
    if (updates.status !== undefined) {
      complaint.timeline.push(buildTimeline(updates.status));
    }
    await complaint.save();
    return ensureComplaintShape(complaint.toObject());
  }

  const complaintIndex = inMemoryComplaints.findIndex((entry) => entry.ticketId === id);
  if (complaintIndex === -1) return null;
  const complaint = inMemoryComplaints[complaintIndex];
  if (updates.category !== undefined) complaint.category = updates.category;
  if (locationValue !== null) {
    complaint.location = locationValue;
    complaint.coordinates = geocoding.coordinates;
    complaint.locationSource = geocoding.locationSource;
    complaint.geocodingStatus = geocoding.geocodingStatus;
  }
  if (updates.urgency !== undefined) complaint.urgency = updates.urgency;
  if (updates.adminRemarks !== undefined) complaint.adminRemarks = updates.adminRemarks;
  if (updates.description !== undefined && typeof updates.description === 'string') complaint.description = updates.description.slice(0, 2000);
  if (updates.status !== undefined) {
    complaint.status = updates.status;
    complaint.timeline = complaint.timeline || [];
    complaint.timeline.push(buildTimeline(updates.status));
  }
  return ensureComplaintShape(complaint);
}

function createAdminToken(username) {
  return jwt.sign({ sub: username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function createUserToken(user) {
  return jwt.sign({ sub: user.email, role: user.role || 'user', name: user.name }, JWT_SECRET, { expiresIn: '12h' });
}

async function hashPassword(password) {
  return bcrypt.hash(String(password || ''), 12);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(String(password || ''), passwordHash);
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
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Admin authorization required.' });
    }
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
    const error = new Error('Gnani credentials are not configured.');
    error.category = 'credentials_missing';
    throw error;
  }

  const startedAt = Date.now();
  const formData = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: mimeType });
  formData.append('audio_file', audioBlob, originalName);
  formData.append('language_code', languageCode);
  formData.append('format', 'transcribe');

  try {
    const response = await fetchWithTimeout(GNANI_STT_URL, {
      method: 'POST',
      headers: {
        'X-API-Key-ID': GNANI_API_KEY,
      },
      body: formData,
    });
    console.info('Gnani STT response:', JSON.stringify({
      status: response.status,
      durationMs: Date.now() - startedAt,
      audioMimeType: mimeType,
      audioBytes: audioBuffer.length,
    }));

    if (!response.ok) {
      const error = new Error(`Gnani STT returned HTTP ${response.status}.`);
      error.status = response.status;
      error.category = response.status === 401 || response.status === 403
        ? 'provider_authentication'
        : response.status === 504
          ? 'provider_timeout'
          : 'provider_error';
      throw error;
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const invalidResponse = new Error('Gnani STT returned an invalid response.');
      invalidResponse.category = 'invalid_provider_response';
      throw invalidResponse;
    }

    if (payload?.success !== true || typeof payload?.transcript !== 'string') {
      const invalidResponse = new Error('Gnani STT response did not contain a successful transcript.');
      invalidResponse.category = 'invalid_provider_response';
      throw invalidResponse;
    }

    return {
      transcript: payload.transcript,
      model: payload.model || 'prisma-v2.5',
      detectedLanguageCode: payload.detected_language_code || languageCode,
      requestId: payload.request_id,
    };
  } catch (error) {
    if (!error.category) {
      error.category = /timed out/i.test(error.message) ? 'timeout' : 'network_error';
    }
    console.warn('Gnani STT failed:', JSON.stringify({
      durationMs: Date.now() - startedAt,
      errorCategory: error.category,
      providerStatus: error.status || null,
      audioMimeType: mimeType,
      audioBytes: audioBuffer.length,
    }));
    throw error;
  }
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
    const startedAt = Date.now();
    const response = await fetchWithTimeout(GNANI_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key-ID': key,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn('Gnani TTS failed:', JSON.stringify({ status: response.status, durationMs: Date.now() - startedAt }));
      return {
        generated: false,
        text,
        audioContentType: 'text/plain',
        message: 'Gnani TTS is unavailable right now. Showing the Tamil confirmation text instead.',
      };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    if (audioBuffer.toString('ascii', 0, 4) !== 'RIFF' || audioBuffer.toString('ascii', 8, 12) !== 'WAVE') {
      console.warn('Gnani TTS failed:', JSON.stringify({ status: response.status, durationMs: Date.now() - startedAt, errorCategory: 'invalid_audio_format' }));
      return {
        generated: false,
        text,
        audioContentType: 'text/plain',
        message: 'Gnani TTS returned an unsupported audio format. Showing the Tamil confirmation text instead.',
      };
    }
    console.info('Gnani TTS response:', JSON.stringify({ status: response.status, durationMs: Date.now() - startedAt, audioBytes: audioBuffer.length }));
    return {
      generated: true,
      text,
      audioBase64: audioBuffer.toString('base64'),
      audioContentType: 'audio/wav',
      message: 'Tamil confirmation generated with Gnani Timbre.',
    };
  } catch (error) {
    console.warn('Gnani TTS failed:', JSON.stringify({ errorCategory: /timed out/i.test(error.message) ? 'timeout' : 'provider_unavailable' }));
    return {
      generated: false,
      text,
      audioContentType: 'text/plain',
      message: 'Gnani TTS is unavailable right now. Showing the Tamil confirmation text instead.',
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

let mongoStatus = {
  connected: false,
  mode: 'demo',
  reason: 'MongoDB is not configured. Demo in-memory mode is active.',
};

async function connectMongo() {
  if (!MONGO_URI) {
    mongoStatus = {
      connected: false,
      mode: 'demo',
      reason: 'MongoDB is not configured. Demo in-memory mode is active.',
    };
    return;
  }

  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    mongoStatus = {
      connected: true,
      mode: 'mongodb',
      reason: 'MongoDB connected successfully.',
    };
    console.log('MongoDB connected successfully.');
  } catch (error) {
    mongoStatus = {
      connected: false,
      mode: isProduction ? 'mongodb_error' : 'demo',
      reason: 'MongoDB connection failed.',
    };
    console.error('MongoDB connection failed; check connectivity and configuration.');
    if (isProduction) {
      console.error('MongoDB is required in production. Exiting to avoid running with an invalid database connection.');
      process.exit(1);
    }
  }
}


app.get('/api/health', (req, res) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1;
  const isHealthy = isDatabaseConnected || (!MONGO_URI && !isProduction);
  const status = isHealthy ? 200 : 503;

  res.status(status).json({
  ok: isHealthy,
  database: {
    connected: isDatabaseConnected,
    mode: isDatabaseConnected ? 'mongodb' : (!MONGO_URI && !isProduction ? 'demo' : 'mongodb_error'),
  },
  mode: isDatabaseConnected ? 'mongodb' : (!MONGO_URI && !isProduction ? 'demo' : 'mongodb_error'),
    message: isHealthy ? 'NammaFix AI backend is running.' : 'Database connectivity issue detected.',
  });
});

app.use('/api', (req, res, next) => {
  if (isProduction && mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
  return next();
});

app.post('/api/auth/signup', rateLimit({ windowMs: 60 * 60 * 1000, maxRequests: 5, message: 'Too many signup attempts. Try again later.' }), async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedName = String(name).trim();

  if (!trimmedName || !normalizedEmail || String(password).length < 8) {
    return res.status(400).json({ message: 'Please provide a valid name, email and a password with at least 8 characters.' });
  }

  try {
    if (mongoose.connection.readyState === 1) {
      const existingUser = await User.findOne({ email: normalizedEmail }).lean();
      if (existingUser) {
        return res.status(409).json({ message: 'An account with this email already exists.' });
      }

      const passwordHash = await hashPassword(password);
      const user = await User.create({
        name: trimmedName,
        email: normalizedEmail,
        role: 'user',
        passwordHash,
      });

      const token = createUserToken(user.toObject());
      return res.status(201).json({
        token,
        user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
        message: 'Account created successfully.',
      });
    }

    const existingUser = inMemoryUsers.find((user) => user.email === normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const user = {
      id: `user-${Date.now()}`,
      name: trimmedName,
      email: normalizedEmail,
      role: 'user',
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    inMemoryUsers.push(user);
    const token = createUserToken(user);
    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      message: 'Account created successfully.',
    });
  } catch (error) {
    console.error('User signup failed:', error.name);
    return res.status(500).json({ message: 'Failed to create user account.' });
  }
});

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10, message: 'Too many login attempts. Try again later.' }), async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email: normalizedEmail }).lean();
      if (!user || !(await comparePassword(password, user.passwordHash))) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const token = createUserToken(user);
      return res.json({
        token,
        user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
        message: 'Login successful.',
      });
    }

    const user = inMemoryUsers.find((entry) => entry.email === normalizedEmail);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = createUserToken(user);
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      message: 'Login successful.',
    });
  } catch (error) {
    console.error('User login failed:', error.name);
    return res.status(500).json({ message: 'Login failed.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email: req.user.sub }).lean();
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      return res.json({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }

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
  } catch (error) {
    console.error('User profile lookup failed:', error.name);
    return res.status(500).json({ message: 'Unable to load current user profile.' });
  }
});

app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10, message: 'Too many login attempts. Try again later.' }), (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ token: createAdminToken(username), user: username, role: 'admin' });
  }
  return res.status(401).json({ message: 'Invalid admin credentials.' });
});

app.post('/api/complaints/classify', rateLimit({ windowMs: 60 * 1000, maxRequests: 60, message: 'Too many classification requests. Try again shortly.' }), (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_COMPLAINT_LENGTH) {
    return res.status(400).json({ message: `Text is required and must be ${MAX_COMPLAINT_LENGTH} characters or fewer.` });
  }

  return res.json(classifyComplaint(text.trim()));
});

app.post('/api/complaints/transcribe', rateLimit({ windowMs: 60 * 1000, maxRequests: 10, message: 'Too many transcription requests. Try again shortly.' }), upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Audio file is required for transcription.' });
  }

  const audioFormat = detectAudioFormat(req.file.buffer);
  if (!audioFormat) {
    return res.status(400).json({ message: 'Unsupported or invalid audio file. Upload WAV, MP3, OGG, FLAC, AAC, or M4A audio.' });
  }
  const audioMimeType = audioFormat === 'wav' ? 'audio/wav'
    : audioFormat === 'flac' ? 'audio/flac'
      : audioFormat === 'ogg' ? 'audio/ogg'
        : audioFormat === 'm4a' ? 'audio/mp4'
          : audioFormat === 'mp3' ? 'audio/mpeg'
            : req.file.mimetype;
  const extension = audioFormat === 'mp3-or-aac' ? (req.file.mimetype === 'audio/aac' ? 'aac' : 'mp3') : audioFormat;
  const originalName = `voice-recording.${extension}`;

  const languageCode = req.body?.language === 'English' ? 'en-IN' : 'ta-IN';
  if (req.body?.language !== undefined && !LANGUAGE_OPTIONS.includes(req.body.language)) {
    return res.status(400).json({ message: 'Choose a supported transcription language.' });
  }

  try {
    const result = await transcribeWithGnani(req.file.buffer, audioMimeType, originalName, languageCode);
    return res.json({
        transcript: result.transcript,
        mode: 'api',
        source: 'gnani',
        message: 'Speech-to-text generated from Gnani Prisma.',
        model: result.model,
        requestId: result.requestId,
      });
  } catch (error) {
    return res.status(error.status === 401 || error.status === 403 ? 502 : 503).json({
      transcript: '',
      mode: 'demo',
      source: 'manual',
      message: error.category === 'credentials_missing'
        ? 'Gnani credentials are not configured. Enter or edit the complaint text manually.'
        : 'Live transcription failed. Enter or edit the complaint text manually.',
      failureCategory: error.category || 'provider_error',
      providerStatus: error.status || null,
    });
  }
});

app.get('/api/complaints', requireAdmin, async (req, res) => {
  try {
    const complaints = await getComplaintStore();
    res.json(complaints);
  } catch (error) {
    console.error('Admin complaint list failed:', error.name);
    res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to fetch complaints.' });
  }
});

app.get('/api/dashboard', requireAdmin, async (req, res) => {
  try {
    const complaints = await getComplaintStore();
    return res.json(getDashboardSummary(complaints));
  } catch (error) {
    console.error('Admin dashboard summary failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to calculate dashboard analytics.' });
  }
});

app.get('/api/complaints/:id', async (req, res) => {
  try {
    const complaint = await findComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    return res.json(toPublicTrackingRecord(complaint));
  } catch (error) {
    console.error('Public complaint lookup failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to fetch complaint.' });
  }
});

app.post('/api/complaints', rateLimit({ windowMs: 60 * 1000, maxRequests: 10, message: 'Too many complaint submissions. Try again shortly.' }), async (req, res) => {
  try {
    const complaint = await createComplaintFromPayload(req.body || {});
    return res.status(201).json({
      ...toPublicTrackingRecord(complaint),
      persistenceMode: mongoose.connection.readyState === 1 ? 'mongodb' : 'demo-memory',
      geocodingMessage: complaint.geocodingStatus === 'success'
        ? 'Location matched by OpenStreetMap Nominatim; geocoding identifies an address match, not the user’s exact position.'
        : 'Complaint saved, but this location could not be plotted accurately.',
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    if (error.status === 503) return res.status(503).json({ message: error.message });
    console.error('Complaint creation failed:', error.name);
    return res.status(500).json({ message: 'Failed to save complaint.' });
  }
});

app.patch('/api/complaints/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status, note, urgency } = req.body || {};
    if (!STATUS_OPTIONS.includes(status) || (urgency !== undefined && !URGENCY_OPTIONS.includes(urgency))) {
      return res.status(400).json({ message: 'Choose a valid status and urgency.' });
    }
    const updatedComplaint = await updateComplaintStatus(req.params.id, status, note, urgency);
    if (!updatedComplaint) return res.status(404).json({ message: 'Complaint not found' });
    return res.json(updatedComplaint);
  } catch (error) {
    console.error('Complaint status update failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to update complaint status.' });
  }
});

app.patch('/api/complaints/:id', requireAdmin, async (req, res) => {
  try {
    const updatedComplaint = await updateComplaintFields(req.params.id, req.body || {});
    if (!updatedComplaint) return res.status(404).json({ message: 'Complaint not found' });
    return res.json(updatedComplaint);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('Complaint update failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to update complaint details.' });
  }
});

app.get('/api/stats', requireAdmin, async (req, res) => {
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
    console.error('Admin stats failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to calculate stats.' });
  }
});

app.get('/api/complaints/:id/confirmation', rateLimit({ windowMs: 60 * 1000, maxRequests: 10, message: 'Too many audio confirmation requests. Try again shortly.' }), async (req, res) => {
  try {
    const complaint = await findComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    const text = `உங்கள் புகார் ${complaint.ticketId} பதிவு செய்யப்பட்டுள்ளது. ${complaint.category} பிரச்சனைக்கு விரைவாக நடவடிக்கை எடுக்கப்படும்.`;
    const result = await synthesizeTamilConfirmation(text);
    return res.json(result);
  } catch (error) {
    console.error('Tamil confirmation failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to generate confirmation.' });
  }
});

app.get('/api/admin/complaints', requireAdmin, async (req, res) => {
  try {
    const complaints = await getComplaintStore();
    return res.json(complaints);
  } catch (error) {
    console.error('Admin complaint list failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to load complaints.' });
  }
});

app.get('/api/admin/complaints/:id', requireAdmin, async (req, res) => {
  try {
    const complaint = await findComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
    return res.json(complaint);
  } catch (error) {
    console.error('Admin complaint detail lookup failed:', error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Failed to fetch complaint.' });
  }
});

app.use((error, req, res, next) => {
  console.error('Unhandled request error:', error.name || 'Error');
  const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  res.status(status).json({ message: status === 413 ? 'Audio upload exceeds the 20 MB limit.' : 'Invalid request.' });
});

// Connect to MongoDB before accepting requests
connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`NammaFix AI backend listening on http://localhost:${PORT}`);
      console.log(`Client origin configured for ${CLIENT_URL}`);
      console.log(`Database mode: ${mongoStatus.mode}`);
    });
  })
  .catch((error) => {
    console.error('Unexpected database startup error:', error.name);
    process.exit(1);
  });
