const crypto = require("crypto");
const net = require("net");
const tls = require("tls");
const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

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

/* ===== ROUTER HEALTH CHECK ===== */

exports.checkRouterHealth = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    try {
      const { appId, userId, routerId } = req.query;

      if (!appId || !userId || !routerId) {
        return res.status(400).json({
          error: "Missing parameters: appId, userId, routerId",
        });
      }

      const routerRef = db.doc(
        `artifacts/${appId}/users/${userId}/routers/${routerId}`
      );
      const routerSnap = await routerRef.get();

      if (!routerSnap.exists) {
        return res
          .status(404)
          .json({ error: "Router not found", status: "offline" });
      }

      const router = routerSnap.data();
      const { ip, port, username, password } = router;

      if (!ip || !username || !password) {
        return res
          .status(400)
          .json({ error: "Router credentials incomplete", status: "offline" });
      }

      // Attempt connection
      const client = new RouterOsClient({
        host: ip,
        port: Number(port || 8728),
        username,
        password,
        ssl: Number(port || 8728) === 8729,
      });

      try {
        await client.connect();
        await client.login();
        client.close();

        // Update router status to online
        await routerRef.update({
          status: "online",
          lastHealthCheck: Date.now(),
          lastHealthStatus: "success",
        });

        return res.json({
          status: "online",
          message: "Router is online and responding",
        });
      } catch (connError) {
        client.close();

        // Update router status to offline
        await routerRef.update({
          status: "offline",
          lastHealthCheck: Date.now(),
          lastHealthStatus: "unreachable",
        });

        return res.json({
          status: "offline",
          message: "Could not connect to router",
          error: connError.message,
        });
      }
    } catch (error) {
      logger.error("Health check failed", error);
      return res.status(500).json({
        error: "Health check failed",
        message: error.message,
      });
    }
  }
);

/* ===== M-PESA INTEGRATION ===== */

async function getMpesaAccessToken(consumerKey, consumerSecret) {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  try {
    const response = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    logger.error("Failed to get M-Pesa access token", error.message);
    throw new Error("Could not authenticate with M-Pesa API");
  }
}

async function generateVoucherCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

async function createVoucherFromPayment(appId, userId, packageData, phoneNumber, transactionId) {
  const voucherCode = await generateVoucherCode();
  const vouchersRef = db.collection(`artifacts/${appId}/users/${userId}/vouchers`);
  
  await vouchersRef.add({
    code: voucherCode,
    status: "active",
    price: packageData.price,
    durationHours: packageData.durationHours,
    name: packageData.name,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    phoneNumber: phoneNumber,
    transactionId: transactionId,
    paymentMethod: "mpesa",
    used: false,
  });

  return voucherCode;
}

