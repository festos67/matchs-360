import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { componentTagger } from "lovable-tagger";

/**
 * PERF — Pré-compression des assets au build (.gz + .br).
 *
 * L'hébergement OVH mutualisé ne charge PAS mod_deflate : la directive
 * AddOutputFilterByType du .htaccess est ignorée silencieusement et tout est
 * servi brut (~700 Ko au premier chargement). On génère donc les variantes
 * compressées à la construction ; le .htaccess les sert via réécriture quand
 * le navigateur les accepte (voir public/.htaccess, section 2).
 *
 * Les fichiers d'origine sont conservés : un client sans gzip/br reçoit le
 * fichier normal.
 */
function precompressAssets(): Plugin {
  const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|txt|xml|webmanifest)$/i;
  const MIN_BYTES = 1024; // en dessous, la compression coûte plus qu'elle ne rapporte

  return {
    name: "precompress-assets",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      if (!fs.existsSync(outDir)) return;

      let files = 0;
      let rawTotal = 0;
      let gzTotal = 0;

      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!COMPRESSIBLE.test(entry.name)) continue;
          if (/\.(gz|br)$/i.test(entry.name)) continue;

          const buf = fs.readFileSync(full);
          if (buf.length < MIN_BYTES) continue;

          const gz = gzipSync(buf, { level: 9 });
          const br = brotliCompressSync(buf, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
              [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buf.length,
            },
          });

          fs.writeFileSync(`${full}.gz`, gz);
          fs.writeFileSync(`${full}.br`, br);

          files += 1;
          rawTotal += buf.length;
          gzTotal += gz.length;
        }
      };

      walk(outDir);

      const kb = (n: number) => `${(n / 1024).toFixed(1)} Ko`;
      const ratio = rawTotal > 0 ? Math.round((1 - gzTotal / rawTotal) * 100) : 0;
      // eslint-disable-next-line no-console
      console.log(
        `\n[precompress] ${files} fichiers — ${kb(rawTotal)} → ${kb(gzTotal)} en gzip (-${ratio}%)`,
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && precompressAssets(),
  ].filter(Boolean),
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
