import react from "@vitejs/plugin-react-swc";
import { defineConfig, mergeConfig } from "vite";
import { defineConfig as defineTestConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default mergeConfig(
	defineConfig({
	plugins: [
		react(),
		tailwindcss(),
	],
	server: {
		host: true,
		strictPort: true,
	},
}),
	defineTestConfig({
		test: {
			environment: "jsdom",
			setupFiles: ["./vitest.setup.ts"],
			css: true,
		},
	}),
);
