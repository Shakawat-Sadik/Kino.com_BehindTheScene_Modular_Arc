import { connectToDB } from "../config/db.js";

// Make the warm DB handle available as req.db on every request.
export const attachDb = async (req, res, next) => {
  try {
    req.db = await connectToDB();
    next();
  } catch (e) {
    res.status(503).json({ success: false, message: "Database unavailable" });
  }
};
