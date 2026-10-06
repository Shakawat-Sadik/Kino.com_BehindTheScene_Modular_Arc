import crypto from "crypto";
import { sendError } from "../../lib/respond.js";
import * as service from "./uploads.service.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function upload(req, res) {
  try {
    const mimeType = req.headers["content-type"] || "image/jpeg";
    const folder = req.headers["x-upload-folder"] || "Kino.com";
    const fileName = req.headers["x-upload-filename"] || "upload";

    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
      received += chunk.length;
      if (received > MAX_UPLOAD_BYTES) {
        req.destroy();
        return res.status(413).json({ success: false, message: "File too large (max 10MB)" });
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (!buffer.length) {
      return res.status(400).json({ success: false, message: "No file data received" });
    }

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    const existing = await service.findByHash(req.db, hash);
    if (existing) {
      return res.status(200).json({
        success: true,
        result: { url: existing.url, public_id: existing.public_id, isDuplicate: true },
      });
    }

    const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const result = await service.uploadImage(dataUri, folder);

    try {
      await service.insertUpload(req.db, {
        hash,
        fileName,
        fileSize: buffer.length,
        mimeType,
        public_id: result.public_id,
        url: result.secure_url,
        folder: result.folder,
        uploadedBy: req.user.email,
        createdAt: new Date(),
      });
    } catch (e) {
      if (e.code === 11000) {
        const winner = await service.findByHash(req.db, hash);
        return res.status(200).json({
          success: true,
          result: { url: winner.url, public_id: winner.public_id, isDuplicate: true },
        });
      }
      throw e;
    }

    return res.status(200).json({
      success: true,
      result: { url: result.secure_url, public_id: result.public_id, isDuplicate: false },
    });
  } catch (e) {
    sendError(res, 500, "Upload failed", e);
  }
}

export async function remove(req, res) {
  try {
    const publicId = req.params.publicId;

    const record = await service.findByPublicId(req.db, publicId);
    if (!record) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }
    if (record.uploadedBy !== req.user.email) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await service.destroyImage(publicId);
    await service.deleteByPublicId(req.db, publicId);

    return res.status(200).json({ success: true, message: "Image deleted" });
  } catch (e) {
    sendError(res, 500, "Delete failed", e);
  }
}
