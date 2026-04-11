import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { checker } from 'vite-plugin-checker'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import license from 'rollup-plugin-license'
import path from 'path'
import { readFileSync, existsSync, appendFileSync, readdirSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'
  const contextPath = env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ''
  const monacoPath = path.resolve(__dirname, 'node_modules', 'monaco-editor')
  const proxySettings = {
    '/imp': {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
    '/exp': {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
    '/exec': {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
    '/chk': {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
    '/settings': {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
    '/warnings': {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
    '/preferences': {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
    "/userinfo": {
      bypass: function (_, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          sub: "john doe",
          groups: ["group1", "group2"]
        }))
      }
    },
    "/api": {
      target: 'http://127.0.0.1:9000',
      changeOrigin: true,
      rewrite: (path: string) => `${contextPath}${path}`,
    },
  }

  return {
    base: './',
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
      checker({
        typescript: true,
        overlay: false,
      }),
      wasm(),
      topLevelAwait(),
      viteStaticCopy({
        // All statically copied packages should be listed in manualPackages in append-licenses plugin below
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
      isProduction && {
        name: 'append-licenses',
        closeBundle() {
          const output = path.resolve(__dirname, 'dist', 'THIRD_PARTY_LICENSES.txt')

          const manualPackages = [
            'monaco-editor',
          ]
          for (const pkg of manualPackages) {
            const pkgJsonPath = path.resolve(__dirname, 'node_modules', pkg, 'package.json')
            if (!existsSync(pkgJsonPath)) continue
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
            const pkgDir = path.resolve(__dirname, 'node_modules', pkg)
            const licFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE'].map((f) => path.resolve(pkgDir, f)).find(existsSync)
            const licText = licFile ? readFileSync(licFile, 'utf-8') : `(${pkgJson.license} — no LICENSE file found in package)`
            appendFileSync(output, `\n---\n\nName: ${pkgJson.name}\nVersion: ${pkgJson.version}\nLicense: ${pkgJson.license}\nPrivate: false\nDescription: ${pkgJson.description || ''}\nRepository: ${typeof pkgJson.repository === 'string' ? pkgJson.repository : pkgJson.repository?.url || 'undefined'}\nLicense Text:\n===\n\n${licText}\n`)
          }

          // Font licenses from subdirectories of src/styles/fonts/
          const fontsRoot = path.resolve(__dirname, 'src/styles/fonts')
          if (!existsSync(fontsRoot)) return
          const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot'])
          const isFontFile = (name: string) => FONT_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))
          const errors: string[] = []

          for (const entry of readdirSync(fontsRoot, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
              if (isFontFile(entry.name)) {
                errors.push(`Font file "${entry.name}" found directly in src/styles/fonts/ — move it into a subdirectory with a LICENSE file`)
              }
              continue
            }
            const dirPath = path.resolve(fontsRoot, entry.name)
            const fonts = readdirSync(dirPath).filter(isFontFile)
            if (fonts.length === 0) continue
            const licFile = path.resolve(dirPath, 'LICENSE')
            if (!existsSync(licFile)) {
              errors.push(`Missing LICENSE in src/styles/fonts/${entry.name}/ for: ${fonts.join(', ')}`)
            } else {
              const text = readFileSync(licFile, 'utf-8')
              appendFileSync(output, `\n---\n\nName: ${entry.name} (font)\nSource: src/styles/fonts/${entry.name}\nLicense Text:\n===\n\n${text}\n`)
            }
          }

          if (errors.length > 0) {
            throw new Error(`Font license violations:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
          }
        },
      },
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
      'import.meta.env.CONSOLE_VERSION': JSON.stringify(pkg.version),
    },

    test: {
      environment: 'node',
      include: 'src/**/*.(test|spec).(ts|tsx|js|jsx)',
      globals: true,
    },

    server: {
      host: '127.0.0.1',
      port: 9999,
      proxy: proxySettings,
    },

    preview: {
      host: '127.0.0.1',
      port: 9999,
      proxy: proxySettings,
    },

    build: {
      outDir: 'dist',
      sourcemap: !isProduction,
      ssr: false,
      minify: 'esbuild',
      rollupOptions: {
        plugins: [
          (() => {
            const ALLOWED_LICENSES = new Set([
              'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
              '0BSD', 'Unlicense', 'CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0',
              'Python-2.0', 'BlueOak-1.0.0', 'Zlib',
            ])
            // Packages with non-standard SPDX identifiers in their package.json
            const LICENSE_OVERRIDES: Record<string, string> = {
              'posthog-js': 'Apache-2.0', // uses "SEE LICENSE IN LICENSE" instead of valid SPDX
            }
            return license({
              thirdParty: {
                output: path.resolve(__dirname, 'dist', 'THIRD_PARTY_LICENSES.txt'),
                includePrivate: false,
                allow: {
                  test: (dependency) => {
                    const lic = LICENSE_OVERRIDES[dependency.name ?? ''] ?? dependency.license ?? ''
                    return ALLOWED_LICENSES.has(lic)
                  },
                  failOnUnlicensed: true,
                  failOnViolation: true,
                },
              },
            })
          })(),
        ],
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
              'echarts',
            ],
            'tiktoken': ['js-tiktoken/lite', 'js-tiktoken/ranks/o200k_base'],
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


