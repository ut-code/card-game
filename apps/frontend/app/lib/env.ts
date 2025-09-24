const IS_DEV = import.meta.env.DEV;

const API_HOST = IS_DEV ? "localhost:8787" : `${import.meta.env.API_URL}/api`;

export { API_HOST };
