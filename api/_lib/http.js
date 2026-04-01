function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function handlePreflight(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

function requirePost(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed, use POST" });
    return false;
  }
  return true;
}

async function verifyBearer(req, admin) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  const idToken = authHeader.slice(7);
  return admin.auth().verifyIdToken(idToken);
}

module.exports = { setCors, handlePreflight, requirePost, verifyBearer };
