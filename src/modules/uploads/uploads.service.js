import { cloudinary } from "../../config/cloudinary.js";

export function findByHash(db, hash) {
  return db.collection("cloudinary_uploads").findOne({ hash });
}

export function findByPublicId(db, publicId) {
  return db.collection("cloudinary_uploads").findOne({ public_id: publicId });
}

export function insertUpload(db, doc) {
  return db.collection("cloudinary_uploads").insertOne(doc);
}

export function deleteByPublicId(db, publicId) {
  return db.collection("cloudinary_uploads").deleteOne({ public_id: publicId });
}

export function uploadImage(dataUri, folder) {
  return cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    transformation: [
      { width: 1200, height: 900, crop: "limit" },
      { quality: "auto" },
      { fetch_format: "auto" },
    ],
  });
}

export function destroyImage(publicId) {
  return cloudinary.uploader.destroy(publicId);
}
