import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { checker } from 'vite-plugin-checker'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'
  const contextPath = env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ''
  const monacoPath = path.resolve(__dirname, 'node_modules', 'monaco-editor')
  const proxySettings = {
    [`${contextPath}/imp`]: {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
    },
    [`${contextPath}/exp`]: {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
    },
    [`${contextPath}/exec`]: {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
    },
    [`${contextPath}/chk`]: {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
    },
    [`${contextPath}/settings`]: {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
    },
    [`${contextPath}/warnings`]: {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
    },
  }

  return {
    plugins: [
      react({
        babel: {
          plugins: [
            [
              'babel-plugin-styled-components',
              {
                displayName: true,
                minify: false,
                pure: true,
                ssr: false,
              },
            ],
          ],
        },
      }),
      !isProduction &&
        checker({
          typescript: true,
          overlay: false,
        }),
      viteStaticCopy({
        targets: [
          {
            src: path.join(monacoPath, 'min', 'vs', 'loader.js'),
            dest: 'assets/vs',
          },
          {
            src: path.join(monacoPath, 'min', 'vs', 'editor', 'editor.main.js'),
            dest: 'assets/vs/editor',
          },
          {
            src: path.join(monacoPath, 'min', 'vs', 'editor', 'editor.main.nls.js'),
            dest: 'assets/vs/editor',
          },
          {
            src: path.join(monacoPath, 'min', 'vs', 'editor', 'editor.main.css'),
            dest: 'assets/vs/editor',
          },
          {
            src: path.join(monacoPath, 'min', 'vs', 'base'),
            dest: 'assets/vs',
          },
          ...(isProduction ? [] : [
            {
              src: path.join(monacoPath, 'min-maps', 'vs'),
              dest: 'min-maps',
            },
          ]),
        ],
      }),
    ].filter(Boolean),

    resolve: {
      alias: {
        'react/jsx-runtime': path.resolve(
          __dirname,
          'node_modules/react/jsx-runtime.js'
        ),
      },
    },

    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          silenceDeprecations: ['import', 'global-builtin'],
        },
      },
    },

    define: {
      'import.meta.env.COMMIT_HASH': JSON.stringify(env.COMMIT_HASH || ''),
    },

    test: {
      environment: 'node',
      include: 'src/**/*.(test|spec).(ts|tsx|js|jsx)',
      globals: true,
    },

    server: {
      host: 'localhost',
      port: 9999,
      proxy: proxySettings,
    },

    preview: {
      host: 'localhost',
      port: 9999,
      proxy: proxySettings,
    },

    build: {
      outDir: 'dist',
      sourcemap: !isProduction,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: [
              'react',
              'react-dom',
              'redux',
              'react-redux',
              'redux-observable',
              'rxjs',
              'styled-components',
            ],
          },
        },
      },
      chunkSizeWarningLimit: 3000,
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'styled-components',
        'redux',
        'react-redux',
      ],
    },
  }
})