// Initiate M-Pesa STK Push
exports.initiateMpesaPayment = onRequest(
  {
    region: "us-central1",
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request, response) => {
    // Check request origin and authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return response.status(401).json({ error: "Unauthorized" });
    }

    const idToken = authHeader.substring(7);
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      logger.error("Invalid token", error);
      return response.status(401).json({ error: "Invalid token" });
    }

    const { phoneNumber, amount, packageId, appId, userId } = request.body;

    if (!phoneNumber || !amount || !packageId || !appId || !userId) {
      return response.status(400).json({ error: "Missing required fields" });
    }

    // Get M-Pesa credentials from Firestore
    const credentialsRef = db.doc(`artifacts/${appId}/users/${userId}/config/mpesa`);
    const credentialsSnap = await credentialsRef.get();

    if (!credentialsSnap.exists) {
      return response.status(400).json({ 
        error: "M-Pesa credentials not configured. Contact administrator." 
      });
    }

    const credentials = credentialsSnap.data();
    const {
      consumerKey,
      consumerSecret,
      businessShortcode,
      passkey,
      callbackUrl,
    } = credentials;

    if (!consumerKey || !consumerSecret || !businessShortcode || !passkey) {
      return response.status(400).json({ error: "M-Pesa setup incomplete" });
    }

    try {
      // Get access token
      const accessToken = await getMpesaAccessToken(consumerKey, consumerSecret);

      // Format phone number (ensure it starts with 254)
      let formattedPhone = phoneNumber.replace(/^0/, "254");
      if (!formattedPhone.startsWith("254")) {
        formattedPhone = "254" + formattedPhone;
      }

      // Generate timestamp and password
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, -3);
      const passwordString = `${businessShortcode}${passkey}${timestamp}`;
      const password = Buffer.from(passwordString).toString("base64");

      // Initiate STK Push
      const stkResponse = await axios.post(
        "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        {
          BusinessShortCode: businessShortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.ceil(amount),
          PartyA: formattedPhone,
          PartyB: businessShortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: callbackUrl || `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mpesaCallback`,
          AccountReference: `${userId}-${packageId}`,
          TransactionDesc: `HotspotPro Internet - ${amount} KES`,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Store payment request in Firestore
      const paymentsRef = db.collection(`artifacts/${appId}/users/${userId}/payments`);
      await paymentsRef.add({
        phoneNumber: formattedPhone,
        amount: amount,
        packageId: packageId,
        checkoutRequestId: stkResponse.data.CheckoutRequestID,
        requestTimestamp: new Date().toISOString(),
        status: "pending",
      });

      return response.status(200).json({
        success: true,
        checkoutRequestId: stkResponse.data.CheckoutRequestID,
        message: "STK Push sent to your phone",
      });
    } catch (error) {
      logger.error("STK Push failed", error.response?.data || error.message);
      return response.status(500).json({
        error: error.response?.data?.errorMessage || "STK Push failed",
      });
    }
  }
);

// M-Pesa Payment Callback
exports.mpesaCallback = onRequest(
  {
    region: "us-central1",
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request, response) => {
    try {
      const callbackData = request.body.Body.stkCallback;
      const {
        MerchantRequestID,
        CheckoutRequestID,
        ResultCode,
        ResultDesc,
        CallbackMetadata,
      } = callbackData;

      logger.info("M-Pesa callback received", {
        CheckoutRequestID,
        ResultCode,
        ResultDesc,
      });

      // ResultCode 0 = Success
      if (ResultCode !== 0) {
        logger.warn("Payment failed", { ResultDesc });
        return response.status(200).json({ success: false });
      }

      // Extract transaction metadata
      const metadata = {};
      if (CallbackMetadata?.Item) {
        for (const item of CallbackMetadata.Item) {
          metadata[item.Name] = item.Value;
        }
      }

      const phoneNumber = metadata.PhoneNumber || "";
      const transactionAmount = metadata.Amount || 0;
      const transactionId = metadata.MpesaReceiptNumber || "";

      // Find payment record
      const paymentsQuery = await db
        .collectionGroup("payments")
        .where("checkoutRequestId", "==", CheckoutRequestID)
        .limit(1)
        .get();

      if (paymentsQuery.empty) {
        logger.warn("Payment record not found", { CheckoutRequestID });
        return response.status(200).json({ success: true });
      }

      const paymentDoc = paymentsQuery.docs[0];
      const paymentData = paymentDoc.data();
      const { packageId, userId } = paymentData;

      // Determine appId from the payment doc path
      const pathParts = paymentDoc.ref.path.split("/");
      const appId = pathParts[1];

      // Get package details
      const packageRef = db.doc(
        `artifacts/${appId}/users/${userId}/packages/${packageId}`
      );
      const packageSnap = await packageRef.get();

      if (!packageSnap.exists) {
        logger.warn("Package not found", { packageId, userId, appId });
        return response.status(200).json({ success: true });
      }

      const packageData = packageSnap.data();

      // Create voucher
      const voucherCode = await createVoucherFromPayment(
        appId,
        userId,
        packageData,
        phoneNumber,
        transactionId
      );

      // Update payment record
      await paymentDoc.ref.update({
        status: "completed",
        transactionId: transactionId,
        amount: transactionAmount,
        completedAt: new Date().toISOString(),
        voucherCode: voucherCode,
      });

      logger.info("Payment processed successfully", {
        userId,
        packageId,
        voucherCode,
        transactionId,
      });

      return response.status(200).json({ success: true });
    } catch (error) {
      logger.error("Callback processing failed", error);
      return response.status(500).json({ error: "Callback processing failed" });
    }
  }
);
