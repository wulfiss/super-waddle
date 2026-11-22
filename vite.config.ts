import tailwindcss from '@tailwindcss/vite';
import { isHostedDemo } from './scripts/is-hosted-demo.mjs';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig({
	define: { __PICUI_HOSTED_DEMO__: JSON.stringify(isHostedDemo(loadEnv('production', false, 'VERCEL_'))) },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
