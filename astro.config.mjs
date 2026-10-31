// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://yadorigi-9-go.github.io',
  base: '/japan-constitution-review/',

  vite: {
    plugins: [tailwindcss()],
  },
});