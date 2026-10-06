import { ObjectId } from "mongodb";

// Strict: rejects inputs that ObjectId would silently coerce (e.g. 12-char strings).
export const isValidObjectId = (id) => {
  try {
    return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
  } catch {
    return false;
  }
};

export const toObjectId = (id) => new ObjectId(id);

export { ObjectId };
