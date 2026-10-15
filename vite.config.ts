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

              // Dynamically extract yellow cells (Live Mass) from the Google Spreadsheet XLSX
              let yellowCells: string[] = ['B6', 'C6', 'B13', 'C13', 'E13'];
              let liveSlots: string[] = ['SENIN_05:30', 'JUMAT_05:30', 'SABTU_17:00', 'MINGGU_06:00', 'MINGGU_16:30'];
              let liveColumns = { harian: [1, 2], mingguan: [1, 2, 4] };

              if (sheetId) {
                try {
                  const { execSync } = await import('child_process');
                  const fs = await import('fs');
                  const tmpFile = `/tmp/sheet_${sheetId}.xlsx`;
                  const outDir = `/tmp/unzip_${sheetId}`;

                  execSync(`curl -s -L "https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx" -o "${tmpFile}"`, { timeout: 4000 });
                  execSync(`rm -rf "${outDir}" && mkdir -p "${outDir}" && unzip -q -o "${tmpFile}" -d "${outDir}"`, { timeout: 3000 });

                  if (fs.existsSync(`${outDir}/xl/styles.xml`) && fs.existsSync(`${outDir}/xl/worksheets/sheet1.xml`)) {
                    const styles = fs.readFileSync(`${outDir}/xl/styles.xml`, 'utf8');
                    const fills = styles.match(/<fill>[\s\S]*?<\/fill>/g) || [];
                    const xfs = (styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0].match(/<xf [^>]+>/g) || [];
                    const yellowFillIds = new Set<number>();

                    fills.forEach((f: string, idx: number) => {
                      if (/rgb=\"FF(FF00|FE00|F9C3|EF08|FFF0|FFD|FFE|FFFF00)/i.test(f) || /rgb=\"(FFFF00|FEF08A|FEF9C3)/i.test(f)) {
                        yellowFillIds.add(idx);
                      }
                    });

                    const sheet1 = fs.readFileSync(`${outDir}/xl/worksheets/sheet1.xml`, 'utf8');
                    const cells = sheet1.match(/<c [^>]+>(?:<v>[\s\S]*?<\/v>)?<\/c>/g) || [];
                    const dynamicYellow: string[] = [];

                    cells.forEach((c: string) => {
                      const ref = (c.match(/r=\"([A-Z0-9]+)\"/) || [])[1];
                      const s = parseInt((c.match(/s=\"(\d+)\"/) || [])[1] || '0', 10);
                      const xf = xfs[s] || '';
                      const fillId = parseInt((xf.match(/fillId=\"(\d+)\"/) || [])[1] || '0', 10);
                      if (yellowFillIds.has(fillId) && ref) {
                        dynamicYellow.push(ref);
                      }
                    });

                    if (dynamicYellow.length > 0) {
                      yellowCells = dynamicYellow;
                      const dynamicHarianCols = new Set<number>();
                      const dynamicMingguanCols = new Set<number>();
                      const dynamicSlots: string[] = [];

                      dynamicYellow.forEach((cellRef) => {
                        const m = cellRef.match(/^([A-Z]+)(\d+)$/);
                        if (!m) return;
                        const colIdx = m[1].charCodeAt(0) - 65; // 'B' -> 1, 'C' -> 2
                        const rowNum = parseInt(m[2], 10);
                        if (rowNum <= 8) {
                          dynamicHarianCols.add(colIdx);
                          if (colIdx === 1) dynamicSlots.push('SENIN_05:30');
                          if (colIdx === 2) dynamicSlots.push('JUMAT_05:30');
                        } else {
                          dynamicMingguanCols.add(colIdx);
                          if (colIdx === 1) dynamicSlots.push('SABTU_17:00');
                          if (colIdx === 2) dynamicSlots.push('MINGGU_06:00');
                          if (colIdx === 3) dynamicSlots.push('MINGGU_08:00');
                          if (colIdx === 4) dynamicSlots.push('MINGGU_16:30');
                          if (colIdx === 5) dynamicSlots.push('MINGGU_18:30');
                        }
                      });

                      liveColumns = {
                        harian: Array.from(dynamicHarianCols),
                        mingguan: Array.from(dynamicMingguanCols),
                      };
                      if (dynamicSlots.length > 0) {
                        liveSlots = Array.from(new Set(dynamicSlots));
                      }
                    }
                  }
                } catch {
                  // Fallback safely to defaults
                }
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              res.end(JSON.stringify({ sheetName, columns, rows, yellowCells, liveSlots, liveColumns }));
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
