export interface SheetTable {
  sheetName: string;
  columns: string[];
  rows: string[][];
  error?: string;
}

/**
 * Extract the Google Spreadsheet ID from various Google Sheet URL formats.
 */
export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();
  // Standard format: /spreadsheets/d/{ID}/...
  const match = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];

  // If the user just entered the ID directly
  if (/^[a-zA-Z0-9-_]{20,}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  return null;
}

/**
 * Fetch a single sheet tab using Google Visualization (GViz) API via JSONP.
 * JSONP dynamically injects a <script> tag which completely bypasses browser CORS restrictions.
 */
export function fetchSheetTabViaJsonp(sheetId: string, sheetName: string): Promise<SheetTable> {
  return new Promise((resolve) => {
    const callbackName = `gviz_cb_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const script = document.createElement('script');
    let isSettled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        delete (window as unknown as Record<string, unknown>)[callbackName];
      } catch {
        // ignore
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timeoutId = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve({
        sheetName,
        columns: ['A', 'B', 'C', 'D'],
        rows: [],
        error: `Timed out loading sheet "${sheetName}". Please ensure sheet is set to "Anyone with the link can view".`,
      });
    }, 7000);

    (window as unknown as Record<string, (resp: unknown) => void>)[callbackName] = (resp: unknown) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      try {
        const data = resp as {
          status: string;
          errors?: Array<{ message: string; detailed_message?: string }>;
          table?: {
            cols: Array<{ label?: string; id?: string }>;
            rows: Array<{ c: Array<{ v?: unknown; f?: string } | null> }>;
          };
        };

        if (!data || data.status === 'error') {
          const errMsg = data?.errors?.[0]?.message || 'Google Sheets error';
          resolve({
            sheetName,
            columns: ['A', 'B', 'C', 'D'],
            rows: [],
            error: errMsg,
          });
          return;
        }

        const table = data.table;
        if (!table) {
          resolve({
            sheetName,
            columns: ['A', 'B', 'C'],
            rows: [],
            error: 'No table data returned from sheet',
          });
          return;
        }

        // Determine raw rows
        const rawRows: string[][] = (table.rows || []).map((row) => {
          if (!row || !row.c) return [];
          return row.c.map((cell) => {
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

        // Trim and pad all rows to effectiveCols
        const rows = rawRows.map((r) => {
          const trimmed = r.slice(0, effectiveCols);
          if (trimmed.length < effectiveCols) {
            return [...trimmed, ...Array(effectiveCols - trimmed.length).fill('')];
          }
          return trimmed;
        });

        // Determine column labels (A, B, C, D...)
        const columns = Array.from({ length: effectiveCols }, (_, idx) => String.fromCharCode(65 + idx));

        resolve({
          sheetName,
          columns: columns.length > 0 ? columns : ['A', 'B', 'C', 'D', 'E', 'F'],
          rows,
        });
      } catch (err) {
        resolve({
          sheetName,
          columns: ['A', 'B', 'C'],
          rows: [],
          error: (err as Error).message || 'Failed to parse sheet data',
        });
      }
    };

    script.onerror = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve({
        sheetName,
        columns: ['A', 'B', 'C'],
        rows: [],
        error: `Could not access sheet "${sheetName}". Ensure link sharing is enabled.`,
      });
    };

    // Google Visualization API JSONP endpoint with headers=0 and real-time cache-busting timestamp
    const timestamp = Date.now();
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&headers=0&sheet=${encodeURIComponent(
      sheetName
    )}&t=${timestamp}`;
    script.src = url;
    document.body.appendChild(script);
  });
}

/**
 * Hybrid fetcher: attempts server proxy first, falls back to JSONP
 */
