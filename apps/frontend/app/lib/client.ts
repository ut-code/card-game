import type { AppType } from "@apps/backend";
import { hc } from "hono/client";

export const client = hc<AppType>("http://localhost:8787");
