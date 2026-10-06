export async function getProfile(db, email) {
  return db.collection("user").findOne({ email });
}

export async function updateProfile(db, email, update) {
  return db.collection("user").updateOne({ email }, { $set: update });
}
