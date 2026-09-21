// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {
      NODE_ENV: process.env.NODE_ENV,
    }
  }
});