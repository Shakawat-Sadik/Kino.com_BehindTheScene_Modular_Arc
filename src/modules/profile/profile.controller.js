import { sendError } from "../../lib/respond.js";
import { invalidateAuthUser } from "../../lib/authCache.js";
import { del } from "../../lib/cache.js";
import { PRODUCTS_DEFAULT_KEY } from "../../lib/cacheKeys.js";
import { sellerSnapshotUpdate } from "../../lib/sellerSnapshot.js";
import {
  getProfile,
  updateProfile,
  updateSellerProductSnapshots,
} from "./profile.service.js";

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

    // Eagerly propagate the changed fields into this seller's denormalized product
    // snapshots (sellerName / location1 / contact.mobile1). Bounded to one seller's
    // own listings and keyed by the indexed `sellerEmail`, so a synchronous
    // updateMany stays cheap while keeping product reads side-effect-free and
    // always fresh. Done in-request (not fire-and-forget) because the backup
    // backend runs on Vercel serverless, where work started after the response may
    // never execute. Best-effort: the profile save is the source of truth, so a
    // failure to refresh the derived snapshots is logged, not surfaced as an error.
    const snapshot = sellerSnapshotUpdate(updateDoc);
    if (Object.keys(snapshot).length > 0) {
      try {
        await updateSellerProductSnapshots(req.db, req.user.email, snapshot);
        await del(PRODUCTS_DEFAULT_KEY);
      } catch (e) {
        console.error(`[profile] snapshot propagation failed for ${req.user.email}:`, e.message);
      }
    }

    res.status(200).json({ success: true, message: "Profile updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update profile", e);
  }
}
