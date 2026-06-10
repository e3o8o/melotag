import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/itunes': {
        target: 'https://itunes.apple.com',
        changeOrigin: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        rewrite: (path) => path.replace(/^\/api\/itunes/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] iTunes Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] iTunes Req:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Vite Proxy] iTunes Res:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/api/deezer': {
        target: 'https://api.deezer.com',
        changeOrigin: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        rewrite: (path) => path.replace(/^\/api\/deezer/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] Deezer Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Deezer Req:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Vite Proxy] Deezer Res:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/api/lrclib': {
        target: 'https://lrclib.net',
        changeOrigin: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        rewrite: (path) => path.replace(/^\/api\/lrclib/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] LRCLIB Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] LRCLIB Req:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Vite Proxy] LRCLIB Res:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/api/musicbrainz': {
        target: 'https://musicbrainz.org',
        changeOrigin: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'MeloTag/1.0 (https://melotag.app)'
        },
        rewrite: (path) => path.replace(/^\/api\/musicbrainz/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] MusicBrainz Error:', err.message);
          });
        }
      },
      '/api/coverart': {
        target: 'https://coverartarchive.org',
        changeOrigin: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'MeloTag/1.0 (https://melotag.app)'
        },
        rewrite: (path) => path.replace(/^\/api\/coverart\/release/, '/release'),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] CoverArt Error:', err.message);
          });
        }
      }
    }
  }
});
