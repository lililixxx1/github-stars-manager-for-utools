import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (
                        id.includes('node_modules/react/')
                        || id.includes('node_modules/react-dom/')
                        || id.includes('node_modules/zustand/')
                    ) {
                        return 'vendor-react';
                    }
                    if (id.includes('node_modules/@dnd-kit/')) {
                        return 'vendor-dnd';
                    }
                    if (id.includes('node_modules/marked') || id.includes('node_modules/dompurify')) {
                        return 'vendor-markdown';
                    }
                },
            },
        },
    },
})
