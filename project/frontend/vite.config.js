import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Suppress common WebSocket proxy errors that are expected during development
const ignoredErrorCodes = ['ECONNREFUSED', 'ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND'];

// Custom error handler for WebSocket proxy
const handleProxyError = (err) => {
  if (err && ignoredErrorCodes.includes(err.code)) {
    // Silently ignore expected connection errors
    return;
  }
  // Only log unexpected errors
  console.error('WebSocket proxy error:', err);
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Hazard Eye - Road Safety Detection',
        short_name: 'Hazard Eye',
        description: 'AI-powered road hazard detection system making roads safer for everyone',
        theme_color: '#3498db',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Live Detection',
            short_name: 'Live',
            description: 'Start live hazard detection',
            url: '/live',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Hazard Map',
            short_name: 'Map',
            description: 'View hazard map',
            url: '/pothole-map',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp3}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.tomtom\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tomtom-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.(jpg|jpeg|png|gif|webp|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
        timeout: 5000,
        configure: (proxy, _options) => {
          // Suppress common WebSocket connection errors
          proxy.on('error', (err, _req, _res) => {
            // Silently handle WebSocket connection errors
            // These are expected when the backend is not running or connection is aborted
            handleProxyError(err);
          });
          
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            // Handle WebSocket upgrade and socket errors
            socket.on('error', (err) => {
              // Silently handle socket errors that are common during connection issues
              handleProxyError(err);
            });
            
            // Prevent uncaught exceptions from socket write errors
            const originalWrite = socket.write.bind(socket);
            socket.write = function(...args) {
              try {
                return originalWrite(...args);
              } catch (err) {
                handleProxyError(err);
                return false;
              }
            };
            
            // Handle write errors on the socket
            socket.on('close', () => {
              // Silently handle socket close events
            });
          });
          
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Handle response errors
            proxyRes.on('error', (err) => {
              handleProxyError(err);
            });
          });
          
          proxy.on('close', () => {
            // Silently handle proxy close events
          });
        },
      },
    },
  },
})
