const crypto = require("crypto");
const net = require("net");
const tls = require("tls");
const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

admin.initializeApp();

const db = admin.firestore();
const SYNC_SCRIPT_NAME = "hotspotpro-auto-sync";

function encodeLength(length) {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  if (length < 0x4000) {
    return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
  }
  if (length < 0x200000) {
    return Buffer.from([
      (length >> 16) | 0xc0,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }
  if (length < 0x10000000) {
    return Buffer.from([
      (length >> 24) | 0xe0,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }

  return Buffer.from([
    0xf0,
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
  ]);
}

function decodeLength(buffer, offset) {
  const first = buffer[offset];
  if (first < 0x80) {
    return { length: first, bytesRead: 1 };
  }
  if ((first & 0xc0) === 0x80) {
    return {
      length: ((first & ~0xc0) << 8) + buffer[offset + 1],
      bytesRead: 2,
    };
  }
  if ((first & 0xe0) === 0xc0) {
    return {
      length:
        ((first & ~0xe0) << 16) +
        (buffer[offset + 1] << 8) +
        buffer[offset + 2],
      bytesRead: 3,
    };
  }
  if ((first & 0xf0) === 0xe0) {
    return {
      length:
        ((first & ~0xf0) << 24) +
        (buffer[offset + 1] << 16) +
        (buffer[offset + 2] << 8) +
        buffer[offset + 3],
      bytesRead: 4,
    };
  }

  return {
    length:
      (buffer[offset + 1] << 24) +
      (buffer[offset + 2] << 16) +
      (buffer[offset + 3] << 8) +
      buffer[offset + 4],
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

class RouterOsClient {
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
      ? tls.connect({
          host: this.host,
          port: this.port,
          rejectUnauthorized: false,
        })
      : net.createConnection({
          host: this.host,
          port: this.port,
        });

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
      const error = new Error("Timed out while talking to MikroTik.");
      while (this.pending.length) {
        this.pending.shift().reject(error);
      }
      this.socket.destroy(error);
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
      if (!sentence) {
        return;
      }
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
      if (this.buffer.length <= offset) {
        return null;
      }

      const { length, bytesRead } = decodeLength(this.buffer, offset);
      if (this.buffer.length < offset + bytesRead + length) {
        return null;
      }

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

  getAttribute(sentences, key) {
    const prefix = `=${key}=`;
    for (const sentence of sentences) {
      for (const word of sentence) {
        if (word.startsWith(prefix)) {
          return word.slice(prefix.length);
        }
      }
    }
    return null;
  }

  getFirstReply(sentences) {
    return sentences.find((sentence) => sentence[0]?.startsWith("!")) || [];
  }

  async login() {
    const modernReply = this.getFirstReply(
      await this.send([
        "/login",
        `=name=${this.username}`,
        `=password=${this.password}`,
      ])
    );

    if (modernReply[0] === "!done") {
      return;
    }

    const challengeReply = await this.send(["/login"]);
    const ret = this.getAttribute(challengeReply, "ret");
    if (!ret) {
      throw new Error("MikroTik login failed.");
    }

    const challenge = Buffer.from(ret, "hex");
    const hash = crypto.createHash("md5");
    hash.update(Buffer.from([0]));
    hash.update(Buffer.from(this.password, "utf8"));
    hash.update(challenge);
    const response = `00${hash.digest("hex")}`;

    const legacyReply = this.getFirstReply(
      await this.send([
        "/login",
        `=name=${this.username}`,
        `=response=${response}`,
      ])
    );

    if (legacyReply[0] !== "!done") {
      throw new Error("MikroTik legacy login failed.");
    }
  }

  async findScriptIdByName(name) {
    const sentences = await this.send([
      "/system/script/print",
      "?name=" + name,
      "=.proplist=.id,name",
    ]);

    for (const sentence of sentences) {
      const idWord = sentence.find((word) => word.startsWith("=.id="));
      if (idWord) {
        return idWord.slice("=.id=".length);
      }
    }

    return null;
  }

  async upsertAndRunScript(name, source) {
    const existingId = await this.findScriptIdByName(name);

    if (existingId) {
      const reply = this.getFirstReply(
        await this.send([
          "/system/script/set",
          `=.id=${existingId}`,
          `=source=${source}`,
        ])
      );
      if (reply[0] !== "!done") {
        throw new Error("Could not update existing RouterOS script.");
      }
    } else {
      const reply = this.getFirstReply(
        await this.send([
          "/system/script/add",
          `=name=${name}`,
          `=source=${source}`,
          "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        ])
      );
      if (reply[0] !== "!done") {
        throw new Error("Could not create RouterOS sync script.");
      }
    }

    const runReply = this.getFirstReply(
      await this.send([
        "/system/script/run",
        `=number=${name}`,
      ])
    );

    if (runReply[0] !== "!done") {
      throw new Error("RouterOS script execution failed.");
    }
  }
}

async function setSyncState(ref, requestUpdatedAt, values) {
  await ref.set(
    {
      lastProcessedAt: requestUpdatedAt,
      ...values,
    },
    { merge: true }
  );
}

exports.syncMikrotikOnWrite = onDocumentWritten(
  {
    document: "artifacts/{appId}/users/{userId}/sync/mikrotik",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const after = event.data.after;
    if (!after.exists) {
      return;
    }

    const syncData = after.data();
    const syncRef = after.ref;
    const requestUpdatedAt = syncData.updatedAt || 0;

    if (syncData.lastProcessedAt === requestUpdatedAt) {
      return;
    }

    const { appId, userId } = event.params;
    const configRef = db.doc(`artifacts/${appId}/users/${userId}/config/mikrotik`);
    const configSnap = await configRef.get();

    if (!configSnap.exists) {
      await setSyncState(syncRef, requestUpdatedAt, {
        lastSyncStatus: "error",
        lastSyncMessage: "Router settings are missing. Save MikroTik credentials first.",
      });
      return;
    }

    const config = configSnap.data();
    const host = config.ip;
    const port = Number(config.port || 8728);
    const username = config.username;
    const password = config.password;
    const script = syncData.script;

    if (!host || !username || !password || !script) {
      await setSyncState(syncRef, requestUpdatedAt, {
        lastSyncStatus: "error",
        lastSyncMessage: "Missing router IP, username, password, or generated sync script.",
      });
      return;
    }

    const client = new RouterOsClient({
      host,
      port,
      username,
      password,
      ssl: port === 8729,
    });

    try {
      logger.info("Starting MikroTik sync", {
        host,
        userId,
        appId,
        updatedAt: requestUpdatedAt,
      });

      await client.connect();
      await client.login();
      await client.upsertAndRunScript(SYNC_SCRIPT_NAME, script);
      client.close();

      await setSyncState(syncRef, requestUpdatedAt, {
        lastSyncStatus: "success",
        lastSyncMessage: `MikroTik updated on ${host}:${port}`,
        lastSyncedAt: Date.now(),
      });
    } catch (error) {
      client.close();
      logger.error("MikroTik sync failed", error);

      await setSyncState(syncRef, requestUpdatedAt, {
        lastSyncStatus: "error",
        lastSyncMessage: error.message || "Unknown MikroTik sync error",
        lastSyncedAt: Date.now(),
      });
    }
  }
);
