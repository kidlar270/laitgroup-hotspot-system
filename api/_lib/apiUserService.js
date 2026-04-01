async function findApiUser(admin) {
  let pageToken;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    const found = result.users.find((user) => user.customClaims && user.customClaims.api_user);
    if (found) return found;
    pageToken = result.pageToken;
  } while (pageToken);
  return null;
}

async function ensureApiUser(admin) {
  const existing = await findApiUser(admin);
  if (existing) return existing;

  const userRecord = await admin.auth().createUser({
    email: `api-user-${Date.now()}@hotspotpro.com`,
    password: Math.random().toString(36).slice(-12),
  });
  await admin.auth().setCustomUserClaims(userRecord.uid, { api_user: true });
  return userRecord;
}

module.exports = { findApiUser, ensureApiUser };
