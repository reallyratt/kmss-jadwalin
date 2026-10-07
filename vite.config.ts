import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'google-sheets-live-proxy',
        configureServer(server) {
          server.middlewares.use('/api/sheets', async (req, res) => {
            try {
              const url = new URL(req.url || '', 'http://localhost');
              const sheetId = url.searchParams.get('id');
              const sheetName = url.searchParams.get('sheet') || '';
              const gid = url.searchParams.get('gid');

              if (!sheetId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing spreadsheet id' }));
                return;
              }

              // Build Google GViz endpoint
              let gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&headers=0&t=${Date.now()}`;
              if (gid !== null && gid !== undefined && gid !== '') {
                gvizUrl += `&gid=${encodeURIComponent(gid)}`;
              } else if (sheetName) {
                gvizUrl += `&sheet=${encodeURIComponent(sheetName)}`;
              }

              const response = await fetch(gvizUrl, {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Cache-Control': 'no-cache',
                },
              });

              if (!response.ok) {
                res.statusCode = response.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    error: `Google Sheets returned HTTP ${response.status}`,
                  })
                );
                return;
              }

              const text = await response.text();
              const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);

              if (!match) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid GViz response format from Google' }));
                return;
              }

              const json = JSON.parse(match[1]);
              if (json.status === 'error') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: json.errors?.[0]?.message || 'Sheet error' }));
                return;
              }

              const rawRows: string[][] = (json.table?.rows || []).map((row: any) => {
                if (!row || !row.c) return [];
                return row.c.map((cell: any) => {
                  if (!cell) return '';
                  if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
                  if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
                  return '';
                });
              });

              // Find the last column index that actually contains content across all rows
              let maxContentCol = 0;
              for (const row of rawRows) {
                for (let c = row.length - 1; c >= 0; c--) {
                  if (row[c] && row[c].trim() !== '') {
                    if (c + 1 > maxContentCol) {
                      maxContentCol = c + 1;
                    }
                    break;
                  }
                }
              }

              // Determine effective columns:
              // TEMPLATES is strictly 6 columns (A through F).
              // Other sheets use the last column that actually contains content.
              const isTemplate = sheetName.toUpperCase().includes('TEMPLATE');
              const effectiveCols = isTemplate ? 6 : Math.max(maxContentCol, 3);

              const rows = rawRows.map((r: any) => {
                const trimmed = r.slice(0, effectiveCols);
                if (trimmed.length < effectiveCols) {
                  return [...trimmed, ...Array(effectiveCols - trimmed.length).fill('')];
                }
                return trimmed;
              });

              const columns = Array.from({ length: effectiveCols }, (_, idx) =>
                String.fromCharCode(65 + idx)
              );

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              res.end(JSON.stringify({ sheetName, columns, rows }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Internal proxy error' }));
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
