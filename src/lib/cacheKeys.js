// Central registry of Redis cache keys so producers and invalidators agree.

// Default first page of /products (no filters/sort). Invalidated on any product mutation.
export const PRODUCTS_DEFAULT_KEY = "public:products:default";

// Public /stats aggregate. TTL-only (no explicit invalidation).
export const STATS_KEY = "public:stats";

// Public /sellers/top, keyed by limit. TTL-only.
export const sellersTopKey = (limit) => `public:sellers:top:${limit}`;
