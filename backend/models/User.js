const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['citizen', 'user', 'admin', 'officer'], default: 'citizen' },
    authVersion: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function hashPassword(password) {
  return bcrypt.hash(String(password || ''), 12);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(String(password || ''), passwordHash);
}

module.exports = { User, hashPassword, comparePassword };
