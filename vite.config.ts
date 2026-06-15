import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  // 프로덕션 빌드에서 console.log/info/debug 제거(노이즈·민감정보 누출 방지). error/warn 은 유지.
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  build: {
    rollupOptions: {
      output: {
        // eager 코어인 react 생태계만 별도 청크로 분리(캐싱 개선, 메인 index 축소).
        // video.js·recharts 등은 이미 lazy 청크라 손대지 않음(eager화 방지).
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-i18next|i18next)[\\/]/.test(id)) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    host: true,
  },
})
