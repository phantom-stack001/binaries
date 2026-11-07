import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "local",
    ),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (error, _request, response) => {
            const code =
              typeof error === "object" && error && "code" in error && typeof error.code === "string"
                ? error.code
                : "ECONNREFUSED";
            console.error(`[dev] API proxy ${code}`);
            if (!response || !("writeHead" in response) || !("headersSent" in response) || response.headersSent) {
              return;
            }
            response.writeHead(503, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            response.end(
              JSON.stringify({
                error: "API is not accepting connections.",
                code: "api_unavailable",
              }),
            );
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-router") || id.includes("node_modules/react-router-dom")) {
            return "router";
          }
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
            return "tiptap";
          }
        },
      },
    },
  },
});
