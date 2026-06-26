// vite.config.ts
import { defineConfig } from "file:///sessions/great-tender-bohr/mnt/peripateticware_complete_202605081840/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/great-tender-bohr/mnt/peripateticware_complete_202605081840/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "/sessions/great-tender-bohr/mnt/peripateticware_complete_202605081840/frontend";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    // FIX 1: Force a single React instance across all packages.
    // react-i18next v14 (and some other packages) that import 'react' internally
    // can resolve to a different copy when node_modules exist at multiple levels,
    // causing "useContext dispatcher is null / Invalid hook call" crashes on React 19.
    dedupe: ["react", "react-dom", "react-i18next", "i18next"],
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@hooks": path.resolve(__vite_injected_original_dirname, "./src/hooks"),
      "@components": path.resolve(__vite_injected_original_dirname, "./src/components"),
      "@pages": path.resolve(__vite_injected_original_dirname, "./src/pages"),
      "@stores": path.resolve(__vite_injected_original_dirname, "./src/stores"),
      "@types": path.resolve(__vite_injected_original_dirname, "./src/types"),
      "@utils": path.resolve(__vite_injected_original_dirname, "./src/utils"),
      "@services": path.resolve(__vite_injected_original_dirname, "./src/services"),
      "@config": path.resolve(__vite_injected_original_dirname, "./src/config"),
      "@styles": path.resolve(__vite_injected_original_dirname, "./src/styles")
    }
  },
  json: {
    stringify: true
  },
  server: {
    host: "0.0.0.0",
    port: 3e3,
    hmr: {
      host: "localhost",
      port: 3e3
    },
    proxy: {
      "/auth": {
        target: process.env.VITE_API_URL || "http://backend:8000",
        changeOrigin: true,
        rewrite: (path2) => `/api/v1${path2}`
      },
      "/api": {
        target: process.env.VITE_API_URL || "http://backend:8000",
        changeOrigin: true,
        rewrite: (path2) => path2
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    copyPublicDir: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZ3JlYXQtdGVuZGVyLWJvaHIvbW50L3BlcmlwYXRldGljd2FyZV9jb21wbGV0ZV8yMDI2MDUwODE4NDAvZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9zZXNzaW9ucy9ncmVhdC10ZW5kZXItYm9oci9tbnQvcGVyaXBhdGV0aWN3YXJlX2NvbXBsZXRlXzIwMjYwNTA4MTg0MC9mcm9udGVuZC92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vc2Vzc2lvbnMvZ3JlYXQtdGVuZGVyLWJvaHIvbW50L3BlcmlwYXRldGljd2FyZV9jb21wbGV0ZV8yMDI2MDUwODE4NDAvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCdcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgLy8gRklYIDE6IEZvcmNlIGEgc2luZ2xlIFJlYWN0IGluc3RhbmNlIGFjcm9zcyBhbGwgcGFja2FnZXMuXG4gICAgLy8gcmVhY3QtaTE4bmV4dCB2MTQgKGFuZCBzb21lIG90aGVyIHBhY2thZ2VzKSB0aGF0IGltcG9ydCAncmVhY3QnIGludGVybmFsbHlcbiAgICAvLyBjYW4gcmVzb2x2ZSB0byBhIGRpZmZlcmVudCBjb3B5IHdoZW4gbm9kZV9tb2R1bGVzIGV4aXN0IGF0IG11bHRpcGxlIGxldmVscyxcbiAgICAvLyBjYXVzaW5nIFwidXNlQ29udGV4dCBkaXNwYXRjaGVyIGlzIG51bGwgLyBJbnZhbGlkIGhvb2sgY2FsbFwiIGNyYXNoZXMgb24gUmVhY3QgMTkuXG4gICAgZGVkdXBlOiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdyZWFjdC1pMThuZXh0JywgJ2kxOG5leHQnXSxcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSxcbiAgICAgICdAaG9va3MnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvaG9va3MnKSxcbiAgICAgICdAY29tcG9uZW50cyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9jb21wb25lbnRzJyksXG4gICAgICAnQHBhZ2VzJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjL3BhZ2VzJyksXG4gICAgICAnQHN0b3Jlcyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9zdG9yZXMnKSxcbiAgICAgICdAdHlwZXMnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvdHlwZXMnKSxcbiAgICAgICdAdXRpbHMnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvdXRpbHMnKSxcbiAgICAgICdAc2VydmljZXMnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvc2VydmljZXMnKSxcbiAgICAgICdAY29uZmlnJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjL2NvbmZpZycpLFxuICAgICAgJ0BzdHlsZXMnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvc3R5bGVzJyksXG4gICAgfSxcbiAgfSxcbiAganNvbjoge1xuICAgIHN0cmluZ2lmeTogdHJ1ZSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogJzAuMC4wLjAnLFxuICAgIHBvcnQ6IDMwMDAsXG4gICAgaG1yOiB7XG4gICAgICBob3N0OiAnbG9jYWxob3N0JyxcbiAgICAgIHBvcnQ6IDMwMDAsXG4gICAgfSxcbiAgICBwcm94eToge1xuICAgICAgJy9hdXRoJzoge1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlZJVEVfQVBJX1VSTCB8fCAnaHR0cDovL2JhY2tlbmQ6ODAwMCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IGAvYXBpL3YxJHtwYXRofWAsXG4gICAgICB9LFxuICAgICAgJy9hcGknOiB7XG4gICAgICAgIHRhcmdldDogcHJvY2Vzcy5lbnYuVklURV9BUElfVVJMIHx8ICdodHRwOi8vYmFja2VuZDo4MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICByZXdyaXRlOiAocGF0aCkgPT4gcGF0aCxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0JyxcbiAgICBzb3VyY2VtYXA6IGZhbHNlLFxuICAgIGNvcHlQdWJsaWNEaXI6IHRydWUsXG4gIH0sXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE0WixTQUFTLG9CQUFvQjtBQUN6YixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBRmpCLElBQU0sbUNBQW1DO0FBSXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUtQLFFBQVEsQ0FBQyxTQUFTLGFBQWEsaUJBQWlCLFNBQVM7QUFBQSxJQUN6RCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDcEMsVUFBVSxLQUFLLFFBQVEsa0NBQVcsYUFBYTtBQUFBLE1BQy9DLGVBQWUsS0FBSyxRQUFRLGtDQUFXLGtCQUFrQjtBQUFBLE1BQ3pELFVBQVUsS0FBSyxRQUFRLGtDQUFXLGFBQWE7QUFBQSxNQUMvQyxXQUFXLEtBQUssUUFBUSxrQ0FBVyxjQUFjO0FBQUEsTUFDakQsVUFBVSxLQUFLLFFBQVEsa0NBQVcsYUFBYTtBQUFBLE1BQy9DLFVBQVUsS0FBSyxRQUFRLGtDQUFXLGFBQWE7QUFBQSxNQUMvQyxhQUFhLEtBQUssUUFBUSxrQ0FBVyxnQkFBZ0I7QUFBQSxNQUNyRCxXQUFXLEtBQUssUUFBUSxrQ0FBVyxjQUFjO0FBQUEsTUFDakQsV0FBVyxLQUFLLFFBQVEsa0NBQVcsY0FBYztBQUFBLElBQ25EO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osV0FBVztBQUFBLEVBQ2I7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLEtBQUs7QUFBQSxNQUNILE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxJQUNSO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxTQUFTO0FBQUEsUUFDUCxRQUFRLFFBQVEsSUFBSSxnQkFBZ0I7QUFBQSxRQUNwQyxjQUFjO0FBQUEsUUFDZCxTQUFTLENBQUNBLFVBQVMsVUFBVUEsS0FBSTtBQUFBLE1BQ25DO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDTixRQUFRLFFBQVEsSUFBSSxnQkFBZ0I7QUFBQSxRQUNwQyxjQUFjO0FBQUEsUUFDZCxTQUFTLENBQUNBLFVBQVNBO0FBQUEsTUFDckI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLElBQ1gsZUFBZTtBQUFBLEVBQ2pCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsicGF0aCJdCn0K
