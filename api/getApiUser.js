const { getAdmin } = require("./_lib/firebaseAdmin");
const { findApiUser } = require("./_lib/apiUserService");
const { handlePreflight, requirePost, setCors, verifyBearer } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (!requirePost(req, res)) return;
  setCors(res);

  try {
    const admin = getAdmin();
    await verifyBearer(req, admin);
    const apiUser = await findApiUser(admin);
    return res.status(200).json({
      success: true,
      apiUser: apiUser ? { uid: apiUser.uid, email: apiUser.email || null } : null,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "Internal server error",
    });
  }
};
