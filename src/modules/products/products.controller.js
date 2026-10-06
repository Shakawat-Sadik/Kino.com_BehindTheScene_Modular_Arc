import { parsePagination } from "../../lib/pagination.js";
import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import { listProducts, getProductById } from "./products.service.js";

export async function list(req, res) {
  try {
    const { sort, order, search, category, status, condition } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (search) filter.title = { $regex: search, $options: "i" };
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (condition) filter.condition = condition;

    const sortObj = {};
    if (sort) {
      const direction = order === "desc" ? -1 : 1;
      if (sort === "price") sortObj.price = direction;
      if (sort === "dateUploaded") sortObj.dateUploaded = direction;
    }

    const { result, total } = await listProducts(req.db, { filter, sortObj, skip, limit });

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
