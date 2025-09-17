import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		reactRouter(),
		tsconfigPaths(),
	],
	// server: {
	// 	proxy: {
	// 		// バックエンドAPIへのリクエストをプロキシする
	// 		"/api": {
	// 			target: "http://127.0.0.1:8787", // バックエンドサーバーのアドレス
	// 			changeOrigin: true,
	// 		},
	// 	},
	// },
});
