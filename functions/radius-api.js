const crypto = require("crypto");
const net = require("net");
const tls = require("tls");
const express = require("express");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

function encodeLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x4000) return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
  if (length < 0x200000) {
    return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff]);
  }
  if (length < 0x10000000) {
    return Buffer.from([(length >> 24) | 0xe0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  }
  return Buffer.from([0xf0, (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
}

function decodeLength(buffer, offset) {
  const first = buffer[offset];
  if (first < 0x80) return { length: first, bytesRead: 1 };
  if ((first & 0xc0) === 0x80) return { length: ((first & ~0xc0) << 8) + buffer[offset + 1], bytesRead: 2 };
  if ((first & 0xe0) === 0xc0) {
    return {
      length: ((first & ~0xe0) << 16) + (buffer[offset + 1] << 8) + buffer[offset + 2],
      bytesRead: 3,
    };
  }
  if ((first & 0xf0) === 0xe0) {
    return {
      length: ((first & ~0xf0) << 24) + (buffer[offset + 1] << 16) + (buffer[offset + 2] << 8) + buffer[offset + 3],
      bytesRead: 4,
    };
  }
  return {
    length: (buffer[offset + 1] << 24) + (buffer[offset + 2] << 16) + (buffer[offset + 3] << 8) + buffer[offset + 4],
    bytesRead: 5,
  };
}

function sentenceToBuffer(words) {
  const parts = [];
  for (const word of words) {
    const wordBuffer = Buffer.from(word, "utf8");
    parts.push(encodeLength(wordBuffer.length), wordBuffer);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

class RouterOsApiClient {
  constructor({ host, port, username, password, ssl = false, timeoutMs = 15000 }) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.ssl = ssl;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
  }

  async connect() {
    this.socket = this.ssl
      ? tls.connect({ host: this.host, port: this.port, rejectUnauthorized: false })
      : net.createConnection({ host: this.host, port: this.port });

    this.socket.setTimeout(this.timeoutMs);
    this.socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushPending();
    });
    this.socket.on("error", (error) => {
      while (this.pending.length) {
        this.pending.shift().reject(error);
      }
    });
    this.socket.on("timeout", () => {
      const timeoutError = new Error("MikroTik API timed out.");
      while (this.pending.length) {
        this.pending.shift().reject(timeoutError);
      }
      this.socket.destroy(timeoutError);
    });

    await new Promise((resolve, reject) => {
      this.socket.once("connect", resolve);
      this.socket.once("secureConnect", resolve);
      this.socket.once("error", reject);
    });
  }

  close() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
      this.socket.destroy();
    }
  }

  flushPending() {
    while (this.pending.length) {
      const sentence = this.tryReadSentence();
      if (!sentence) return;
      this.pending[0].sentences.push(sentence);
      const firstWord = sentence[0] || "";
      if (firstWord === "!done" || firstWord === "!trap" || firstWord === "!fatal") {
        this.pending.shift().resolve();
      }
    }
  }

  tryReadSentence() {
    let offset = 0;
    const words = [];
    while (true) {
      if (this.buffer.length <= offset) return null;
      const { length, bytesRead } = decodeLength(this.buffer, offset);
      if (this.buffer.length < offset + bytesRead + length) return null;
      offset += bytesRead;
      if (length === 0) {
        this.buffer = this.buffer.slice(offset);
        return words;
      }
      words.push(this.buffer.slice(offset, offset + length).toString("utf8"));
      offset += length;
    }
  }

  async send(words) {
    const sentences = [];
    const waitForDone = new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject, sentences });
    });
    this.socket.write(sentenceToBuffer(words));
    await waitForDone;
    return sentences;
  }

  firstReply(sentences) {
    return sentences.find((sentence) => sentence[0]?.startsWith("!")) || [];
  }

  getAttr(sentences, key) {
    const prefix = `=${key}=`;
    for (const sentence of sentences) {
      for (const word of sentence) {
        if (word.startsWith(prefix)) return word.slice(prefix.length);
      }
    }
    return null;
  }

  async login() {
    const modern = this.firstReply(
      await this.send(["/login", `=name=${this.username}`, `=password=${this.password}`])
    );
    if (modern[0] === "!done") return;

    const challengeReply = await this.send(["/login"]);
    const ret = this.getAttr(challengeReply, "ret");
    if (!ret) throw new Error("MikroTik login failed.");

    const challenge = Buffer.from(ret, "hex");
    const hash = crypto.createHash("md5");
    hash.update(Buffer.from([0]));
    hash.update(Buffer.from(this.password, "utf8"));
    hash.update(challenge);
    const response = `00${hash.digest("hex")}`;

    const legacy = this.firstReply(
      await this.send(["/login", `=name=${this.username}`, `=response=${response}`])
    );
    if (legacy[0] !== "!done") throw new Error("MikroTik legacy login failed.");
  }
}

