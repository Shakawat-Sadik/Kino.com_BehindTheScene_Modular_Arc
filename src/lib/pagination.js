// Clamp page to [1, MAX_PAGE] and limit to [1, 100]; compute skip.
// MAX_PAGE bounds skip (O(skip) cost) so deep pagination can't be abused.
const MAX_PAGE = 10000;

export const parsePagination = (query) => {
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(query.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
};
