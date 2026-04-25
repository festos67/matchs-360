import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // F-707: strip console.* and debugger statements from production bundle
    // to avoid leaking Supabase error objects, stack traces, UUIDs and PII
    // via DevTools. Dev mode keeps everything for DX.
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
}));