function parseSentence(sentence) {
  const record = {};
  for (const word of sentence) {
    if (word.startsWith("=.id=")) record.id = word.slice("=.id=".length);
    else if (word.startsWith("=name=")) record.name = word.slice("=name=".length);
    else if (word.startsWith("=user=")) record.user = word.slice("=user=".length);
  }
  return record;
}

function buildRateLimit(packageData = {}) {
  const down = Number(packageData.downloadSpeed || 0);
  const up = Number(packageData.uploadSpeed || 0);
  if (down > 0 && up > 0) return `${up}M/${down}M`;
  return null;
}

async function verifyCaller(appId, userId, req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    if (decoded.uid !== userId) {
      throw Object.assign(new Error("userId does not match token"), { statusCode: 403 });
    }
    return { mode: "firebase", uid: decoded.uid };
  }

  const requestSecret = req.headers["x-radius-secret"] || req.body.apiSecret;
  if (!requestSecret) {
    throw Object.assign(new Error("Missing auth (Bearer token or x-radius-secret)"), { statusCode: 401 });
  }

  const configRef = db.doc(`artifacts/${appId}/users/${userId}/config/radius`);
  const configSnap = await configRef.get();
  const expectedSecret = configSnap.exists ? configSnap.data().apiSecret : null;
  if (!expectedSecret || String(requestSecret) !== String(expectedSecret)) {
    throw Object.assign(new Error("Invalid radius API secret"), { statusCode: 401 });
  }
  return { mode: "radius-secret", uid: userId };
}

async function resolveRouterConfig(appId, userId, routerId) {
  const candidates = [];
  if (routerId) {
    candidates.push(db.doc(`artifacts/${appId}/users/${userId}/routers/${routerId}`));
  }
  candidates.push(db.doc(`artifacts/${appId}/users/${userId}/config/mikrotik`));

  for (const ref of candidates) {
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data();
    const host = data.ip || data.host;
    const port = Number(data.port || 8728);
    const username = data.username;
    const password = data.password;
    if (host && username && password) {
      return { host, port, username, password, ssl: port === 8729 };
    }
  }
  throw Object.assign(new Error("MikroTik config not found or incomplete"), { statusCode: 400 });
}

async function findHotspotUserByName(client, username) {
  const sentences = await client.send([
    "/ip/hotspot/user/print",
    `?name=${username}`,
    "=.proplist=.id,name",
  ]);
  for (const sentence of sentences) {
    const record = parseSentence(sentence);
    if (record.id) return record.id;
  }
  return null;
}

async function upsertHotspotUser(client, username, password, profileName) {
  const existingId = await findHotspotUserByName(client, username);
  if (existingId) {
    const words = ["/ip/hotspot/user/set", `=.id=${existingId}`, `=password=${password}`];
    if (profileName) words.push(`=profile=${profileName}`);
    await client.send(words);
    return "updated";
  }

  const words = ["/ip/hotspot/user/add", `=name=${username}`, `=password=${password}`];
  if (profileName) words.push(`=profile=${profileName}`);
  await client.send(words);
  return "created";
}

async function removeActiveSessions(client, username) {
  const sessions = await client.send([
    "/ip/hotspot/active/print",
    `?user=${username}`,
    "=.proplist=.id,user",
  ]);
  const ids = [];
  for (const sentence of sessions) {
    const parsed = parseSentence(sentence);
    if (parsed.id) ids.push(parsed.id);
  }
  for (const id of ids) {
    await client.send(["/ip/hotspot/active/remove", `=.id=${id}`]);
  }
  return ids.length;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  res.json({ ok: true, service: "radius-api", timestamp: Date.now() });
});

