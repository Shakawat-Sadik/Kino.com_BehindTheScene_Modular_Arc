// 404 for unmatched routes (consistent JSON envelope).
export const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` });
};
