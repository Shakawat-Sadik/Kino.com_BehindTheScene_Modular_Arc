import { sendError } from "../../lib/respond.js";
import { invalidateAuthUser } from "../../lib/authCache.js";
import { getProfile, updateProfile } from "./profile.service.js";

export async function get(req, res) {
  try {
    const user = await getProfile(req.db, req.user.email);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const { password, ...profile } = user;
    res.status(200).json({ success: true, result: profile });
  } catch (e) {
    sendError(res, 500, "Failed to fetch profile", e);
  }
}

export async function update(req, res) {
  try {
    const { name, contact, location, image, role } = req.body;
    const updateDoc = { updatedAt: new Date() };
    if (name !== undefined) updateDoc.name = name;
    if (contact !== undefined) updateDoc.contact = contact;
    if (location !== undefined) updateDoc.location = location;
    if (image !== undefined) updateDoc.image = image;
    if (role !== undefined && ["buyer", "seller"].includes(role)) updateDoc.role = role;

    const result = await updateProfile(req.db, req.user.email, updateDoc);
    await invalidateAuthUser(req.user.email);
    res.status(200).json({ success: true, message: "Profile updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update profile", e);
  }
}