app.post("/radius/auth", async (req, res) => {
  try {
    const { appId, userId, username, password, nasIpAddress, callingStationId } = req.body;
    if (!appId || !userId || !username || !password) {
      return res.status(400).json({ reply: "Access-Reject", message: "Missing appId, userId, username, or password" });
    }

    await verifyCaller(appId, userId, req);

    const usersRef = db.collection(`artifacts/${appId}/users/${userId}/hotspot-users`);
    const userSnap = await usersRef.where("username", "==", username).limit(1).get();

    if (userSnap.empty) {
      return res.status(200).json({ reply: "Access-Reject", message: "User not found" });
    }

    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();
    if ((userData.status || "active") !== "active") {
      return res.status(200).json({ reply: "Access-Reject", message: "User disabled" });
    }
    if (String(userData.password || "") !== String(password)) {
      return res.status(200).json({ reply: "Access-Reject", message: "Invalid credentials" });
    }

    let packageData = {};
    if (userData.packageId) {
      const pkgSnap = await db.doc(`artifacts/${appId}/users/${userId}/packages/${userData.packageId}`).get();
      if (pkgSnap.exists) packageData = pkgSnap.data();
    }

    const durationMinutes = Number(packageData.durationMinutes || packageData.durationHours * 60 || 0);
    const sessionTimeout = durationMinutes > 0 ? durationMinutes * 60 : null;
    const rateLimit = buildRateLimit(packageData);

    await db.collection(`artifacts/${appId}/users/${userId}/radiusSessions`).doc(userDoc.id).set(
      {
        username,
        hotspotUserId: userDoc.id,
        packageId: userData.packageId || null,
        status: "authenticated",
        lastAuthAt: serverTimestamp(),
        nasIpAddress: nasIpAddress || null,
        callingStationId: callingStationId || null,
      },
      { merge: true }
    );

    return res.json({
      reply: "Access-Accept",
      message: "Authentication successful",
      attributes: {
        "Session-Timeout": sessionTimeout,
        "Mikrotik-Rate-Limit": rateLimit,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ reply: "Access-Reject", message: error.message || "Auth failed" });
  }
});

app.post("/radius/accounting", async (req, res) => {
  try {
    const {
      appId,
      userId,
      username,
      sessionId,
      statusType,
      inputOctets,
      outputOctets,
      sessionTime,
      framedIpAddress,
      nasIpAddress,
    } = req.body;

    if (!appId || !userId || !username || !sessionId || !statusType) {
      return res.status(400).json({ ok: false, error: "Missing appId, userId, username, sessionId, or statusType" });
    }

    await verifyCaller(appId, userId, req);

    const docRef = db.doc(`artifacts/${appId}/users/${userId}/radiusAccounting/${sessionId}`);
    await docRef.set(
      {
        username,
        sessionId,
        statusType,
        inputOctets: Number(inputOctets || 0),
        outputOctets: Number(outputOctets || 0),
        sessionTime: Number(sessionTime || 0),
        framedIpAddress: framedIpAddress || null,
        nasIpAddress: nasIpAddress || null,
        updatedAt: serverTimestamp(),
        stoppedAt: String(statusType).toLowerCase() === "stop" ? serverTimestamp() : null,
      },
      { merge: true }
    );

    return res.json({ ok: true });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ ok: false, error: error.message || "Accounting failed" });
  }
});

app.post("/mikrotik/hotspot-users/sync", async (req, res) => {
  let client = null;
  try {
    const { appId, userId, routerId, limit } = req.body;
    if (!appId || !userId) {
      return res.status(400).json({ ok: false, error: "Missing appId or userId" });
    }

    await verifyCaller(appId, userId, req);
    const router = await resolveRouterConfig(appId, userId, routerId);

    const snap = await db.collection(`artifacts/${appId}/users/${userId}/hotspot-users`).get();
    const users = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => (u.status || "active") === "active" && u.username && u.password);

    const max = Math.max(1, Number(limit || users.length));
    const selected = users.slice(0, max);

    client = new RouterOsApiClient(router);
    await client.connect();
    await client.login();

    const results = [];
    for (const user of selected) {
      let profileName = null;
      if (user.packageId) {
        const pkgSnap = await db.doc(`artifacts/${appId}/users/${userId}/packages/${user.packageId}`).get();
        if (pkgSnap.exists) profileName = pkgSnap.data().name || null;
      }

      const action = await upsertHotspotUser(client, user.username, user.password, profileName);
      results.push({ username: user.username, action, profile: profileName || null });
    }

    client.close();
    return res.json({
      ok: true,
      synced: results.length,
      results,
      router: `${router.host}:${router.port}`,
    });
  } catch (error) {
    if (client) client.close();
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ ok: false, error: error.message || "Hotspot sync failed" });
  }
});

app.post("/mikrotik/hotspot-users/disconnect", async (req, res) => {
  let client = null;
  try {
    const { appId, userId, routerId, username } = req.body;
    if (!appId || !userId || !username) {
      return res.status(400).json({ ok: false, error: "Missing appId, userId, or username" });
    }

    await verifyCaller(appId, userId, req);
    const router = await resolveRouterConfig(appId, userId, routerId);

    client = new RouterOsApiClient(router);
    await client.connect();
    await client.login();
    const disconnected = await removeActiveSessions(client, username);
    client.close();

    return res.json({ ok: true, disconnected, username });
  } catch (error) {
    if (client) client.close();
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ ok: false, error: error.message || "Disconnect failed" });
  }
});

const radiusApi = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    cors: true,
  },
  app
);

module.exports = { radiusApi };
