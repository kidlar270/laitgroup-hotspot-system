const admin = require("firebase-admin");

let initialized = false;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable");
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) {
      parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
  }
}

function getAdmin() {
  if (!initialized) {
    if (!admin.apps.length) {
      const serviceAccount = parseServiceAccount();
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    initialized = true;
  }
  return admin;
}

module.exports = { getAdmin };
