import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins: PluginOption[] = [];
  const reactPlugins = react();

  if (Array.isArray(reactPlugins)) {
    plugins.push(...reactPlugins);
  } else {
    plugins.push(reactPlugins);
  }

  if (mode === "development") {
    try {
      const { componentTagger } = await import("lovable-tagger");
      plugins.push(componentTagger());
    } catch {
      // The dev-only tagger is optional in this workspace.
    }
  }

  const pwaPlugins = VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "public",
      filename: "sw.js",
      includeAssets: ["favicon.png", "favicon.ico", "og-image.png"],
      injectManifest: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB to accommodate large JS bundle
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      manifest: {
        lang: "th",
        name: "Bud Over Bills - จัดการข้อตกลงส่วนบุคคล",
        short_name: "BOB",
        description: "แพลตฟอร์มบันทึกและจัดการคำมั่นและข้อตกลงส่วนบุคคลระหว่างเพื่อน",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["finance", "lifestyle", "social"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ],
        screenshots: [
          {
            src: "/screenshot-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide"
          },
          {
            src: "/screenshot-narrow.png",
            sizes: "640x1136",
            type: "image/png",
            form_factor: "narrow"
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    });

  if (Array.isArray(pwaPlugins)) {
    plugins.push(...pwaPlugins);
  } else {
    plugins.push(pwaPlugins);
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        include: ["src/domains/**/*.ts", "src/utils/**/*.ts"],
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            query: ["@tanstack/react-query", "@supabase/supabase-js"],
            charts: ["recharts", "framer-motion"],
            pdf: ["jspdf", "html2canvas"],
          },
        },
      },
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
