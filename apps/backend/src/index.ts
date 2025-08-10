import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// すべてのオリジンからのアクセスを許可（開発用）
app.use("*", cors({
  origin: "*"
}));

// /hello エンドポイント
const route = app.get("/hello", (c) => {
  return c.json({ message: "Hello Hono!" })
});

// Hono Client (RPC) のために型をエクスポート
export type AppType = typeof route;
export default app;