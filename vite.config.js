import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { resolve } from 'path';

const base = process.env.BASE_PATH ? `/${process.env.BASE_PATH}/` : '/svelte_timeline_hantavirus/';

export default defineConfig({
    plugins: [svelte()],
    base,
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
        },
    },
});
