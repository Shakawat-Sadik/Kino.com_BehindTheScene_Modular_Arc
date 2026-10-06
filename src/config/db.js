/**
 * Cached Mongo connection + long-lived pool for the persistent Render process.
 * One warm pool is reused across every request — never call client.connect()
 * per request. Preserves the promise-coalescing race fix from the original.
 */
import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "./env.js";

export const client = new MongoClient(env.MONGODB_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  maxPoolSize: 20,
  minPoolSize: 5,
  maxIdleTimeMS: 60000,
  serverSelectionTimeoutMS: 5000,
});

let cacheDB = null;
let connectPromise = null;

export const connectToDB = async () => {
  if (cacheDB) return cacheDB;

  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        await client.connect();
        cacheDB = client.db(env.DB_NAME);
        return cacheDB;
      } catch (e) {
        connectPromise = null; // allow retry on failure
        throw e;
      }
    })();
  }

  return connectPromise;
};

export const closeDB = () => client.close();