export async function fetchSheetTab(sheetId: string, sheetName: string): Promise<SheetTable> {
  try {
    const res = await fetch(
      `/api/sheets?id=${sheetId}&sheet=${encodeURIComponent(sheetName)}&t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.rows && data.rows.length > 0) {
        return data;
      }
    }
  } catch {
    // server proxy failed or not available, fallback to jsonp
  }

  return fetchSheetTabViaJsonp(sheetId, sheetName);
}

/**
 * Fetch a sheet tab by numeric GID (0 is always the default first tab)
 */
export async function fetchSheetTabByGid(
  sheetId: string,
  gid: string | number = 0,
  sheetName = 'DEFAULT'
): Promise<SheetTable> {
  try {
    const res = await fetch(`/api/sheets?id=${sheetId}&gid=${gid}&t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.rows && data.rows.length > 0) {
        return { ...data, sheetName };
      }
    }
  } catch {
    // fallback
  }

  return new Promise((resolve) => {
    const callbackName = `gviz_cb_gid_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const script = document.createElement('script');
    let isSettled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        delete (window as unknown as Record<string, unknown>)[callbackName];
      } catch {
        // ignore
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timeoutId = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve({
        sheetName,
        columns: ['A', 'B', 'C', 'D'],
        rows: [],
        error: `Timed out loading gid=${gid}`,
      });
    }, 7000);

    (window as unknown as Record<string, (resp: unknown) => void>)[callbackName] = (resp: unknown) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      try {
        const data = resp as {
          status: string;
          errors?: Array<{ message: string }>;
          table?: {
            cols: Array<{ label?: string; id?: string }>;
            rows: Array<{ c: Array<{ v?: unknown; f?: string } | null> }>;
          };
        };

        if (!data || data.status === 'error' || !data.table) {
          resolve({ sheetName, columns: ['A', 'B', 'C'], rows: [], error: 'Sheet error' });
          return;
        }

        const rawRows: string[][] = (data.table.rows || []).map((row) => {
          if (!row || !row.c) return [];
          return row.c.map((cell) => {
            if (!cell) return '';
            if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
            if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
            return '';
          });
        });

        // Find last column with content
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

        const isTemplate = sheetName.toUpperCase().includes('TEMPLATE');
        const effectiveCols = isTemplate ? 6 : Math.max(maxContentCol, 3);

        const rows = rawRows.map((r) => {
          const trimmed = r.slice(0, effectiveCols);
          if (trimmed.length < effectiveCols) {
            return [...trimmed, ...Array(effectiveCols - trimmed.length).fill('')];
          }
          return trimmed;
        });

        const columns = Array.from({ length: effectiveCols }, (_, idx) => String.fromCharCode(65 + idx));
        resolve({ sheetName, columns, rows });
      } catch (err) {
        resolve({ sheetName, columns: ['A', 'B', 'C'], rows: [], error: (err as Error).message });
      }
    };

    script.onerror = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve({ sheetName, columns: ['A', 'B', 'C'], rows: [], error: 'Failed script load' });
    };

    const timestamp = Date.now();
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&headers=0&gid=${gid}&t=${timestamp}`;
    document.body.appendChild(script);
  });
}

/**
 * Fetch all 4 sheets (TEMPLATES, DATASET, CONFIGURATION, PARAMETER)
 * Tries exact names as well as TitleCase, Lowercase, and gid=0 fallback.
 */
export async function fetchAllRequiredSheets(
  sheetId: string
): Promise<{ [key: string]: SheetTable }> {
  const targetSheets = ['TEMPLATES', 'DATASET', 'CONFIGURATION', 'PARAMETER'];
  const results: { [key: string]: SheetTable } = {};

  await Promise.all(
    targetSheets.map(async (name) => {
      // 1. Try exact uppercase name
      let res = await fetchSheetTab(sheetId, name);

      // 2. If errored, try Capitalized name (e.g., Templates, Dataset, Configuration, Parameter)
      if (res.error || res.rows.length === 0) {
        const capitalized = name.charAt(0) + name.slice(1).toLowerCase();
        const resCap = await fetchSheetTab(sheetId, capitalized);
        if (!resCap.error && resCap.rows.length > 0) {
          res = { ...resCap, sheetName: name };
        }
      }

      // 3. If still empty, try lowercase (e.g., templates, dataset, configuration, parameter)
      if (res.error || res.rows.length === 0) {
        const lower = name.toLowerCase();
        const resLower = await fetchSheetTab(sheetId, lower);
        if (!resLower.error && resLower.rows.length > 0) {
          res = { ...resLower, sheetName: name };
        }
      }

      // 4. For TEMPLATES, if still empty, try default sheet gid=0
      if (name === 'TEMPLATES' && (res.error || res.rows.length === 0)) {
        const resGid0 = await fetchSheetTabByGid(sheetId, 0, name);
        if (!resGid0.error && resGid0.rows.length > 0) {
          res = resGid0;
        }
      }

      results[name] = res;
    })
  );

  return results;
}
