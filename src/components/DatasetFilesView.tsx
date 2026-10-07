import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, 
  ArrowDown, 
  ChevronDown, 
  ChevronRight, 
  RefreshCw, 
  FileSpreadsheet, 
  ClipboardPaste,
  Check,
  ExternalLink,
  Radio
} from 'lucide-react';
import { 
  extractSpreadsheetId, 
  fetchAllRequiredSheets, 
  SheetTable 
} from '../utils/googleSheets';

interface DatasetFilesViewProps {
  onBack: () => void;
}

// Initial sheets: Templates retains the user-defined layout, other tabs wait for live spreadsheet data
const initialSheets: { [key: string]: SheetTable } = {
  TEMPLATES: {
    sheetName: 'TEMPLATES',
    columns: ['A', 'B', 'C', 'D', 'E', 'F'],
    rows: [
      ['JADWAL PETUGAS PERIODE {TGLPERD}', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', 'HARIAN', '', '', '', ''],
      ['TANGGAL', '{MON}', '{FRI}', '', '', ''],
      ['HARI', 'SENIN', 'JUMAT', '', '', ''],
      ['PUKUL', '05:30', '05:30', '', '', ''],
      ['PJ', '{PJA}', '{PJB}', '', '', ''],
      ['ANGGOTA', '{ANGA}', '{ANGB}', '', '', ''],
      ['', '', '', '', '', ''],
      ['', 'MINGGUAN', '', '', '', ''],
      ['TANGGAL', '{SAT}', '{SUN}', '', '', ''],
      ['HARI', 'SABTU', 'MINGGU', '', '', ''],
      ['PUKUL', '17:00', '06:00', '08:00', '16:30', '18:30'],
      ['PJ', '{PJC}', '{PJD}', '{PJE}', '{PJF}', '{PJG}'],
      ['ANGGOTA', '{ANGC}', '{ANGD}', '{ANGE}', '{ANGF}', '{ANGG}'],
    ],
  },
  DATASET: {
    sheetName: 'DATASET',
    columns: ['A', 'B', 'C', 'D', 'E'],
    rows: [],
  },
  CONFIGURATION: {
    sheetName: 'CONFIGURATION',
    columns: ['A', 'B', 'C'],
    rows: [],
  },
  PARAMETER: {
    sheetName: 'PARAMETER',
    columns: ['A', 'B', 'C', 'D', 'E'],
    rows: [],
  },
};

/**
 * Specialized renderer for TEMPLATES sheet:
 * Handles exact merged banners (Title, Harian, Mingguan, Minggu 4 slots)
 * while keeping all slot columns perfectly aligned.
 */
function renderTemplateRowCells(row: string[], totalCols: number) {
  const clean = row.map((c) => (c !== undefined && c !== null ? String(c).trim() : ''));
  const firstVal = clean.find((v) => v !== '') || '';
  const nonEmptyCount = clean.filter((v) => v !== '').length;

  // 1. Title row: "JADWAL PETUGAS PERIODE..."
  if (firstVal.toUpperCase().startsWith('JADWAL')) {
    return (
      <td
        colSpan={totalCols}
        className="p-3 text-center font-black text-sm sm:text-base bg-[#EAE8E0] text-[#1E1E1E] tracking-wider border-r-2 border-b border-[#1E1E1E]"
      >
        {firstVal}
      </td>
    );
  }

  // 2. Entirely empty row
  if (nonEmptyCount === 0) {
    return (
      <td
        colSpan={totalCols}
        className="p-2 border-r-2 border-b border-[#E0DCD0] text-center text-neutral-300"
      >
        ·
      </td>
    );
  }

  // 3. Section HARIAN header
  if (clean.includes('HARIAN')) {
    // Column A is empty label, Columns B-C is HARIAN (spans 2), D..end are empty
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#EFECE3] text-center text-neutral-300">
          ·
        </td>
        <td
          colSpan={2}
          className="p-2 text-center font-black text-xs sm:text-sm bg-[#E3EBDD] text-[#1E1E1E] tracking-widest border-r-2 border-b border-[#1E1E1E]"
        >
          HARIAN
        </td>
        {totalCols > 3 && (
          <td
            colSpan={totalCols - 3}
            className="p-2 border-r-2 border-b border-[#E0DCD0] text-center text-neutral-300"
          >
            ·
          </td>
        )}
      </>
    );
  }

  // 4. Section MINGGUAN header
  if (clean.includes('MINGGUAN')) {
    // Column A is empty label, Columns B..end is MINGGUAN
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#EFECE3] text-center text-neutral-300">
          ·
        </td>
        <td
          colSpan={Math.max(totalCols - 1, 1)}
          className="p-2 text-center font-black text-xs sm:text-sm bg-[#DCE6F2] text-[#1E1E1E] tracking-widest border-r-2 border-b border-[#1E1E1E]"
        >
          MINGGUAN
        </td>
      </>
    );
  }

  // 5. TANGGAL row in Mingguan (contains {SAT} and {SUN})
  if (clean[0]?.toUpperCase() === 'TANGGAL' && clean.some((v) => v === '{SUN}')) {
    const sunSpan = Math.max(totalCols - 2, 1);
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#F5F3EC] font-black text-center text-[#1E1E1E]">
          TANGGAL
        </td>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold bg-[#E3EBDD]/40 text-emerald-950">
          {clean[1] || '{SAT}'}
        </td>
        <td
          colSpan={sunSpan}
          className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold bg-[#E3EBDD]/40 text-emerald-950"
        >
          {clean[2] || '{SUN}'}
        </td>
      </>
    );
  }

  // 6. HARI row in Mingguan (contains SABTU and MINGGU)
  if (clean[0]?.toUpperCase() === 'HARI' && clean.some((v) => v.toUpperCase() === 'MINGGU')) {
    const mingguSpan = Math.max(totalCols - 2, 1);
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#F5F3EC] font-black text-center text-[#1E1E1E]">
          HARI
        </td>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold text-[#1E1E1E]">
          SABTU
        </td>
        <td
          colSpan={mingguSpan}
          className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold text-[#1E1E1E]"
        >
          MINGGU
        </td>
      </>
    );
  }

  // 7. General template rows (PUKUL, PJ, ANGGOTA, Harian rows)
  return (
    <>
      {Array.from({ length: totalCols }).map((_, cIdx) => {
        const val = clean[cIdx] || '';
        const isLabelCol = cIdx === 0;
        const isPlaceholder = val.startsWith('{') && val.endsWith('}');

        return (
          <td
            key={`cell-${cIdx}`}
            className={`p-2 border-r-2 border-b border-[#E0DCD0] text-center ${
              isLabelCol
                ? 'font-black bg-[#F5F3EC] text-[#1E1E1E]'
                : isPlaceholder
                ? 'bg-[#E3EBDD]/40 font-bold text-emerald-950'
                : val
                ? 'font-bold text-[#1E1E1E]'
                : 'text-neutral-300'
            }`}
          >
            {val || '·'}
          </td>
        );
      })}
    </>
  );
}

/**
 * Strict 1:1 Column renderer for tabular sheets (DATASET, CONFIGURATION, PARAMETER):
 * Ensures every cell is rendered exactly in its true column position,
 * preventing any column shifting, misalignment, or unwanted merges.
 */
function renderTabularRowCells(row: string[], columns: string[], rIdx: number) {
  const isHeaderRow = rIdx === 0;

  return (
    <>
      {columns.map((_, cIdx) => {
        const rawVal = row[cIdx];
        const val = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
        const isNumber = /^\d+$/.test(val);
        const isStatus = ['AKTIF', 'NONAKTIF', 'TRUE', 'FALSE'].includes(val.toUpperCase());
        const isTime = /^(\d{2}:\d{2})$/.test(val);
        const isCentered = isHeaderRow || isNumber || isStatus || isTime || cIdx === 0;

        return (
          <td
            key={`cell-${cIdx}`}
            className={`p-2 border-r-2 border-b border-[#E0DCD0] ${
              isCentered ? 'text-center' : 'text-left'
            } ${
              isHeaderRow
                ? 'font-black bg-[#F5F3EC] text-[#1E1E1E] uppercase tracking-wider'
                : isStatus
                ? 'font-bold text-emerald-800'
                : 'text-[#1E1E1E]'
            }`}
          >
            {val ? (
              <span>{val}</span>
            ) : (
              <span className="text-neutral-300 select-none">·</span>
            )}
          </td>
        );
      })}
    </>
  );
}

export default function DatasetFilesView({ onBack }: DatasetFilesViewProps) {
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [sheetsData, setSheetsData] = useState<{ [key: string]: SheetTable }>(initialSheets);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>(
    'PASTE GOOGLE SPREADSHEET LINK TO SYNC REAL DATA'
  );
  const [statusType, setStatusType] = useState<'idle' | 'loading' | 'success' | 'warning'>('idle');
  
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    TEMPLATES: true,
    DATASET: false,
    CONFIGURATION: false,
    PARAMETER: false,
  });

  const [pasteModalSheet, setPasteModalSheet] = useState<string | null>(null);
  const [pastedRawText, setPastedRawText] = useState<string>('');

  const isMountedRef = useRef<boolean>(true);
  const syncTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  // Format current timestamp (HH:MM:SS)
  const getTimestamp = () => {
    return new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  /**
   * Real-time Fetcher: queries Google Sheets GViz with cache-busting timestamp & headers=0
   */
  const fetchSpreadsheetLive = useCallback(
    async (targetUrl: string, isSilent = false) => {
      const trimmed = targetUrl.trim();
      if (!trimmed) {
        if (!isSilent) {
          setStatusType('warning');
          setStatusMessage('PLEASE PASTE A GOOGLE SPREADSHEET LINK IN THE TEXTBOX');
        }
        return;
      }

      const sheetId = extractSpreadsheetId(trimmed);
      if (!sheetId) {
        if (!isSilent) {
          setStatusType('warning');
          setStatusMessage('INVALID LINK: COULD NOT FIND SPREADSHEET ID');
        }
        return;
      }

      if (isSilent) {
        setIsSyncing(true);
      } else {
        setIsLoading(true);
        setStatusType('loading');
        setStatusMessage(`CONNECTING TO LIVE SPREADSHEET (ID: ${sheetId.slice(0, 8)}...)...`);
      }

      try {
        const liveData = await fetchAllRequiredSheets(sheetId);
        
        if (!isMountedRef.current) return;

        // Apply updated live data to sheets
        setSheetsData((prev) => {
          const updated = { ...prev };
          for (const key of ['TEMPLATES', 'DATASET', 'CONFIGURATION', 'PARAMETER']) {
            if (liveData[key] && liveData[key].rows && liveData[key].rows.length > 0) {
              updated[key] = liveData[key];
            }
          }
          return updated;
        });

        const loadedCount = Object.values(liveData).filter(
          (s) => s && s.rows && s.rows.length > 0 && !s.error
        ).length;

        const timeStr = getTimestamp();
        setLastSyncTime(timeStr);
        setStatusType('success');

        if (loadedCount > 0) {
          setStatusMessage(`LIVE REAL-TIME: ${loadedCount} OF 4 SHEETS SYNCED • ${timeStr}`);
        } else {
          setStatusMessage(`REAL-TIME SYNCED • ${timeStr}`);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        if (!isSilent) {
          setStatusType('warning');
          setStatusMessage(`NOTICE: ${(err as Error).message}`);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsSyncing(false);
        }
      }
    },
    []
  );

  // 1. Initial live fetch on mount (only if sheetUrl is provided)
  useEffect(() => {
    if (sheetUrl.trim()) {
      fetchSpreadsheetLive(sheetUrl, false);
    }
  }, [fetchSpreadsheetLive, sheetUrl]);

  // 2. Real-time background polling every 5 seconds
  useEffect(() => {
    if (!autoSyncEnabled || !sheetUrl.trim()) return;

    const intervalId = window.setInterval(() => {
      fetchSpreadsheetLive(sheetUrl, true);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [autoSyncEnabled, sheetUrl, fetchSpreadsheetLive]);

  // 3. Debounced trigger when user updates the URL textbox
  const handleUrlChange = (newUrl: string) => {
    setSheetUrl(newUrl);
    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = window.setTimeout(() => {
      fetchSpreadsheetLive(newUrl, false);
    }, 600);
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleApplyPastedData = () => {
    if (!pasteModalSheet || !pastedRawText.trim()) return;

    const rawRows = pastedRawText
      .trim()
      .split('\n')
      .map((line) => {
        if (line.includes('\t')) return line.split('\t');
        if (line.includes(',')) return line.split(',');
        return [line];
      });

    if (rawRows.length > 0) {
      const maxCols = Math.max(...rawRows.map((r) => r.length), 3);
      const cols = Array.from({ length: maxCols }, (_, i) => String.fromCharCode(65 + i));
      
      setSheetsData((prev) => ({
        ...prev,
        [pasteModalSheet]: {
          sheetName: pasteModalSheet,
          columns: cols,
          rows: rawRows,
        },
      }));
      setStatusType('success');
      setStatusMessage(`APPLIED PASTED DATA TO [${pasteModalSheet}] • ${getTimestamp()}`);
    }

    setPasteModalSheet(null);
    setPastedRawText('');
  };

  return (
    <div className="min-h-screen w-full bg-[#F6F5F1] text-[#1E1E1E] flex flex-col justify-between items-center p-4 sm:p-8 relative bg-brutalist-grid selection:bg-[#E3EBDD] selection:text-[#1E1E1E]">
      
      {/* Top Header with Back Button and Centered JadwalIN Banner */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 mb-6 pt-2">
        
        {/* Back Icon Button */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to menu"
          className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.4} />
        </button>

        {/* JadwalIN Banner */}
        <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] py-2 px-6 sm:py-2.5 sm:px-10 shadow-[4px_4px_0px_0px_#1E1E1E] flex flex-col items-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-[#1E1E1E] uppercase leading-none">
            JadwalIN
          </h1>
          <span className="text-[10px] sm:text-xs font-bold tracking-widest text-[#666] uppercase mt-0.5 leading-none">
            DATASET FILES
          </span>
        </div>

        {/* Spacer for symmetrical centering */}
        <div className="w-10 h-10 sm:w-11 sm:h-11" aria-hidden="true" />
      </header>

      {/* Main Content Workspace */}
      <main className="w-full max-w-5xl mx-auto flex-1 flex flex-col items-center mb-8">
        
        {/* SPREADSHEET URL INPUT + REAL-TIME CONTROLS */}
        <div className="w-full mb-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="block text-xs sm:text-sm font-bold tracking-wider uppercase text-[#555]">
              SPREADSHEET SOURCE LINK
            </label>

            {/* Real-time sync toggles and link */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                className={`text-[11px] font-bold px-2 py-0.5 border border-[#1E1E1E] uppercase flex items-center gap-1 cursor-pointer transition-all ${
                  autoSyncEnabled
                    ? 'bg-[#E3EBDD] text-emerald-950 font-black shadow-[1px_1px_0px_0px_#1E1E1E]'
                    : 'bg-neutral-200 text-neutral-600'
                }`}
                title="Toggle Real-Time Polling (every 5 seconds)"
              >
                <Radio className={`w-3 h-3 ${autoSyncEnabled ? 'animate-pulse text-emerald-700' : ''}`} />
                <span>AUTO-SYNC: {autoSyncEnabled ? 'ON (5s)' : 'OFF'}</span>
              </button>

              {sheetUrl && (
                <a
                  href={sheetUrl.startsWith('http') ? sheetUrl : `https://${sheetUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-[#666] hover:text-black flex items-center gap-1 uppercase underline"
                >
                  <span>OPEN IN GOOGLE SHEETS</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
          
          <div className="flex items-stretch gap-2 sm:gap-3">
            {/* Fill Textbox */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={sheetUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="Paste Google Spreadsheet link here (e.g. https://docs.google.com/spreadsheets/d/.../edit)"
                className="w-full h-12 sm:h-14 bg-white border-3 border-[#1E1E1E] px-3 sm:px-4 text-xs sm:text-sm font-mono font-medium text-[#1E1E1E] shadow-[4px_4px_0px_0px_#1E1E1E] focus:outline-none focus:bg-[#FFFDF8]"
              />
            </div>

            {/* Real-time Refresh / Sync Now Button */}
            <button
              type="button"
              onClick={() => fetchSpreadsheetLive(sheetUrl, false)}
              disabled={isLoading}
              title="Sync Spreadsheet Now in Real-Time"
              className="h-12 sm:h-14 px-5 sm:px-6 bg-[#E3EBDD] hover:bg-[#D5E1CE] text-[#1E1E1E] border-3 border-[#1E1E1E] shadow-[4px_4px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer shrink-0 font-bold"
            >
              {isLoading || isSyncing ? (
                <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-emerald-800" strokeWidth={2.4} />
              ) : (
                <ArrowDown className="w-6 h-6 text-[#1E1E1E]" strokeWidth={2.8} />
              )}
            </button>
          </div>

          {/* Real-Time Live Status Feedback Bar */}
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono font-semibold mt-2 px-1 flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 border border-[#1E1E1E] inline-block ${
                  isLoading || isSyncing
                    ? 'bg-amber-400 animate-pulse'
                    : statusType === 'success'
                    ? 'bg-emerald-500'
                    : statusType === 'warning'
                    ? 'bg-rose-500'
                    : 'bg-neutral-400'
                }`}
              />
              <span className="text-[#333] font-bold">{statusMessage}</span>
            </span>
            <div className="flex items-center gap-2 text-neutral-600 font-bold">
              {lastSyncTime && <span>LAST SYNC: {lastSyncTime}</span>}
              <span className="text-emerald-700 hidden sm:inline">● REAL-TIME GViz ENGINE</span>
            </div>
          </div>
        </div>

        {/* 4 DROPDOWN SHEETS: Actual Spreadsheet Content */}
        <div className="w-full flex flex-col gap-4">
          
          {(['TEMPLATES', 'DATASET', 'CONFIGURATION', 'PARAMETER'] as const).map((sheetKey, index) => {
            const sheet = sheetsData[sheetKey];
            const isOpen = openSections[sheetKey];
            
            const headerColors = [
              'bg-[#E3EBDD] hover:bg-[#D5E1CE]',
              'bg-[#DCE6F2] hover:bg-[#CCDDF0]',
              'bg-[#EEDCCE] hover:bg-[#E5CFBE]',
              'bg-[#EAE8E0] hover:bg-[#DDD8CD]',
            ];

            const totalCols = sheet?.columns?.length || 6;
            const isTemplateTab = sheetKey === 'TEMPLATES';

            return (
              <div key={sheetKey} className="border-3 border-[#1E1E1E] bg-white shadow-[5px_5px_0px_0px_#1E1E1E]">
                
                {/* Dropdown Header Button */}
                <button
                  type="button"
                  onClick={() => toggleSection(sheetKey)}
                  className={`w-full ${headerColors[index]} p-3.5 sm:p-4 flex items-center justify-between text-left cursor-pointer transition-colors select-none`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg sm:text-xl font-black tracking-wider uppercase text-[#1E1E1E]">
                      {sheetKey}
                    </span>
                    <span className="text-xs bg-[#1E1E1E] text-white px-2 py-0.5 font-bold uppercase">
                      {sheet?.rows?.length || 0} ROWS • {totalCols} COLUMNS
                    </span>
                  </div>
                  
                  <div className="w-7 h-7 bg-[#1E1E1E] text-white flex items-center justify-center shrink-0">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4" strokeWidth={2.6} />
                    ) : (
                      <ChevronRight className="w-4 h-4" strokeWidth={2.6} />
                    )}
                  </div>
                </button>

                {/* Actual Spreadsheet Content Area */}
                {isOpen && sheet && (
                  <div className="border-t-3 border-[#1E1E1E] bg-[#FAFAF7]">
                    
                    {/* Header bar of sheet tab */}
                    <div className="bg-[#EAE8E0] border-b-2 border-[#1E1E1E] px-4 py-2 flex items-center justify-between text-xs font-mono font-bold flex-wrap gap-2">
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-800" />
                        <span>SPREADSHEET TAB: [{sheetKey}]</span>
                        <span className="text-[#666]">
                          • {totalCols} COLS × {sheet.rows.length} ROWS
                        </span>
                      </span>

                      {/* Manual Paste/Import button */}
                      <button
                        type="button"
                        onClick={() => {
                          setPasteModalSheet(sheetKey);
                          setPastedRawText('');
                        }}
                        className="px-2 py-1 bg-white hover:bg-neutral-100 border border-[#1E1E1E] text-[11px] font-bold flex items-center gap-1 cursor-pointer uppercase shadow-[1px_1px_0px_0px_#1E1E1E]"
                      >
                        <ClipboardPaste className="w-3 h-3" />
                        <span>Paste Sheet Cells</span>
                      </button>
                    </div>

                    {/* SPREADSHEET TABLE GRID WITH MERGED CELLS & CENTER ALIGNMENT */}
                    {sheet.rows.length === 0 ? (
                      <div className="p-10 text-center flex flex-col items-center justify-center gap-2 bg-[#FAFAF8]">
                        <FileSpreadsheet className="w-10 h-10 text-neutral-400" />
                        <div className="font-bold text-sm text-[#1E1E1E] uppercase tracking-wider">
                          {sheet.error ? `ACCESS NOTICE FOR [${sheetKey}]` : `AWAITING REAL SPREADSHEET CONTENT FOR [${sheetKey}]`}
                        </div>
                        <p className="text-xs text-[#666] max-w-md">
                          {sheet.error
                            ? sheet.error
                            : 'Enter your real Google Spreadsheet link in the textbox above to pull live data in real time, or click "Paste Sheet Cells" to paste cells directly.'}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                        <table className="w-full border-collapse font-mono text-xs sm:text-sm select-text">
                          
                          {/* Column headers (A, B, C, D...) */}
                          <thead className="sticky top-0 z-10 bg-[#E8E6DF] border-b-2 border-[#1E1E1E]">
                            <tr>
                              {/* Row Number header */}
                              <th className="w-12 p-2 border-r-2 border-b-2 border-[#1E1E1E] bg-[#DDD8CD] text-center text-xs font-bold text-[#555] select-none">
                                #
                              </th>
                              {sheet.columns.map((col, cIdx) => (
                                <th
                                  key={`col-${cIdx}`}
                                  className="p-2 border-r-2 border-b-2 border-[#1E1E1E] text-center font-bold text-xs text-[#333] min-w-[120px]"
                                >
                                  {col || String.fromCharCode(65 + cIdx)}
                                </th>
                              ))}
                            </tr>
                          </thead>

                          {/* Spreadsheet Cell Rows */}
                          <tbody className="divide-y border-[#1E1E1E] bg-white">
                            {sheet.rows.map((row, rIdx) => {
                              return (
                                <tr 
                                  key={`row-${rIdx}`} 
                                  className="hover:bg-[#F3F1E9]/70 transition-colors"
                                >
                                  {/* Row Number Column */}
                                  <td className="w-12 p-2 border-r-2 border-[#1E1E1E] bg-[#EFECE3] text-center font-bold text-xs text-[#555] select-none border-b border-[#D8D4C8]">
                                    {rIdx + 1}
                                  </td>

                                  {/* Render Cells:
                                      - If TEMPLATES: apply specialized merge & centering logic
                                      - If DATASET / CONFIG / PARAM: apply STRICT 1:1 column positioning
                                  */}
                                  {isTemplateTab
                                    ? renderTemplateRowCells(row, totalCols)
                                    : renderTabularRowCells(row, sheet.columns, rIdx)}
                                </tr>
                              );
                            })}
                          </tbody>

                        </table>
                      </div>
                    )}

                  </div>
                )}

              </div>
            );
          })}

        </div>

      </main>

      {/* MODAL: PASTE RAW SHEET DATA */}
      {pasteModalSheet && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#1E1E1E] shadow-[8px_8px_0px_0px_#1E1E1E] w-full max-w-xl p-6">
            <h3 className="text-xl font-black uppercase text-[#1E1E1E] mb-2 flex items-center gap-2">
              <span>PASTE CELLS FOR [{pasteModalSheet}]</span>
            </h3>
            <p className="text-xs text-[#666] mb-3">
              Copy cells directly from Google Sheets (Ctrl+C / Cmd+C) and paste them here (tab or comma separated):
            </p>
            <textarea
              rows={8}
              value={pastedRawText}
              onChange={(e) => setPastedRawText(e.target.value)}
              placeholder="Paste cells here..."
              className="w-full bg-[#FBFBFA] border-2 border-[#1E1E1E] p-3 text-xs font-mono text-[#1E1E1E] focus:outline-none mb-4"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPasteModalSheet(null)}
                className="px-4 py-2 border-2 border-[#1E1E1E] bg-[#EAE8E0] hover:bg-[#DDD8CD] text-xs font-bold uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleApplyPastedData}
                className="px-4 py-2 border-2 border-[#1E1E1E] bg-[#1E1E1E] text-white hover:bg-black text-xs font-bold uppercase cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>APPLY TO SPREADSHEET</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full text-center py-3 select-none">
        <span className="text-sm sm:text-base font-medium text-[#777] tracking-wider">
          @reallyratt
        </span>
      </footer>

    </div>
  );
}
