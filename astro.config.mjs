// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    // Minify HTML output
    compressHTML: true,

    build: {
        // Inline stylesheets smaller than 4KB directly into HTML — fewer requests
        inlineStylesheets: 'auto',
    },

    vite: {
        plugins: [tailwindcss()],
        build: {
            // Raise the chunk warning threshold a bit (fonts push it over default)
            chunkSizeWarningLimit: 600,
        },
    },
});
