import { defineConfig } from 'vite';

// Relative asset paths: the same build runs at a domain root and under the
// GitHub Pages project prefix.
export default defineConfig({
  base: './',
});
