const mongoose = require('mongoose');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { User, hashPassword } = require('../models/User');

function configurationError(message) {
  const error = new Error(message);
  error.isSafeToLog = true;
  return error;
}

async function bootstrapAdmin() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const mongoUri = process.env.MONGO_URI;

  if (!name || !email || !password || !mongoUri) {
    throw configurationError('ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, and MONGO_URI must be configured.');
  }
  if (
    name.length > 120
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || email.length > 254
    || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw configurationError('Provide a valid admin name and email, and a password between 8 and 72 UTF-8 bytes.');
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      console.log('An account with this email already exists; no changes were made.');
      return;
    }

    await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
    });
    console.log('Admin account created.');
  } catch (error) {
    if (error.code === 11000) {
      console.log('An account with this email already exists; no changes were made.');
      return;
    }
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

bootstrapAdmin().catch(async (error) => {
  const message = error.isSafeToLog ? error.message : 'Database operation failed.';
  console.error(`Admin bootstrap failed: ${message}`);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
