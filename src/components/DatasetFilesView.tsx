import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, 
  ArrowDown, 
  ChevronDown, 
  ChevronRight, 
  RefreshCw, 
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  extractSpreadsheetId, 
  fetchAllRequiredSheets, 
  SheetTable 
} from '../utils/googleSheets';

interface DatasetFilesViewProps {
  onBack: () => void;
}

const DEFAULT_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1uZxHI8k-Oqjh1qLVEMTsMt6L-Qpv6LqbNzjW20HH2r8/edit?usp=sharing';

// Initial sheets
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
    columns: ['A', 'B', 'C', 'D', 'E', 'F'],
    rows: [
      ['', 'NAMA', 'POSISI', 'KONDISI', 'STATUS', 'EXPERTISE'],
      ['1', 'CAY', 'PJABLE', 'SERING BOLONG PAGI', 'TUGASABLE', 'JACK OF ALL TRADES'],
      ['2', 'CISCA', 'SIDEKICK', 'MEMBER NORMAL', 'IZIN', 'CRD'],
      ['3', 'WINIH', 'SIDEKICK', 'SERING BOLONG', 'HIATUS', 'SO'],
      ['4', 'SATRIA', 'PJABLE', 'MEMBER NORMAL', 'TUGASABLE', 'CAM'],
      ['5', 'GALAN', 'PJABLE', 'MEMBER NORMAL', 'HIATUS', 'RUNNER'],
    ],
  },
  CONFIGURATION: {
    sheetName: 'CONFIGURATION',
    columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'],
    rows: [
      ['JADWAL PETUGAS KOMSOS IZIN', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['JENIS', 'MISA HARIAN', '', '', '', '', '', '', 'MISA MINGGUAN', '', '', '', ''],
      ['HARI', 'SENIN', '', '', '', '', '', '', 'SABTU', '', '', '', ''],
      ['PUKUL', '5:30', '5:30', '5:30', '5:30', '5:30', '18:00', '5:30', '17:00', '6:00', '8:00', '16:30', '18:30'],
      ['ANGGOTA', '', '', '', '', '', '', '', '', '', '', '', ''],
    ],
  },
  PARAMETER: {
    sheetName: 'PARAMETER',
    columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'],
    rows: [
      ['JADWAL PETUGAS KOMSOS MINGGU LALU', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['JENIS', 'MISA HARIAN', '', '', '', '', '', '', 'MISA MINGGUAN', '', '', '', ''],
      ['HARI', 'SENIN', '', '', '', '', '', '', 'SABTU', '', '', '', ''],
      ['PUKUL', '5:30', '5:30', '5:30', '5:30', '5:30', '18:00', '5:30', '17:00', '6:00', '8:00', '16:30', '18:30'],
      ['ANGGOTA', '', '', '', '', '', '', '', '', '', '', '', ''],
    ],
  },
};

/**
 * Specialized renderer for TEMPLATES sheet:
 * Handles exact merged banners (Title, Harian, Mingguan, Minggu 4 slots)
 * while keeping all slot columns perfectly aligned to columns A through F.
 */
function renderTemplateRowCells(row: string[]) {
  // Ensure exactly 6 cells for columns A, B, C, D, E, F
  const clean: string[] = Array.from({ length: 6 }, (_, i) =>
    row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : ''
  );
  const firstVal = clean.find((v) => v !== '') || '';
  const nonEmptyCount = clean.filter((v) => v !== '').length;

  // 1. Title row: "JADWAL PETUGAS..." (Merged across all 6 columns A through F)
  if (firstVal.toUpperCase().includes('JADWAL') || firstVal.toUpperCase().includes('PERIODE')) {
    return (
      <td
        colSpan={6}
        className="p-3 text-center font-black text-sm sm:text-base bg-[#EAE8E0] text-[#1E1E1E] tracking-wider border-r-2 border-b border-[#1E1E1E]"
      >
        {firstVal}
      </td>
    );
  }

  // 2. Entirely empty row (Spans all 6 columns)
  if (nonEmptyCount === 0) {
    return (
      <td
        colSpan={6}
        className="p-2 border-r-2 border-b border-[#E0DCD0] text-center text-neutral-300"
      >
        ·
      </td>
    );
  }

  // 3. Section HARIAN header:
  // Col A: empty, Col B & C: HARIAN (colSpan=2), Col D, E, F: empty (colSpan=3)
  if (clean.some((v) => v.toUpperCase() === 'HARIAN')) {
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
        <td
          colSpan={3}
          className="p-2 border-r-2 border-b border-[#E0DCD0] text-center text-neutral-300"
        >
          ·
        </td>
      </>
    );
  }

  // 4. Section MINGGUAN header:
  // Col A: empty, Col B through F: MINGGUAN (colSpan=5). Exactly 5 columns, NOT to Z!
  if (clean.some((v) => v.toUpperCase() === 'MINGGUAN')) {
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#EFECE3] text-center text-neutral-300">
          ·
        </td>
        <td
          colSpan={5}
          className="p-2 text-center font-black text-xs sm:text-sm bg-[#DCE6F2] text-[#1E1E1E] tracking-widest border-r-2 border-b border-[#1E1E1E]"
        >
          MINGGUAN
        </td>
      </>
    );
  }

  // 5. Mingguan TANGGAL row:
  // Col A: TANGGAL, Col B: {SAT}, Col C through F: {SUN} (colSpan=4)
  if (
    clean[0]?.toUpperCase() === 'TANGGAL' &&
    clean.some((v) => v.toUpperCase().includes('SUN') || v.toUpperCase() === '{SUN}')
  ) {
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#F5F3EC] font-black text-center text-[#1E1E1E]">
          TANGGAL
        </td>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold bg-[#E3EBDD]/40 text-[#1E1E1E]">
          {clean[1] || '{SAT}'}
        </td>
        <td
          colSpan={4}
          className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold bg-[#E3EBDD]/40 text-[#1E1E1E]"
        >
          {clean[2] || '{SUN}'}
        </td>
      </>
    );
  }

  // 6. Mingguan HARI row:
  // Col A: HARI, Col B: SABTU, Col C through F: MINGGU (colSpan=4)
  if (
    clean[0]?.toUpperCase() === 'HARI' &&
    clean.some((v) => v.toUpperCase().includes('MINGGU'))
  ) {
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#F5F3EC] font-black text-center text-[#1E1E1E]">
          HARI
        </td>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold text-[#1E1E1E]">
          {clean[1] || 'SABTU'}
        </td>
        <td
          colSpan={4}
          className="p-2 border-r-2 border-b border-[#E0DCD0] text-center font-bold text-[#1E1E1E]"
        >
          {clean[2] || 'MINGGU'}
        </td>
      </>
    );
  }

  // 7. General rows: Harian slots or Mingguan PUKUL/JAM, PJ, ANGGOTA
  return (
    <>
      {clean.map((val, cIdx) => {
        const isLabelCol = cIdx === 0;
        const isPlaceholder = val.startsWith('{') && val.endsWith('}');

        return (
          <td
            key={`cell-${cIdx}`}
            className={`p-2 border-r-2 border-b border-[#E0DCD0] text-center ${
              isLabelCol
                ? 'font-black bg-[#F5F3EC] text-[#1E1E1E]'
                : isPlaceholder
                ? 'bg-[#E3EBDD]/40 font-bold text-[#1E1E1E]'
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
 * Specialized renderer for CONFIGURATION & PARAMETER sheets:
 * Handles exact merged banners:
 * - Row 0: Title banner merged across all columns
 * - Row 1: JENIS with MISA HARIAN (Cols B..H = 7 cols) & MISA MINGGUAN (Cols I..M = 5 cols)
 * - Row 2: HARI with SENIN (Cols B..H = 7 cols) & SABTU (Cols I..M = 5 cols)
 * - Row 3+: PUKUL/JAM, ANGGOTA, and data rows 1:1 aligned
 */
function renderConfigParameterRowCells(row: string[], totalCols: number) {
  const clean: string[] = Array.from({ length: totalCols }, (_, i) =>
    row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : ''
  );
  const firstVal = clean.find((v) => v !== '') || '';
  const nonEmptyCount = clean.filter((v) => v !== '').length;

  // 1. Title row: "JADWAL PETUGAS..."
  if (firstVal.toUpperCase().includes('JADWAL') || firstVal.toUpperCase().includes('PERIODE')) {
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

  // 3. JENIS row: "JENIS", "MISA HARIAN" (Cols B..H = 7 cols), "MISA MINGGUAN" (Cols I..M = 5 cols)
  if (clean[0]?.toUpperCase() === 'JENIS' || clean.some((v) => v.toUpperCase().includes('MISA HARIAN'))) {
    const harianSpan = Math.min(7, Math.max(totalCols - 1, 1));
    const mingguanSpan = Math.max(totalCols - 1 - harianSpan, 1);
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#F5F3EC] font-black text-center text-[#1E1E1E]">
          {clean[0] || 'JENIS'}
        </td>
        <td
          colSpan={harianSpan}
          className="p-2 text-center font-black text-xs sm:text-sm bg-[#E3EBDD] text-[#1E1E1E] tracking-widest border-r-2 border-b border-[#1E1E1E]"
        >
          MISA HARIAN
        </td>
        <td
          colSpan={mingguanSpan}
          className="p-2 text-center font-black text-xs sm:text-sm bg-[#DCE6F2] text-[#1E1E1E] tracking-widest border-r-2 border-b border-[#1E1E1E]"
        >
          MISA MINGGUAN
        </td>
      </>
    );
  }

  // 4. HARI row: "HARI", "SENIN" (Cols B..H = 7 cols), "SABTU" (Cols I..M = 5 cols)
  if (clean[0]?.toUpperCase() === 'HARI' && clean.some((v) => v.toUpperCase() === 'SENIN' || v.toUpperCase() === 'SABTU')) {
    const seninSpan = Math.min(7, Math.max(totalCols - 1, 1));
    const sabtuSpan = Math.max(totalCols - 1 - seninSpan, 1);
    return (
      <>
        <td className="p-2 border-r-2 border-b border-[#E0DCD0] bg-[#F5F3EC] font-black text-center text-[#1E1E1E]">
          HARI
        </td>
        <td
          colSpan={seninSpan}
          className="p-2 text-center font-bold bg-[#E3EBDD]/40 text-[#1E1E1E] border-r-2 border-b border-[#E0DCD0]"
        >
          SENIN
        </td>
        <td
          colSpan={sabtuSpan}
          className="p-2 text-center font-bold bg-[#DCE6F2]/40 text-[#1E1E1E] border-r-2 border-b border-[#E0DCD0]"
        >
          SABTU
        </td>
      </>
    );
  }

  // 5. General rows: PUKUL/JAM, ANGGOTA, data rows (strictly pure black text)
  return (
    <>
      {clean.map((val, cIdx) => {
        const isLabelCol = cIdx === 0;

        return (
          <td
            key={`cell-${cIdx}`}
            className={`p-2 border-r-2 border-b border-[#E0DCD0] text-center ${
              isLabelCol
                ? 'font-black bg-[#F5F3EC] text-[#1E1E1E]'
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
 * Strict 1:1 Column renderer for tabular sheets (DATASET):
 * Ensures every cell is rendered in its true column position in pure black text.
 */
function renderTabularRowCells(row: string[], columns: string[], rIdx: number) {
  const isHeaderRow = rIdx === 0;

  return (
    <>
      {columns.map((_, cIdx) => {
        const rawVal = row[cIdx];
        const val = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
        const isNumber = /^\d+$/.test(val);
        const isCentered = isHeaderRow || isNumber || cIdx === 0;

        return (
          <td
            key={`cell-${cIdx}`}
            className={`p-2 border-r-2 border-b border-[#E0DCD0] ${
              isCentered ? 'text-center' : 'text-left'
            } ${
              isHeaderRow
                ? 'font-black bg-[#F5F3EC] text-[#1E1E1E] uppercase tracking-wider'
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
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('jadwalin_spreadsheet_url');
      return saved !== null && saved !== '' ? saved : DEFAULT_SPREADSHEET_URL;
    } catch {
      return DEFAULT_SPREADSHEET_URL;
    }
  });

  const [sheetsData, setSheetsData] = useState<{ [key: string]: SheetTable }>(initialSheets);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showDoneToast, setShowDoneToast] = useState<boolean>(false);
  
  // All dropdowns originally closed
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    TEMPLATES: false,
    DATASET: false,
    CONFIGURATION: false,
    PARAMETER: false,
  });

  const isMountedRef = useRef<boolean>(true);
  const doneToastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (doneToastTimeoutRef.current) {
        window.clearTimeout(doneToastTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Fetcher: queries Google Sheets GViz with cache-busting timestamp & headers=0
   */
  const fetchSpreadsheetLive = useCallback(
    async (targetUrl: string, isSilent = false) => {
      const trimmed = targetUrl.trim();
      if (!trimmed) {
        return;
      }

      const sheetId = extractSpreadsheetId(trimmed);
      if (!sheetId) {
        return;
      }

      if (!isSilent) {
        setIsLoading(true);
      }

      try {
        const liveData = await fetchAllRequiredSheets(sheetId);
        
        if (!isMountedRef.current) return;

        // Apply updated live data to sheets
        setSheetsData((prev) => {
          const updated = { ...prev };
          for (const key of ['TEMPLATES', 'DATASET', 'CONFIGURATION', 'PARAMETER']) {
            if (liveData[key] && liveData[key].rows && liveData[key].rows.length > 0) {
              const incoming = liveData[key];
              if (key === 'TEMPLATES') {
                updated[key] = {
                  ...incoming,
                  columns: ['A', 'B', 'C', 'D', 'E', 'F'],
                  rows: incoming.rows.map((r) => {
                    const trimmed = r.slice(0, 6);
                    return trimmed.length < 6
                      ? [...trimmed, ...Array(6 - trimmed.length).fill('')]
                      : trimmed;
                  }),
                };
              } else if (key === 'CONFIGURATION' || key === 'PARAMETER') {
                const maxCols = Math.max(incoming.columns.length, 13);
                const cols = Array.from({ length: maxCols }, (_, idx) => String.fromCharCode(65 + idx));
                updated[key] = {
                  ...incoming,
                  columns: cols,
                  rows: incoming.rows.map((r) => {
                    const trimmed = r.slice(0, maxCols);
                    return trimmed.length < maxCols
                      ? [...trimmed, ...Array(maxCols - trimmed.length).fill('')]
                      : trimmed;
                  }),
                };
              } else {
                updated[key] = incoming;
              }
            }
          }
          return updated;
        });
      } catch {
        // Handled silently
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          if (!isSilent) {
            setShowDoneToast(true);
            if (doneToastTimeoutRef.current) {
              window.clearTimeout(doneToastTimeoutRef.current);
            }
            doneToastTimeoutRef.current = window.setTimeout(() => {
              if (isMountedRef.current) {
                setShowDoneToast(false);
              }
            }, 3000);
          }
        }
      }
    },
    []
  );

  // Initial fetch on mount with default prefilled link so data is ready when user clicks dropdown
  useEffect(() => {
    if (sheetUrl.trim()) {
      fetchSpreadsheetLive(sheetUrl, true);
    }
  }, [fetchSpreadsheetLive, sheetUrl]);

  const handleUrlChange = (newUrl: string) => {
    setSheetUrl(newUrl);
    try {
      localStorage.setItem('jadwalin_spreadsheet_url', newUrl);
    } catch {
      // ignore
    }
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div className="min-h-screen w-full bg-[#F6F5F1] text-[#1E1E1E] flex flex-col items-center p-4 sm:p-8 relative bg-brutalist-grid selection:bg-[#E3EBDD] selection:text-[#1E1E1E]">
      
      {/* Top Navigation Row: Back Button on Left, Open External Sheet Button on Right */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 mb-4 pt-1">
        
        {/* Back Icon Button */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to menu"
          className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.4} />
        </button>

        {/* Button styled like the back button with pop up fade in / fade out animation */}
        <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center">
          <AnimatePresence>
            {sheetUrl.trim() && (
              <motion.a
                key="open-external-sheet-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                href={sheetUrl.startsWith('http') ? sheetUrl : `https://${sheetUrl}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in Google Sheets"
                title="Open in Google Sheets"
                className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                <ExternalLink className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.2} />
              </motion.a>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Frame behind the whole jadwalin dataset files and the dropdown */}
      <div className="w-full max-w-5xl mx-auto border-3 sm:border-4 border-[#1E1E1E] bg-[#EAE8E0]/40 p-4 sm:p-7 md:p-8 shadow-[8px_8px_0px_0px_#1E1E1E] flex flex-col items-center gap-6 mb-8">
        
        {/* Centered JadwalIN DATASET FILES Banner */}
        <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] py-2.5 px-8 sm:py-3 sm:px-12 shadow-[4px_4px_0px_0px_#1E1E1E] flex flex-col items-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-[#1E1E1E] uppercase leading-none">
            JadwalIN
          </h1>
          <span className="text-[10px] sm:text-xs font-bold tracking-widest text-[#666] uppercase mt-1 leading-none">
            DATASET FILES
          </span>
        </div>

        {/* SOURCE LINK Input Row */}
        <div className="w-full">
          <label className="block text-xs sm:text-sm font-bold tracking-wider uppercase text-[#333] mb-1.5">
            SOURCE LINK
          </label>
          
          <div className="flex items-stretch gap-2 sm:gap-3">
            {/* Fill Textbox with prefilled URL */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={sheetUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="Paste Google Spreadsheet link here"
                className="w-full h-12 sm:h-14 bg-white border-3 border-[#1E1E1E] px-3 sm:px-4 text-xs sm:text-sm font-mono font-medium text-[#1E1E1E] shadow-[4px_4px_0px_0px_#1E1E1E] focus:outline-none focus:bg-[#FFFDF8]"
              />
            </div>

            {/* Down Arrow Button */}
            <button
              type="button"
              onClick={() => fetchSpreadsheetLive(sheetUrl, false)}
              disabled={isLoading}
              title="Access and read spreadsheet content"
              className="h-12 sm:h-14 px-5 sm:px-6 bg-[#E3EBDD] hover:bg-[#D5E1CE] text-[#1E1E1E] border-3 border-[#1E1E1E] shadow-[4px_4px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer shrink-0 font-bold"
            >
              {isLoading ? (
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-800" strokeWidth={2.4} />
              ) : (
                <ArrowDown className="w-6 h-6 text-[#1E1E1E]" strokeWidth={2.8} />
              )}
            </button>
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

            const totalCols = sheet?.columns?.length || (sheetKey === 'TEMPLATES' ? 6 : (sheetKey === 'CONFIGURATION' || sheetKey === 'PARAMETER' ? 13 : 6));
            const isTemplateTab = sheetKey === 'TEMPLATES';
            const isConfigOrParam = sheetKey === 'CONFIGURATION' || sheetKey === 'PARAMETER';

            return (
              <div key={sheetKey} className="border-3 border-[#1E1E1E] bg-white shadow-[5px_5px_0px_0px_#1E1E1E]">
                
                {/* Dropdown Header Button - Tab name on left, chevron on right */}
                <button
                  type="button"
                  onClick={() => toggleSection(sheetKey)}
                  className={`w-full ${headerColors[index]} p-3.5 sm:p-4 flex items-center justify-between text-left cursor-pointer transition-colors select-none`}
                >
                  <span className="text-lg sm:text-xl font-black tracking-wider uppercase text-[#1E1E1E]">
                    {sheetKey}
                  </span>
                  
                  <div className="w-7 h-7 bg-[#1E1E1E] text-white flex items-center justify-center shrink-0">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4" strokeWidth={2.6} />
                    ) : (
                      <ChevronRight className="w-4 h-4" strokeWidth={2.6} />
                    )}
                  </div>
                </button>

                {/* Actual Spreadsheet Content Area with smooth in/out animation */}
                <AnimatePresence initial={false}>
                  {isOpen && sheet && (
                    <motion.div
                      key={`content-${sheetKey}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden border-t-3 border-[#1E1E1E] bg-[#FAFAF7]"
                    >
                      {sheet.rows.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center gap-2 bg-[#FAFAF8]">
                          <div className="font-bold text-sm text-[#1E1E1E] uppercase tracking-wider">
                            NO DATA AVAILABLE FOR [{sheetKey}]
                          </div>
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
                                    className="p-2 border-r-2 border-b-2 border-[#1E1E1E] text-center font-bold text-xs text-[#333] min-w-[100px]"
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
                                        - TEMPLATES: specialized merge layout
                                        - CONFIGURATION & PARAMETER: specialized merged schedule headers
                                        - DATASET: clean tabular row cells (pure black text)
                                    */}
                                    {isTemplateTab
                                      ? renderTemplateRowCells(row)
                                      : isConfigOrParam
                                      ? renderConfigParameterRowCells(row, totalCols)
                                      : renderTabularRowCells(row, sheet.columns, rIdx)}
                                  </tr>
                                );
                              })}
                            </tbody>

                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            );
          })}

        </div>

      </div>

      {/* Done Popup Notification with Fade In / Fade Out */}
      <AnimatePresence>
        {showDoneToast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] text-[#1E1E1E] px-8 py-2.5 shadow-[4px_4px_0px_0px_#1E1E1E] font-black text-sm tracking-widest uppercase">
              DONE
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer link to CayLabs Instagram */}
      <footer className="w-full text-center py-4 select-none mt-auto flex flex-col items-center gap-0.5">
        <a
          href="https://www.instagram.com/reallyratt/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm sm:text-base font-medium text-[#777] hover:text-[#1E1E1E] tracking-wider transition-colors inline-block cursor-pointer"
        >
          CayLabs Production
        </a>
        <span className="text-[11px] sm:text-xs font-mono text-[#999] tracking-widest uppercase">
          v0.5 Beta
        </span>
      </footer>

    </div>
  );
}
