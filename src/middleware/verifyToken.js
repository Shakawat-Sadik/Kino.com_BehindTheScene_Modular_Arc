import { jwtVerify } from "jose";
import { JWKS } from "../config/jwks.js";

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized entry" });
    }
    const token = authHeader.split(" ")[1];
    try {
      const { payload } = await jwtVerify(token, JWKS);
      req.user = payload;
      next();
    } catch (e) {
      console.error("[verifyToken] jose error:", e.code, e.message);
      return res.status(403).json({ success: false, message: "Invalid or expired token", debug: e.code });
    }
  } catch (e) {
    return res.status(401).json({ success: false, message: "Authentication error" });
  }
};
