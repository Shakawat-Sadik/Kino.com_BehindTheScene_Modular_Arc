/**
 * Validation middleware factory. Rejects malformed request bodies with 400
 * before any controller/DB work. Does NOT mutate req.body — controllers keep
 * reading/coercing their own fields, so accepted inputs are unchanged; only
 * genuinely invalid payloads are now rejected earlier.
 */
export const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join(".");
    const message = path ? `${path}: ${first.message}` : first.message;
    return res.status(400).json({ success: false, message });
  }
  next();
};
