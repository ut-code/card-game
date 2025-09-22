import handle from "hono-react-router-adapter/cloudflare-workers";
import * as build from "./../../frontend/build/server";
import app, { Magic } from "./index";

// SSR + Hono(API/WS)
export default handle(build, app);

export { Magic };
