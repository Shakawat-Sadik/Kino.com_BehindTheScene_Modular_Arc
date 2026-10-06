import { parsePagination } from "../../lib/pagination.js";
import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import { getOrSet } from "../../lib/cache.js";
import { PRODUCTS_DEFAULT_KEY } from "../../lib/cacheKeys.js";
import { anchored } from "../../lib/search.js";
import { listProducts, getProductById } from "./products.service.js";

const DEFAULT_TTL = 300; // 5 min

// The unfiltered first page — the hot path. Cached + invalidated on any product mutation.
function isDefaultQuery(q) {
  return (
    !q.search && !q.category && !q.status && !q.condition && !q.sort && !q.order &&
    (q.page === undefined || q.page === "1") &&
    (q.limit === undefined || q.limit === "10")
  );
}

export async function list(req, res) {
  try {
    const { sort, order, search, category, status, condition } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (search) filter.title = anchored(search);
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (condition) filter.condition = condition;

    const sortObj = {};
    if (sort) {
      const direction = order === "desc" ? -1 : 1;
      if (sort === "price") sortObj.price = direction;
      if (sort === "dateUploaded") sortObj.dateUploaded = direction;
    }

    const fetch = () => listProducts(req.db, { filter, sortObj, skip, limit });
    const { result, total } = isDefaultQuery(req.query)
      ? await getOrSet(PRODUCTS_DEFAULT_KEY, DEFAULT_TTL, fetch)
      : await fetch();

    res.status(200).json({
      success: true,
      message: "Products loaded successfully",
      result,
      total,
      page,
      limit,
    });
  } catch (e) {
    sendError(res, 500, "Failed to load products", e);
  }
}

export async function getById(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const result = await getProductById(req.db, req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.status(200).json({ success: true, message: "Product info loaded", result });
  } catch (e) {
    sendError(res, 500, "Failed to load product", e);
  }
}
