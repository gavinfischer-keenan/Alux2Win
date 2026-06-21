import { defineConfig, Plugin } from 'vite'
import packageJson from './package.json'
import fs from 'fs'
import path from 'path'

function levelSavePlugin(): Plugin {
  return {
    name: 'level-save-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/save-level' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const fileName = data.name.replace(/\s+/g, '_').toLowerCase() + '.json';
              const filePath = path.resolve(__dirname, 'src/levels', fileName);
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, file: fileName }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
            }
          });
          return;
        }
        next();
      });
    }
  }
}

export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version),
  },
  server: {
    port: 3000,
  },
  plugins: [levelSavePlugin()],
  build: {
    target: 'esnext',
    sourcemap: true,
  },
})
