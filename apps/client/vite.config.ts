import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@xeno/shared": path.resolve(__dirname, "../..", "packages", "shared", "src"),
      "@xeno/shared/constants": path.resolve(__dirname, "../..", "packages", "shared", "src", "constants.ts"),
      "@xeno/shared/types": path.resolve(__dirname, "../..", "packages", "shared", "src", "types.ts"),
    },
  },
});
