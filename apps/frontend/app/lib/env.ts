const IS_DEV = import.meta.env.DEV;

const API_BASE_URL = IS_DEV ? "http://localhost:8787" : "/api";

export { API_BASE_URL, IS_DEV };
