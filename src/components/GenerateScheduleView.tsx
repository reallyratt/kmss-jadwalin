import React, { useState, useMemo, useCallback, useRef } from 'react';
import { 
  ArrowLeft, 
  Settings, 
  Calendar, 
  CheckCircle2, 
  Copy, 
  Camera, 
  Shuffle,
  X, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  SlidersHorizontal,
  FileSpreadsheet,
  Percent
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SheetTable, isSlotLiveMass } from '../utils/googleSheets';
import { 
  generateSchedule, 
  parseMembersFromDataset, 
  parseParameterRestingNames, 
  parseConfigurationRequests,
  calculateWeekDates, 
  normalizeTime,
  ScheduleResult, 
  Member 
} from '../utils/scheduler';

interface GenerateScheduleViewProps {
  onBack: () => void;
  sheetsData: { [key: string]: SheetTable };
  sheetUrl: string;
  onNavigateToDataset?: () => void;
}

/**
 * Returns upcoming or current Monday date
 */
function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  // If today is Monday (1), use today, else advance to next Monday
  const diff = day === 1 ? 0 : (8 - day) % 7;
  d.setDate(d.getDate() + (diff === 0 && day !== 1 ? 7 : diff));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Formats date to YYYY-MM-DD for HTML input
 */
function toInputDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function GenerateScheduleView({
  onBack,
  sheetsData,
  sheetUrl,
}: GenerateScheduleViewProps) {
  // 1. Date Selection: Defaults to upcoming Monday
  const [selectedMondayDate, setSelectedMondayDate] = useState<Date>(() => getNextMonday());

  // 2. Preferences Toggles
  const [useExpertise, setUseExpertise] = useState<boolean>(false);
  const [allowRequest, setAllowRequest] = useState<boolean>(true);
  const [allowSmartShuffle, setAllowSmartShuffle] = useState<boolean>(true);
  const [allowDoubleShift, setAllowDoubleShift] = useState<boolean>(false);

  // Petugas percentage activation
  const [enablePercentages, setEnablePercentages] = useState<boolean>(true);

  // Individual percentage checkmarks and values
  const [bolongPagiActive, setBolongPagiActive] = useState<boolean>(true);
  const [bolongPagiPct, setBolongPagiPct] = useState<number>(20);

  const [seringBolongActive, setSeringBolongActive] = useState<boolean>(true);
  const [seringBolongPct, setSeringBolongPct] = useState<number>(60);

  const [redflagActive, setRedflagActive] = useState<boolean>(true);
  const [redflagPct, setRedflagPct] = useState<number>(20);

  // 3. Scheduling State
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isShuffling, setIsShuffling] = useState<boolean>(false);
  const [shuffleKey, setShuffleKey] = useState<number>(0);
  const [generateCount, setGenerateCount] = useState<number>(0);
  const [swappedCell, setSwappedCell] = useState<string | null>(null);
  const [reshuffleNotice, setReshuffleNotice] = useState<string | null>(null);
  const [showDoneToast, setShowDoneToast] = useState<boolean>(false);
  const [selectedMemberModal, setSelectedMemberModal] = useState<Member | null>(null);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Table ref for capture
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Helper trigger DONE popup for 3 seconds
  const triggerDoneNotification = useCallback(() => {
    setShowDoneToast(true);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setShowDoneToast(false);
    }, 3000);
  }, []);

  // Parse datasets for pre-flight stats
  const datasetMembers = useMemo(() => {
    if (!sheetsData?.DATASET) return [];
    return parseMembersFromDataset(sheetsData.DATASET);
  }, [sheetsData?.DATASET]);

  const restingNames = useMemo(() => {
    if (!sheetsData?.PARAMETER) return new Set<string>();
    return parseParameterRestingNames(sheetsData.PARAMETER);
  }, [sheetsData?.PARAMETER]);

  const datePreview = useMemo(() => {
    return calculateWeekDates(selectedMondayDate);
  }, [selectedMondayDate]);

  // Handle Generate
  const handleGenerate = useCallback(() => {
    if (!sheetsData?.TEMPLATES || !sheetsData?.DATASET) return;

    setIsGenerating(true);
    setTimeout(() => {
      try {
        const scheduleResult = generateSchedule({
          templatesSheet: sheetsData.TEMPLATES,
          datasetSheet: sheetsData.DATASET,
          configSheet: sheetsData.CONFIGURATION || { sheetName: 'CONFIGURATION', columns: [], rows: [] },
          parameterSheet: sheetsData.PARAMETER || { sheetName: 'PARAMETER', columns: [], rows: [] },
          startDate: selectedMondayDate,
          useExpertise,
          allowRequest,
          allowSmartShuffle,
          allowMultiDuty: allowDoubleShift,
          enablePercentages,
          bolongPagiPctActive: bolongPagiActive,
          bolongPagiPct,
          seringBolongPctActive: seringBolongActive,
          seringBolongPct,
          redflagPctActive: redflagActive,
          redflagPct,
        });
        setResult(scheduleResult);
        setShuffleKey((prev) => prev + 1);
        setGenerateCount((prev) => prev + 1);
        triggerDoneNotification();
      } catch (err) {
        console.error('Error generating schedule:', err);
      } finally {
        setIsGenerating(false);
      }
    }, 120);
  }, [
    sheetsData,
    selectedMondayDate,
    useExpertise,
    allowRequest,
    allowSmartShuffle,
    allowDoubleShift,
    enablePercentages,
    bolongPagiActive,
    bolongPagiPct,
    seringBolongActive,
    seringBolongPct,
    redflagActive,
    redflagPct,
    triggerDoneNotification,
  ]);

  // Handle Reshuffle: smoothly fades out current names, generates fresh randomized schedule, and fades new names in
  const handleReshuffle = useCallback(() => {
    if (isGenerating || isShuffling || !sheetsData?.TEMPLATES || !sheetsData?.DATASET) return;
    setIsShuffling(true);

    setTimeout(() => {
      try {
        const freshResult = generateSchedule({
          templatesSheet: sheetsData.TEMPLATES,
          datasetSheet: sheetsData.DATASET,
          configSheet: sheetsData.CONFIGURATION || { sheetName: 'CONFIGURATION', columns: [], rows: [] },
          parameterSheet: sheetsData.PARAMETER || { sheetName: 'PARAMETER', columns: [], rows: [] },
          startDate: selectedMondayDate,
          useExpertise,
          allowRequest,
          allowSmartShuffle,
          allowMultiDuty: allowDoubleShift,
          enablePercentages,
          bolongPagiPctActive: bolongPagiActive,
          bolongPagiPct,
          seringBolongPctActive: seringBolongActive,
          seringBolongPct,
          redflagPctActive: redflagActive,
          redflagPct,
        });
        setResult(freshResult);
        setShuffleKey((prev) => prev + 1);
        triggerDoneNotification();
      } catch (err) {
        console.error('Error reshuffling schedule:', err);
      } finally {
        setIsShuffling(false);
      }
    }, 180);
  }, [
    isGenerating,
    isShuffling,
    sheetsData,
    selectedMondayDate,
    useExpertise,
    allowRequest,
    allowSmartShuffle,
    allowDoubleShift,
    enablePercentages,
    bolongPagiActive,
    bolongPagiPct,
    seringBolongActive,
    seringBolongPct,
    redflagActive,
    redflagPct,
    triggerDoneNotification,
  ]);

  // Auto-scroll down smoothly when schedule is generated
  React.useEffect(() => {
    if (result && generateCount > 0 && tableContainerRef.current) {
      const timer = setTimeout(() => {
        tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [result, generateCount]);

  // Handle Individual Reshuffle: Swaps this individual member with another eligible candidate
  const handleIndividualReshuffle = useCallback(
    (rIdx: number, colIdx: number) => {
      if (!result || !sheetsData?.DATASET) return;

      const tRows = result.filledTemplate;
      const currentName = String(tRows[rIdx]?.[colIdx] || '').trim();
      if (!currentName || currentName === '·' || currentName.startsWith('{')) return;

      const rowLabel = String(tRows[rIdx]?.[0] || '').trim().toUpperCase();
      const isPjRow = rowLabel === 'PJ';
      const isAnggotaRow = rowLabel === 'ANGGOTA';
      if (!isPjRow && !isAnggotaRow) return;

      const mingguanBannerIdx = tRows.findIndex((r) =>
        r.join(' ').toUpperCase().includes('MINGGUAN')
      );
      const isMingguan = mingguanBannerIdx !== -1 && rIdx > mingguanBannerIdx;

      // Determine day and time of this mass slot
      let massDay = '';
      let massTime = '';

      if (isMingguan) {
        if (colIdx === 1) {
          massDay = 'SABTU';
          massTime = '17:00';
        } else {
          massDay = 'MINGGU';
          if (colIdx === 2) massTime = '06:00';
          else if (colIdx === 3) massTime = '08:00';
          else if (colIdx === 4) massTime = '16:30';
          else if (colIdx === 5) massTime = '18:30';
        }
      } else {
        if (colIdx === 1) {
          massDay = 'SENIN';
          massTime = '05:30';
        } else if (colIdx === 2) {
          massDay = 'JUMAT';
          massTime = '05:30';
        }
      }

      // Check JAM/PUKUL row in tRows if present
      for (let sR = rIdx - 1; sR >= 0; sR--) {
        const sLabel = String(tRows[sR]?.[0] || '').trim().toUpperCase();
        if (sLabel === 'PUKUL' || sLabel === 'JAM') {
          const tVal = String(tRows[sR]?.[colIdx] || '').trim();
          if (tVal && tVal !== '·') {
            massTime = normalizeTime(tVal);
            break;
          }
        }
      }

      // Collect all assigned members in this same mass column (excluding the one being replaced)
      const currentMassMembers: string[] = [];
      const sectionStart = isMingguan ? (mingguanBannerIdx !== -1 ? mingguanBannerIdx + 1 : 0) : 0;
      const sectionEnd = isMingguan ? tRows.length : (mingguanBannerIdx !== -1 ? mingguanBannerIdx : tRows.length);

      for (let sR = sectionStart; sR < sectionEnd; sR++) {
        const sLabel = String(tRows[sR]?.[0] || '').trim().toUpperCase();
        if (sLabel === 'PJ' || sLabel === 'ANGGOTA') {
          if (sR !== rIdx) {
            const mVal = String(tRows[sR]?.[colIdx] || '').trim();
            if (mVal && mVal !== '·' && !mVal.startsWith('{')) {
              currentMassMembers.push(mVal.toUpperCase());
            }
          }
        }
      }

      // Check if this mass already has another PJable person among remaining members
      const hasOtherPj = currentMassMembers.some((mName) => {
        const mObj = datasetMembers.find((dm) => dm.name.toUpperCase() === mName);
        return mObj?.posisi === 'PJABLE';
      });

      // Calculate current duties for all members across the schedule
      const dutyCounts: { [name: string]: number } = {};
      tRows.forEach((row, rowI) => {
        const l = String(row[0] || '').trim().toUpperCase();
        if (l === 'PJ' || l === 'ANGGOTA') {
          for (let c = 1; c < row.length; c++) {
            if (rowI === rIdx && c === colIdx) continue; // don't count slot being replaced
            const n = String(row[c] || '').trim().toUpperCase();
            if (n && n !== '·' && !n.startsWith('{')) {
              dutyCounts[n] = (dutyCounts[n] || 0) + 1;
            }
          }
        }
      });

      // Filter eligible candidate pool
      const maxDuties = allowDoubleShift ? 2 : 1;
      const configRules = parseConfigurationRequests(
        sheetsData.CONFIGURATION || { sheetName: 'CONFIGURATION', columns: [], rows: [] }
      );

      const eligibleCandidates = datasetMembers.filter((m) => {
        const upper = m.name.toUpperCase();
        // 1. Cannot be the person currently in this slot
        if (upper === currentName.toUpperCase()) return false;

        // 2. Cannot already be in this same mass
        if (currentMassMembers.includes(upper)) return false;

        // 3. Status must not be HIATUS
        if (m.status === 'HIATUS') return false;

        // 4. Smart Shuffle: cannot be in last week's resting names
        if (allowSmartShuffle && restingNames.has(upper)) return false;

        // 5. Exclusion from CONFIGURATION (/name): cannot be excluded from this mass
        const exclusions = configRules.excludedByMember.get(m.name);
        if (exclusions) {
          if (exclusions.has(massDay) || exclusions.has(`${massDay}_${massTime}`)) {
            return false;
          }
        } else {
          // If no specific exclusion and status is IZIN, skip
          if (m.status === 'IZIN') return false;
        }

        // 6. Role check:
        // If this is a PJ slot, candidate MUST be PJable
        if (isPjRow && m.posisi !== 'PJABLE') return false;

        // If this is an ANGGOTA slot, but the mass has NO OTHER PJ, candidate must be PJable
        if (!hasOtherPj && m.posisi !== 'PJABLE') return false;

        // 7. Duty limit
        const dCount = dutyCounts[upper] || 0;
        if (dCount >= maxDuties) return false;

        // 8. Double name check: if candidate requested specific days, must match requested days
        const reqs = configRules.requestedDaysByMember.get(m.name);
        if (reqs && reqs.length > 1) {
          if (dCount >= 1) return false;
          const matchesAnyReq = reqs.some(
            (r) => r.day === massDay && (!r.time || r.time === massTime)
          );
          if (!matchesAnyReq) return false;
        }

        return true;
      });

      if (eligibleCandidates.length === 0) {
        setReshuffleNotice(
          `Tidak ada anggota lain yang memenuhi kriteria untuk slot ${massDay} ${massTime}.`
        );
        setTimeout(() => setReshuffleNotice(null), 3000);
        return;
      }

      // Prioritize members with 0 duties over members with 1 duty
      const zeroDutyCandidates = eligibleCandidates.filter(
        (m) => (dutyCounts[m.name.toUpperCase()] || 0) === 0
      );
      const pool = zeroDutyCandidates.length > 0 ? zeroDutyCandidates : eligibleCandidates;

      // Pick random replacement candidate
      const replacement = pool[Math.floor(Math.random() * pool.length)];

      // Apply swap
      const newFilledTemplate = tRows.map((r, ri) =>
        ri === rIdx
          ? r.map((c, ci) => (ci === colIdx ? replacement.name : c))
          : [...r]
      );

      const cellKey = `${rIdx}_${colIdx}`;
      const newAssignedMembers = {
        ...result.assignedMembers,
        [cellKey]: {
          ...replacement,
          dutyCount: (dutyCounts[replacement.name.toUpperCase()] || 0) + 1,
        },
      };

      const newAuditLogs = [
        ...result.auditLogs,
        `[RESHUFFLE INDIVIDU] Mengganti ${currentName} dengan ${replacement.name} (${replacement.posisi}, ${replacement.kondisi}) pada ${massDay} ${massTime}.`,
      ];

      setResult({
        ...result,
        filledTemplate: newFilledTemplate,
        assignedMembers: newAssignedMembers,
        auditLogs: newAuditLogs,
      });

      setSwappedCell(cellKey);
      triggerDoneNotification();
      setTimeout(() => {
        setSwappedCell(null);
      }, 2500);
    },
    [
      result,
      sheetsData,
      datasetMembers,
      allowDoubleShift,
      allowSmartShuffle,
      restingNames,
      triggerDoneNotification,
    ]
  );

  // Copy schedule in source file "JADWAL PETUGAS MINGGU LALU" format
  // Format: ONLY the scheduled members, aligned into the exact columns of the PARAMETER template
  // E.g., for Senin & Jumat:
  // x (selasa-kamis empty) a
  // y                      b
  const handleCopyTable = useCallback(() => {
    if (!result || !sheetsData?.TEMPLATES) return;

    const tRows = result.filledTemplate;

    // Extract assigned members for each day and time
    const massMembersMap = new Map<string, string[]>();
    let currentDays: { [c: number]: string } = {};
    let currentTimes: { [c: number]: string } = {};

    for (let r = 0; r < tRows.length; r++) {
      const row = tRows[r];
      const label = String(row[0] || '').trim().toUpperCase();

      if (label === 'HARI') {
        currentDays = {};
        let lastDay = '';
        for (let c = 1; c < row.length; c++) {
          const val = String(row[c] || '').trim().toUpperCase();
          if (val) lastDay = val;
          if (lastDay) currentDays[c] = lastDay;
        }
      } else if (label === 'PUKUL' || label === 'JAM') {
        currentTimes = {};
        for (let c = 1; c < row.length; c++) {
          const val = normalizeTime(String(row[c] || ''));
          if (val) currentTimes[c] = val;
        }
      } else if (
        label === 'PJ' || 
        label === 'ANGGOTA' || 
        label === 'TRAINEE' || 
        label === 'SO' || 
        label === 'CRD' || 
        label === 'CAM'
      ) {
        for (let c = 1; c < row.length; c++) {
          const name = String(row[c] || '').trim();
          const day = currentDays[c];
          const time = currentTimes[c];
          if (name && !name.startsWith('{') && name !== '[Perlu Petugas]' && day && time) {
            const key = `${day}_${time}`;
            const list = massMembersMap.get(key) || [];
            list.push(name);
            massMembersMap.set(key, list);
          }
        }
      }
    }

    // The 12 columns of the PARAMETER template (Petugas Minggu Lalu):
    // 0: Senin 05:30
    // 1: Selasa 05:30
    // 2: Rabu 05:30
    // 3: Kamis 05:30
    // 4: Jumat 05:30
    // 5: Jumat Pertama 18:00
    // 6: Sabtu 05:30
    // 7: Sabtu 17:00
    // 8: Minggu 06:00
    // 9: Minggu 08:00
    // 10: Minggu 16:30
    // 11: Minggu 18:30
    const targetColumns = [
      { day: 'SENIN', time: '05:30' },
      { day: 'SELASA', time: '05:30' },
      { day: 'RABU', time: '05:30' },
      { day: 'KAMIS', time: '05:30' },
      { day: 'JUMAT', time: '05:30' },
      { day: 'JUMAT', time: '18:00' },
      { day: 'SABTU', time: '05:30' },
      { day: 'SABTU', time: '17:00' },
      { day: 'MINGGU', time: '06:00' },
      { day: 'MINGGU', time: '08:00' },
      { day: 'MINGGU', time: '16:30' },
      { day: 'MINGGU', time: '18:30' },
    ];

    const colMembers = targetColumns.map((col) => {
      return massMembersMap.get(`${col.day}_${col.time}`) || [];
    });

    const maxMembers = Math.max(...colMembers.map((m) => m.length), 2);
    const rows: string[][] = [];

    for (let r = 0; r < maxMembers; r++) {
      const rowVals = colMembers.map((m) => m[r] || '');
      // Only include row if at least one member is scheduled
      if (rowVals.some((v) => v.trim() !== '')) {
        rows.push(rowVals);
      }
    }

    const tsvText = rows.map((r) => r.join('\t')).join('\n');
    navigator.clipboard.writeText(tsvText).then(() => {
      triggerDoneNotification();
    });
  }, [result, sheetsData, triggerDoneNotification]);

  // Capture table as high-resolution PNG image and auto-download
  const handleCaptureTable = useCallback(async () => {
    if (!result) return;
    setIsCapturing(true);

    try {
      const tRows = result.filledTemplate;
      const col0Width = 110;
      const slotColWidth = 155;
      const tableWidth = col0Width + slotColWidth * 5; // 885px
      const padX = 24;
      const padY = 24;
      const canvasWidth = tableWidth + padX * 2;

      // Find mingguan banner index for section determination
      const mingguanBannerIdx = tRows.findIndex((r) => 
        r.join(' ').toUpperCase().includes('MINGGUAN')
      );

      // Calculate row heights
      const rowHeights = tRows.map((row, rIdx) => {
        const rowText = row.join(' ').toUpperCase();
        if (rIdx === 0) return 44; // Title banner
        if (rowText.includes('HARIAN') || rowText.includes('MINGGUAN')) return 36; // Banners
        if (row.every((c) => !String(c || '').trim())) return 10; // Empty separator row
        return 38; // Standard row
      });

      const tableHeight = rowHeights.reduce((acc, h) => acc + h, 0);
      const bottomFooterHeight = 36;
      const canvasHeight = tableHeight + padY * 2 + bottomFooterHeight;

      const scale = 2; // 2x high-resolution crisp retina output
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth * scale;
      canvas.height = canvasHeight * scale;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Could not get canvas context');

      ctx.scale(scale, scale);

      // Background canvas fill
      ctx.fillStyle = '#F6F5F1';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Brutalist Table Shadow
      ctx.fillStyle = '#1E1E1E';
      ctx.fillRect(padX + 5, padY + 5, tableWidth, tableHeight);

      // Table Main Background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(padX, padY, tableWidth, tableHeight);

      let currentY = padY;

      tRows.forEach((row, rIdx) => {
        const rowHeight = rowHeights[rIdx];
        const rowText = row.join(' ').toUpperCase();
        const isTitle = rIdx === 0;
        const isHarianBanner = rowText.includes('HARIAN');
        const isMingguanBanner = rowText.includes('MINGGUAN');
        const isEmptyRow = row.every((c) => !String(c || '').trim());
        const isMingguanSection = mingguanBannerIdx !== -1 && rIdx > mingguanBannerIdx;

        if (isTitle) {
          // Title banner row across all columns
          ctx.fillStyle = '#EAE8E0';
          ctx.fillRect(padX, currentY, tableWidth, rowHeight);

          ctx.fillStyle = '#1E1E1E';
          ctx.font = 'bold 15px monospace, Courier New, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const titleText = row[0] || `JADWAL PETUGAS PERIODE ${datePreview['{tglperd}']}`;
          ctx.fillText(titleText, padX + tableWidth / 2, currentY + rowHeight / 2);

          ctx.strokeStyle = '#1E1E1E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(padX, currentY + rowHeight);
          ctx.lineTo(padX + tableWidth, currentY + rowHeight);
          ctx.stroke();
        } else if (isHarianBanner) {
          // Label col
          ctx.fillStyle = '#F5F3EC';
          ctx.fillRect(padX, currentY, col0Width, rowHeight);
          ctx.fillStyle = '#1E1E1E';
          ctx.font = 'bold 14px monospace, Courier New, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('·', padX + col0Width / 2, currentY + rowHeight / 2);

          // MISA HARIAN banner across 5 columns
          ctx.fillStyle = '#E3EBDD';
          ctx.fillRect(padX + col0Width, currentY, slotColWidth * 5, rowHeight);
          ctx.fillStyle = '#1E1E1E';
          ctx.font = 'bold 13px monospace, Courier New, sans-serif';
          ctx.fillText('MISA HARIAN', padX + col0Width + (slotColWidth * 5) / 2, currentY + rowHeight / 2);

          // Borders
          ctx.strokeStyle = '#1E1E1E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(padX, currentY + rowHeight);
          ctx.lineTo(padX + tableWidth, currentY + rowHeight);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(padX + col0Width, currentY);
          ctx.lineTo(padX + col0Width, currentY + rowHeight);
          ctx.stroke();
        } else if (isMingguanBanner) {
          // Label col
          ctx.fillStyle = '#F5F3EC';
          ctx.fillRect(padX, currentY, col0Width, rowHeight);
          ctx.fillStyle = '#1E1E1E';
          ctx.font = 'bold 14px monospace, Courier New, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('·', padX + col0Width / 2, currentY + rowHeight / 2);

          // MISA MINGGUAN banner across 5 columns
          ctx.fillStyle = '#DCE6F2';
          ctx.fillRect(padX + col0Width, currentY, slotColWidth * 5, rowHeight);
          ctx.fillStyle = '#1E1E1E';
          ctx.font = 'bold 13px monospace, Courier New, sans-serif';
          ctx.fillText('MISA MINGGUAN', padX + col0Width + (slotColWidth * 5) / 2, currentY + rowHeight / 2);

          // Borders
          ctx.strokeStyle = '#1E1E1E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(padX, currentY + rowHeight);
          ctx.lineTo(padX + tableWidth, currentY + rowHeight);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(padX + col0Width, currentY);
          ctx.lineTo(padX + col0Width, currentY + rowHeight);
          ctx.stroke();
        } else if (isEmptyRow) {
          ctx.fillStyle = '#F6F5F1';
          ctx.fillRect(padX, currentY, tableWidth, rowHeight);
          ctx.strokeStyle = '#E0DCD0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(padX, currentY + rowHeight);
          ctx.lineTo(padX + tableWidth, currentY + rowHeight);
          ctx.stroke();
        } else {
          // General row (TANGGAL, HARI, PUKUL, PJ, ANGGOTA)
          const rowLabel = row[0] ? String(row[0]).trim().toUpperCase() : '';
          const isPjRow = rowLabel === 'PJ';
          const isAnggotaRow = rowLabel === 'ANGGOTA';

          // Col 0: Label
          ctx.fillStyle = '#F5F3EC';
          ctx.fillRect(padX, currentY, col0Width, rowHeight);
          ctx.fillStyle = '#1E1E1E';
          ctx.font = 'bold 12px monospace, Courier New, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rowLabel || '·', padX + col0Width / 2, currentY + rowHeight / 2);

          // Border right of Col 0
          ctx.strokeStyle = '#1E1E1E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(padX + col0Width, currentY);
          ctx.lineTo(padX + col0Width, currentY + rowHeight);
          ctx.stroke();

          // Data cells
          if (isMingguanSection && (rowLabel === 'HARI' || rowLabel === 'TANGGAL')) {
            // Merged Sunday row! Col 1: Saturday, Col 2: Sunday (spanning all 4 Sunday masses 06:00 to 18:30)
            const satVal = String(row[1] || '').trim();
            const satX = padX + col0Width;
            ctx.fillStyle = '#FAF9F5';
            ctx.fillRect(satX, currentY, slotColWidth, rowHeight);
            ctx.fillStyle = '#1E1E1E';
            ctx.font = 'bold 12px monospace, Courier New, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(satVal || '·', satX + slotColWidth / 2, currentY + rowHeight / 2);

            // Border after Saturday
            ctx.strokeStyle = '#E0DCD0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(satX + slotColWidth, currentY);
            ctx.lineTo(satX + slotColWidth, currentY + rowHeight);
            ctx.stroke();

            // Col 2 to 5: Merged Sunday spanning all remaining columns
            const sunVal = String(row[2] || '').trim();
            const sunX = satX + slotColWidth;
            const sunWidth = slotColWidth * 4;
            ctx.fillStyle = '#FAF9F5';
            ctx.fillRect(sunX, currentY, sunWidth, rowHeight);
            ctx.fillStyle = '#1E1E1E';
            ctx.font = 'bold 12px monospace, Courier New, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sunVal || '·', sunX + sunWidth / 2, currentY + rowHeight / 2);
          } else {
            // Standard 5 slot columns
            for (let c = 1; c <= 5; c++) {
              const cellX = padX + col0Width + (c - 1) * slotColWidth;
              const cellVal = String(row[c] || '').trim();
              const isAssigned = (isPjRow || isAnggotaRow) && cellVal && cellVal !== '·';
              const isLiveMassColumn = isSlotLiveMass(
                isMingguanSection ? 'MINGGUAN' : 'HARIAN',
                c,
                sheetsData?.TEMPLATES
              );

              // Cell background
              if (isLiveMassColumn) {
                if (rowLabel === 'HARI' || rowLabel === 'TANGGAL') {
                  ctx.fillStyle = '#FEF08A';
                } else if (rowLabel === 'PUKUL' || rowLabel === 'JAM') {
                  ctx.fillStyle = '#FEF9C3';
                } else {
                  ctx.fillStyle = '#FFFBEB';
                }
              } else if (rowLabel === 'HARI' || rowLabel === 'TANGGAL') {
                ctx.fillStyle = '#FAF9F5';
              } else {
                ctx.fillStyle = '#FFFFFF';
              }
              ctx.fillRect(cellX, currentY, slotColWidth, rowHeight);

              if (isAssigned) {
                const badgePadX = 6;
                const badgePadY = 4;
                const badgeWidth = slotColWidth - badgePadX * 2;
                const badgeHeight = rowHeight - badgePadY * 2;

                ctx.fillStyle = isLiveMassColumn
                  ? (isPjRow ? '#FEF08A' : '#FEF9C3')
                  : (isPjRow ? '#E3EBDD' : '#DCE6F2');
                ctx.fillRect(cellX + badgePadX, currentY + badgePadY, badgeWidth, badgeHeight);

                ctx.strokeStyle = isLiveMassColumn
                  ? (isPjRow ? '#D97706' : '#EAB308')
                  : (isPjRow ? '#88B87B' : '#7F9EBF');
                ctx.lineWidth = 1.5;
                ctx.strokeRect(cellX + badgePadX, currentY + badgePadY, badgeWidth, badgeHeight);

                ctx.fillStyle = '#1E1E1E';
                ctx.font = 'bold 11px monospace, Courier New, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let textToDraw = cellVal;
                if (ctx.measureText(textToDraw).width > badgeWidth - 8) {
                  while (textToDraw.length > 3 && ctx.measureText(textToDraw + '..').width > badgeWidth - 8) {
                    textToDraw = textToDraw.slice(0, -1);
                  }
                  textToDraw += '..';
                }
                ctx.fillText(textToDraw, cellX + slotColWidth / 2, currentY + rowHeight / 2);
              } else {
                ctx.fillStyle = cellVal ? '#1E1E1E' : '#B5B3A8';
                ctx.font = (isLiveMassColumn && rowLabel === 'HARI')
                  ? '900 12px monospace, Courier New, sans-serif'
                  : 'bold 12px monospace, Courier New, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const drawText = (isLiveMassColumn && rowLabel === 'HARI' && cellVal)
                  ? `${cellVal} (LIVE)`
                  : (cellVal || '·');
                ctx.fillText(drawText, cellX + slotColWidth / 2, currentY + rowHeight / 2);
              }

              if (c < 5) {
                ctx.strokeStyle = '#E0DCD0';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cellX + slotColWidth, currentY);
                ctx.lineTo(cellX + slotColWidth, currentY + rowHeight);
                ctx.stroke();
              }
            }
          }

          // Row bottom border
          ctx.strokeStyle = '#E0DCD0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(padX, currentY + rowHeight);
          ctx.lineTo(padX + tableWidth, currentY + rowHeight);
          ctx.stroke();
        }

        currentY += rowHeight;
      });

      // Outer table border (3px solid #1E1E1E)
      ctx.strokeStyle = '#1E1E1E';
      ctx.lineWidth = 3;
      ctx.strokeRect(padX, padY, tableWidth, tableHeight);

      // Watermark branding on middle bottom: "JADWALIN by CayLabs"
      const footerY = padY + tableHeight + 22;
      ctx.fillStyle = '#1E1E1E';
      ctx.font = 'bold 12px monospace, Courier New, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JADWALIN by CayLabs', canvasWidth / 2, footerY);

      // Download as PNG Blob
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const monStr = (datePreview['{mon}'] || 'Senin').replace(/\//g, '-');
        const sunStr = (datePreview['{sun}'] || 'Minggu').replace(/\//g, '-');
        link.download = `Jadwal_Komsos_${monStr}_sd_${sunStr}.png`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 150);
        triggerDoneNotification();
      }
    } catch (err) {
      console.error('Failed to capture table:', err);
    } finally {
      setIsCapturing(false);
    }
  }, [result, datePreview, triggerDoneNotification]);

  return (
    <div className="min-h-screen w-full bg-[#F6F5F1] text-[#1E1E1E] flex flex-col items-center p-3 sm:p-6 md:p-8 relative bg-brutalist-grid selection:bg-[#E3EBDD] selection:text-[#1E1E1E]">
      
      {/* Top Navigation Row: Back Button on Left, Log Audit Button on Right (appears when generated) */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 mb-4 pt-1">
        
        {/* Back Button */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to menu"
          title="Back to Menu"
          className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.4} />
        </button>

        {/* Log Audit Button on Top Right: Appears only after a generated jadwal */}
        <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center">
          <AnimatePresence>
            {result && (
              <motion.button
                key="log-audit-btn"
                type="button"
                onClick={() => setShowAuditModal(true)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                aria-label="Audit Log"
                title="Log Audit & Verifikasi Aturan"
                className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E1E1E] text-white hover:bg-black transition-colors flex items-center justify-center shrink-0 border border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                <SlidersHorizontal className="w-5 h-5 sm:w-6 sm:h-6 text-white" strokeWidth={2.2} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Frame behind the whole jadwalin generate schedule */}
      <div className="w-full max-w-5xl mx-auto border-3 sm:border-4 border-[#1E1E1E] bg-[#EAE8E0]/40 p-4 sm:p-7 md:p-8 shadow-[8px_8px_0px_0px_#1E1E1E] flex flex-col items-center gap-6 mb-8 flex-1">
        
        {/* Centered JadwalIN GENERATE SCHEDULE Banner */}
        <div className="border-3 border-[#1E1E1E] bg-[#EAE8E0] py-2.5 px-8 sm:py-3 sm:px-12 shadow-[4px_4px_0px_0px_#1E1E1E] flex flex-col items-center text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-[#1E1E1E] uppercase leading-none">
            JadwalIN
          </h1>
          <span className="text-[10px] sm:text-xs font-bold tracking-widest text-[#666] uppercase mt-1 leading-none">
            GENERATE SCHEDULE
          </span>
        </div>

        {/* CONTROLS & PARAMETERS SECTION */}
        <div className="w-full bg-[#F6F5F1] border-3 border-[#1E1E1E] p-4 sm:p-6 shadow-[5px_5px_0px_0px_#1E1E1E] flex flex-col gap-6">
          
          {/* Section 1: WEEK OF THE SCHEDULE */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-[#E0DCD0] pb-5">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="monday-date-input" className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#1E1E1E]">
                WEEK OF THE SCHEDULE
              </label>
              <span className="text-[11px] sm:text-xs text-[#666] font-medium">
                Monday is the beginning of the week.
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* -7D Button */}
              <button
                type="button"
                onClick={() => {
                  const prev = new Date(selectedMondayDate);
                  prev.setDate(prev.getDate() - 7);
                  setSelectedMondayDate(prev);
                }}
                title="Minggu Sebelumnya"
                className="px-3 py-2 bg-[#EAE8E0] hover:bg-[#DDD8CC] text-[#1E1E1E] border-2 border-[#1E1E1E] font-black text-xs sm:text-sm shadow-[2px_2px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                -7D
              </button>

              {/* Date select input without calendar icon inside */}
              <input
                id="monday-date-input"
                type="date"
                value={toInputDateString(selectedMondayDate)}
                onChange={(e) => {
                  if (e.target.value) {
                    const parsed = new Date(`${e.target.value}T00:00:00`);
                    setSelectedMondayDate(parsed);
                  }
                }}
                className="bg-white border-2 border-[#1E1E1E] px-3 py-1.5 font-bold text-xs sm:text-sm text-[#1E1E1E] shadow-[2px_2px_0px_0px_#1E1E1E] focus:outline-none focus:ring-1 focus:ring-[#1E1E1E] appearance-none"
              />

              {/* +7D Button */}
              <button
                type="button"
                onClick={() => {
                  const next = new Date(selectedMondayDate);
                  next.setDate(next.getDate() + 7);
                  setSelectedMondayDate(next);
                }}
                title="Minggu Berikutnya"
                className="px-3 py-2 bg-[#EAE8E0] hover:bg-[#DDD8CC] text-[#1E1E1E] border-2 border-[#1E1E1E] font-black text-xs sm:text-sm shadow-[2px_2px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                +7D
              </button>
            </div>
          </div>

          {/* Section 2: PREFERENCES */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b-2 border-[#1E1E1E] pb-2">
              <span className="text-base sm:text-lg font-black uppercase tracking-wider text-[#1E1E1E]">
                PREFERENCES
              </span>
            </div>

            {/* 4 Main Feature Toggles */}
            {/* Layout: Left = REQUEST, below it SMART SHUFFLE. Right = EXPERTISE MODE, below it DOUBLE SHIFT */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* Left Col 1: REQUEST */}
              <div 
                onClick={() => setAllowRequest(!allowRequest)}
                className={`border-2 border-[#1E1E1E] p-3 flex items-center justify-between cursor-pointer select-none transition-colors duration-300 ease-in-out shadow-[2px_2px_0px_0px_#1E1E1E] ${
                  allowRequest ? 'bg-[#E3EBDD]' : 'bg-white'
                }`}
              >
                <div className="flex flex-col pr-2">
                  <span className="font-black text-xs sm:text-sm uppercase text-[#1E1E1E]">
                    REQUEST
                  </span>
                  <span className="text-[10px] text-[#555] leading-tight mt-0.5">
                    Scheduling based on certain request first.
                  </span>
                </div>
                <div className={`w-11 h-6 border-2 border-[#1E1E1E] flex items-center p-0.5 shrink-0 transition-colors duration-300 ease-in-out ${allowRequest ? 'bg-[#1E1E1E]' : 'bg-white'}`}>
                  <div className={`w-4 h-4 border border-[#1E1E1E] transform transition-all duration-300 ease-in-out ${allowRequest ? 'translate-x-5 bg-[#E3EBDD]' : 'translate-x-0 bg-white'}`} />
                </div>
              </div>

              {/* Right Col 1: EXPERTISE MODE */}
              <div 
                onClick={() => setUseExpertise(!useExpertise)}
                className={`border-2 border-[#1E1E1E] p-3 flex items-center justify-between cursor-pointer select-none transition-colors duration-300 ease-in-out shadow-[2px_2px_0px_0px_#1E1E1E] ${
                  useExpertise ? 'bg-[#E3EBDD]' : 'bg-white'
                }`}
              >
                <div className="flex flex-col pr-2">
                  <span className="font-black text-xs sm:text-sm uppercase text-[#1E1E1E]">
                    EXPERTISE MODE
                  </span>
                  <span className="text-[10px] text-[#555] leading-tight mt-0.5">
                    Scheduling with expertise placeholders.
                  </span>
                </div>
                <div className={`w-11 h-6 border-2 border-[#1E1E1E] flex items-center p-0.5 shrink-0 transition-colors duration-300 ease-in-out ${useExpertise ? 'bg-[#1E1E1E]' : 'bg-white'}`}>
                  <div className={`w-4 h-4 border border-[#1E1E1E] transform transition-all duration-300 ease-in-out ${useExpertise ? 'translate-x-5 bg-[#E3EBDD]' : 'translate-x-0 bg-white'}`} />
                </div>
              </div>

              {/* Left Col 2: SMART SHUFFLE */}
              <div 
                onClick={() => setAllowSmartShuffle(!allowSmartShuffle)}
                className={`border-2 border-[#1E1E1E] p-3 flex items-center justify-between cursor-pointer select-none transition-colors duration-300 ease-in-out shadow-[2px_2px_0px_0px_#1E1E1E] ${
                  allowSmartShuffle ? 'bg-[#E3EBDD]' : 'bg-white'
                }`}
              >
                <div className="flex flex-col pr-2">
                  <span className="font-black text-xs sm:text-sm uppercase text-[#1E1E1E]">
                    SMART SHUFFLE
                  </span>
                  <span className="text-[10px] text-[#555] leading-tight mt-0.5">
                    Prevent last week's member to be scheduled again.
                  </span>
                </div>
                <div className={`w-11 h-6 border-2 border-[#1E1E1E] flex items-center p-0.5 shrink-0 transition-colors duration-300 ease-in-out ${allowSmartShuffle ? 'bg-[#1E1E1E]' : 'bg-white'}`}>
                  <div className={`w-4 h-4 border border-[#1E1E1E] transform transition-all duration-300 ease-in-out ${allowSmartShuffle ? 'translate-x-5 bg-[#E3EBDD]' : 'translate-x-0 bg-white'}`} />
                </div>
              </div>

              {/* Right Col 2: DOUBLE SHIFT */}
              <div 
                onClick={() => setAllowDoubleShift(!allowDoubleShift)}
                className={`border-2 border-[#1E1E1E] p-3 flex items-center justify-between cursor-pointer select-none transition-colors duration-300 ease-in-out shadow-[2px_2px_0px_0px_#1E1E1E] ${
                  allowDoubleShift ? 'bg-[#E3EBDD]' : 'bg-white'
                }`}
              >
                <div className="flex flex-col pr-2">
                  <span className="font-black text-xs sm:text-sm uppercase text-[#1E1E1E]">
                    DOUBLE SHIFT
                  </span>
                  <span className="text-[10px] text-[#555] leading-tight mt-0.5">
                    Multi-shift if there's a member shortage.
                  </span>
                </div>
                <div className={`w-11 h-6 border-2 border-[#1E1E1E] flex items-center p-0.5 shrink-0 transition-colors duration-300 ease-in-out ${allowDoubleShift ? 'bg-[#1E1E1E]' : 'bg-white'}`}>
                  <div className={`w-4 h-4 border border-[#1E1E1E] transform transition-all duration-300 ease-in-out ${allowDoubleShift ? 'translate-x-5 bg-[#E3EBDD]' : 'translate-x-0 bg-white'}`} />
                </div>
              </div>

            </div>

            {/* Petugas Percentage Master Box */}
            <div className={`border-2 border-[#1E1E1E] p-3.5 sm:p-4 shadow-[3px_3px_0px_0px_#1E1E1E] flex flex-col gap-3 transition-colors duration-300 ease-in-out ${
              enablePercentages ? 'bg-[#E3EBDD]' : 'bg-white'
            }`}>
              
              {/* Header Toggle to activate/deactivate entire schedule percentage */}
              <div className="flex items-center justify-between border-b border-[#E0DCD0] pb-2.5">
                <span className="font-black text-xs sm:text-sm uppercase text-[#1E1E1E]">
                  PETUGAS PERCENTAGE
                </span>

                {/* On / Off switch matching the theme */}
                <div 
                  onClick={() => setEnablePercentages(!enablePercentages)}
                  className={`w-11 h-6 border-2 border-[#1E1E1E] flex items-center p-0.5 shrink-0 cursor-pointer select-none transition-colors duration-300 ease-in-out ${
                    enablePercentages ? 'bg-[#1E1E1E]' : 'bg-white'
                  }`}
                >
                  <div className={`w-4 h-4 border border-[#1E1E1E] transform transition-all duration-300 ease-in-out ${
                    enablePercentages ? 'translate-x-5 bg-[#E3EBDD]' : 'translate-x-0 bg-white'
                  }`} />
                </div>
              </div>

              {/* 3 Individual Percentage Rows with checkmarks on left and slider/number on right */}
              <div className={`flex flex-col gap-3 transition-all duration-300 ease-in-out ${enablePercentages ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                
                {/* 1. Bolong Pagi Tugas Pagi (0-100% default 20%) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F9F8F5] p-2.5 border border-[#1E1E1E]">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={bolongPagiActive}
                      onChange={(e) => setBolongPagiActive(e.target.checked)}
                      className="w-4 h-4 rounded-none accent-[#1E1E1E] border-2 border-[#1E1E1E] cursor-pointer"
                    />
                    <span className="font-bold text-xs uppercase text-[#1E1E1E]">
                      Bolong Pagi Tugas Pagi
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={bolongPagiPct}
                      onChange={(e) => setBolongPagiPct(Number(e.target.value))}
                      className="w-28 sm:w-36 square-slider cursor-pointer"
                    />
                    <span className="font-mono font-black text-xs w-12 text-right bg-white px-1.5 py-0.5 border border-[#1E1E1E]">
                      {bolongPagiPct}%
                    </span>
                  </div>
                </div>

                {/* 2. Sering Bolong Ditugaskan (0-100% default 60%) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F9F8F5] p-2.5 border border-[#1E1E1E]">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={seringBolongActive}
                      onChange={(e) => setSeringBolongActive(e.target.checked)}
                      className="w-4 h-4 rounded-none accent-[#1E1E1E] border-2 border-[#1E1E1E] cursor-pointer"
                    />
                    <span className="font-bold text-xs uppercase text-[#1E1E1E]">
                      Sering Bolong Ditugaskan
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={seringBolongPct}
                      onChange={(e) => setSeringBolongPct(Number(e.target.value))}
                      className="w-28 sm:w-36 square-slider cursor-pointer"
                    />
                    <span className="font-mono font-black text-xs w-12 text-right bg-white px-1.5 py-0.5 border border-[#1E1E1E]">
                      {seringBolongPct}%
                    </span>
                  </div>
                </div>

                {/* 3. Redflag Ditugaskan (0-100% default 20%) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F9F8F5] p-2.5 border border-[#1E1E1E]">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={redflagActive}
                      onChange={(e) => setRedflagActive(e.target.checked)}
                      className="w-4 h-4 rounded-none accent-[#1E1E1E] border-2 border-[#1E1E1E] cursor-pointer"
                    />
                    <span className="font-bold text-xs uppercase text-[#1E1E1E]">
                      Redflag Ditugaskan
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={redflagPct}
                      onChange={(e) => setRedflagPct(Number(e.target.value))}
                      className="w-28 sm:w-36 square-slider cursor-pointer"
                    />
                    <span className="font-mono font-black text-xs w-12 text-right bg-white px-1.5 py-0.5 border border-[#1E1E1E]">
                      {redflagPct}%
                    </span>
                  </div>
                </div>

              </div>

            </div>

          </div>

          {/* GENERATE Button without icon, text just GENERATE */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || datasetMembers.length === 0}
            className="w-full bg-[#1E1E1E] hover:bg-black text-white font-black text-lg tracking-widest uppercase py-4 px-6 border-3 border-[#1E1E1E] shadow-[5px_5px_0px_0px_#999] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'GENERATING...' : 'GENERATE'}
          </button>

        </div>

        {/* RESULTS SECTION: Appears once generated with slide down animation */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key={`schedule-results-${generateCount}`}
              initial={{ opacity: 0, y: -45, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -30, height: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="w-full flex flex-col gap-4 overflow-hidden"
            >
            
            {/* Top Action Icons Bar: Aligned to the left (Copy, Capture, Reshuffle) + feedback notice */}
            <div className="w-full flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                {/* Copy Icon Button */}
                <button
                  type="button"
                  onClick={handleCopyTable}
                  title="Salin Anggota Terjadwal (Format Petugas Minggu Lalu)"
                  className="w-10 h-10 sm:w-11 sm:h-11 bg-white hover:bg-[#EAE8E0] text-[#1E1E1E] border-2 border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer"
                >
                  <Copy className="w-5 h-5 text-[#1E1E1E]" strokeWidth={2.4} />
                </button>

                {/* Capture Table Icon Button: Auto downloaded as PNG */}
                <button
                  type="button"
                  onClick={handleCaptureTable}
                  disabled={isCapturing}
                  title="Capture Table (Download Gambar)"
                  className="w-10 h-10 sm:w-11 sm:h-11 bg-white hover:bg-[#EAE8E0] text-[#1E1E1E] border-2 border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-5 h-5 text-[#1E1E1E]" strokeWidth={2.4} />
                </button>

                {/* Reshuffle Icon Button: Reshuffles petugas with smooth fade out/fade in */}
                <button
                  type="button"
                  onClick={handleReshuffle}
                  disabled={isShuffling || isGenerating}
                  title="Acak Ulang Semua Petugas (Reshuffle)"
                  className="w-10 h-10 sm:w-11 sm:h-11 bg-white hover:bg-[#EAE8E0] text-[#1E1E1E] border-2 border-[#1E1E1E] shadow-[3px_3px_0px_0px_#1E1E1E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <Shuffle className={`w-5 h-5 text-[#1E1E1E] transition-transform duration-300 ${isShuffling ? 'rotate-180 scale-90' : ''}`} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            {/* THE GENERATED SCHEDULE TABLE CONTAINER (Pure Brutalist Look with Fixed Columns) */}
            <div 
              ref={tableContainerRef}
              className="w-full overflow-x-auto border-3 border-[#1E1E1E] bg-white shadow-[6px_6px_0px_0px_#1E1E1E]"
            >
              <table className="w-full text-left border-collapse select-text table-fixed min-w-[720px]">
                <colgroup>
                  <col className="w-24 sm:w-28" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <tbody>
                  {result.filledTemplate.map((row, rIdx) => {
                    const rowText = row.join(' ').toUpperCase();
                    const isTitle = rIdx === 0;
                    const isHarianBanner = rowText.includes('HARIAN');
                    const isMingguanBanner = rowText.includes('MINGGUAN');
                    const isEmptyRow = row.every((c) => !String(c || '').trim());
                    const mingguanBannerIdx = result.filledTemplate.findIndex((r) => 
                      r.join(' ').toUpperCase().includes('MINGGUAN')
                    );
                    const isMingguanSection = mingguanBannerIdx !== -1 && rIdx > mingguanBannerIdx;

                    // Merged Title Row
                    if (isTitle) {
                      const titleText = row[0] || `JADWAL PETUGAS PERIODE ${datePreview['{tglperd}']}`;
                      return (
                        <tr key={`res-row-${rIdx}`} className="border-b-2 border-[#1E1E1E]">
                          <td
                            colSpan={6}
                            className="p-3 text-center font-black text-sm sm:text-base bg-[#EAE8E0] text-[#1E1E1E] tracking-wider border-b-2 border-[#1E1E1E]"
                          >
                            {titleText}
                          </td>
                        </tr>
                      );
                    }

                    // Merged HARIAN Banner
                    if (isHarianBanner) {
                      return (
                        <tr key={`res-row-${rIdx}`} className="border-b-2 border-[#1E1E1E]">
                          <td className="p-2 border-r-2 border-b border-[#1E1E1E] bg-[#F5F3EC] text-center font-bold text-[#1E1E1E]">
                            ·
                          </td>
                          <td
                            colSpan={5}
                            className="p-2 text-center font-black text-xs sm:text-sm bg-[#E3EBDD] text-[#1E1E1E] tracking-widest border-b border-[#1E1E1E]"
                          >
                            MISA HARIAN
                          </td>
                        </tr>
                      );
                    }

                    // Merged MINGGUAN Banner
                    if (isMingguanBanner) {
                      return (
                        <tr key={`res-row-${rIdx}`} className="border-b-2 border-[#1E1E1E]">
                          <td className="p-2 border-r-2 border-b border-[#1E1E1E] bg-[#F5F3EC] text-center font-bold text-[#1E1E1E]">
                            ·
                          </td>
                          <td
                            colSpan={5}
                            className="p-2 text-center font-black text-xs sm:text-sm bg-[#DCE6F2] text-[#1E1E1E] tracking-widest border-b border-[#1E1E1E]"
                          >
                            MISA MINGGUAN
                          </td>
                        </tr>
                      );
                    }

                    // Empty row separator
                    if (isEmptyRow) {
                      return (
                        <tr key={`res-row-${rIdx}`} className="h-2 bg-[#F6F5F1]">
                          <td colSpan={6} className="p-0 border-b border-[#E0DCD0]" />
                        </tr>
                      );
                    }

                    // General Rows (TANGGAL, HARI, JAM, PJ, ANGGOTA)
                    const rowLabel = row[0] ? String(row[0]).trim().toUpperCase() : '';
                    const isPjRow = rowLabel === 'PJ';
                    const isAnggotaRow = rowLabel === 'ANGGOTA';

                    // Special Merged Sunday Columns for HARI & TANGGAL in MINGGUAN
                    // Col 1 is Saturday (17:00), Col 2 is Sunday spanning 06:00, 08:00, 16:30, 18:30 all the way to 18:30!
                    if (isMingguanSection && (rowLabel === 'HARI' || rowLabel === 'TANGGAL')) {
                      return (
                        <tr key={`res-row-${rIdx}`} className="border-b border-[#E0DCD0]">
                          {/* Column 0: Label */}
                          <td className="p-2.5 border-r-2 border-[#1E1E1E] bg-[#F5F3EC] font-black text-xs sm:text-sm text-center text-[#1E1E1E] w-24 sm:w-28 shrink-0">
                            {rowLabel || '·'}
                          </td>

                          {/* Column 1: Saturday (colSpan 1) - matches Sunday color */}
                          <td className="p-2.5 border-r border-[#E0DCD0] text-center text-xs sm:text-sm font-bold text-[#1E1E1E] bg-[#FAF9F5]">
                            {row[1] || '·'}
                          </td>

                          {/* Column 2: Sunday merged across all 4 remaining Sunday masses (colSpan 4) */}
                          <td
                            colSpan={4}
                            className="p-2.5 border-r border-[#E0DCD0] text-center text-xs sm:text-sm font-bold text-[#1E1E1E] bg-[#FAF9F5]"
                          >
                            {row[2] || '·'}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={`res-row-${rIdx}`} className="border-b border-[#E0DCD0]">
                        {/* Column 0: Label */}
                        <td className="p-2.5 border-r-2 border-[#1E1E1E] bg-[#F5F3EC] font-black text-xs sm:text-sm text-center text-[#1E1E1E] w-24 sm:w-28 shrink-0">
                          {rowLabel || '·'}
                        </td>

                        {/* Columns 1 to 5: Mass slot cells with strictly locked fixed width */}
                        {row.slice(1, 6).map((val, cOffset) => {
                          const colIdx = cOffset + 1;
                          const cellVal = String(val || '').trim();
                          const isAssignedPerson = isPjRow || isAnggotaRow;
                          const assignedMember = isAssignedPerson
                            ? result.assignedMembers[`${rIdx}_${colIdx}`]
                            : null;
                          const isLiveMassColumn = isSlotLiveMass(
                            isMingguanSection ? 'MINGGUAN' : 'HARIAN',
                            colIdx,
                            sheetsData?.TEMPLATES
                          );

                          // 1. Day & Date rows (HARI & TANGGAL)
                          if (rowLabel === 'HARI' || rowLabel === 'TANGGAL') {
                            if (isLiveMassColumn) {
                              return (
                                <td
                                  key={`res-cell-${colIdx}`}
                                  className="p-2.5 border-r border-[#E0DCD0] text-center overflow-hidden text-xs sm:text-sm font-black text-[#1E1E1E] bg-[#FEF08A]"
                                >
                                  {rowLabel === 'HARI' ? (
                                    <span className="inline-flex items-center justify-center gap-1.5">
                                      <span>{cellVal || (isMingguanSection ? (colIdx === 1 ? 'SABTU' : 'MINGGU') : (colIdx === 1 ? 'SENIN' : 'JUMAT'))}</span>
                                      <span className="text-[9px] bg-[#EAB308] text-white px-1 py-0.5 rounded-xs font-black tracking-wider uppercase shadow-[1px_1px_0px_0px_#1E1E1E]">
                                        LIVE
                                      </span>
                                    </span>
                                  ) : (
                                    cellVal || '·'
                                  )}
                                </td>
                              );
                            }

                            // All other days/dates match the Minggu color (#FAF9F5)!
                            return (
                              <td
                                key={`res-cell-${colIdx}`}
                                className={`p-2.5 border-r border-[#E0DCD0] text-center overflow-hidden text-xs sm:text-sm bg-[#FAF9F5] ${
                                  cellVal
                                    ? 'font-bold text-[#1E1E1E]'
                                    : 'font-semibold text-neutral-300'
                                }`}
                              >
                                {cellVal || '·'}
                              </td>
                            );
                          }

                          // 2. Time rows (PUKUL / JAM)
                          if (rowLabel === 'PUKUL' || rowLabel === 'JAM') {
                            return (
                              <td
                                key={`res-cell-${colIdx}`}
                                className={`p-2.5 border-r border-[#E0DCD0] text-center overflow-hidden text-xs sm:text-sm font-bold ${
                                  isLiveMassColumn
                                    ? 'bg-[#FEF9C3] text-[#1E1E1E]'
                                    : cellVal
                                    ? 'text-[#1E1E1E]'
                                    : 'text-neutral-300'
                                }`}
                              >
                                {cellVal || '·'}
                              </td>
                            );
                          }

                          // 3. Member rows (PJ / ANGGOTA)
                          return (
                            <td
                              key={`res-cell-${colIdx}`}
                              className={`p-2.5 border-r border-[#E0DCD0] text-center overflow-hidden ${
                                isLiveMassColumn
                                  ? 'bg-[#FFFBEB] font-bold'
                                  : isAssignedPerson
                                  ? 'bg-white font-bold'
                                  : 'text-xs sm:text-sm font-semibold text-[#1E1E1E]'
                              }`}
                            >
                              {isAssignedPerson && cellVal ? (
                                <button
                                  type="button"
                                  onClick={() => handleIndividualReshuffle(rIdx, colIdx)}
                                  title={`Klik untuk acak/ganti ${cellVal} (Individual Reshuffle)`}
                                  className={`w-full text-center px-1.5 py-1.5 border transition-all cursor-pointer font-black text-xs sm:text-sm truncate select-none active:scale-95 ${
                                    swappedCell === `${rIdx}_${colIdx}`
                                      ? 'ring-2 ring-[#1E1E1E] scale-105 transition-transform'
                                      : ''
                                  } ${
                                    isLiveMassColumn
                                      ? isPjRow
                                        ? 'bg-[#FEF08A]/85 hover:bg-[#FEF08A] border-[#D97706] text-[#1E1E1E]'
                                        : 'bg-[#FEF9C3] hover:bg-[#FEF08A]/75 border-[#EAB308] text-[#1E1E1E]'
                                      : isPjRow
                                      ? 'bg-[#E3EBDD]/70 hover:bg-[#E3EBDD] border-[#88B87B] text-[#1E1E1E]'
                                      : 'bg-[#DCE6F2]/70 hover:bg-[#DCE6F2] border-[#7F9EBF] text-[#1E1E1E]'
                                  }`}
                                >
                                  {/* Clean name display with fade out / fade in animation on generate and reshuffle */}
                                  <motion.span 
                                    key={`name-${shuffleKey}-${rIdx}-${colIdx}-${cellVal}`}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: isShuffling ? 0 : 1, scale: isShuffling ? 0.95 : 1 }}
                                    transition={{ duration: 0.22, ease: 'easeOut' }}
                                    className="inline-block font-black text-xs sm:text-sm truncate max-w-full"
                                  >
                                    {cellVal}
                                  </motion.span>
                                </button>
                              ) : (
                                <span className={cellVal ? 'text-[#1E1E1E]' : 'text-[#B5B3A8]'}>
                                  {cellVal || '·'}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

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

      {/* MEMBER DETAIL MODAL */}
      <AnimatePresence>
        {selectedMemberModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-[#F6F5F1] border-3 border-[#1E1E1E] p-6 shadow-[8px_8px_0px_0px_#1E1E1E] flex flex-col gap-4"
            >
              <div className="flex items-center justify-between border-b-2 border-[#1E1E1E] pb-3">
                <h3 className="font-black text-lg uppercase text-[#1E1E1E]">
                  PROFIL PETUGAS
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedMemberModal(null)}
                  className="w-7 h-7 bg-[#1E1E1E] text-white flex items-center justify-center hover:bg-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
                <div className="flex justify-between py-1 border-b border-[#E0DCD0]">
                  <span className="font-bold text-[#666]">NAMA</span>
                  <span className="font-black text-[#1E1E1E]">{selectedMemberModal.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0DCD0]">
                  <span className="font-bold text-[#666]">POSISI</span>
                  <span className="font-black text-[#1E1E1E]">{selectedMemberModal.posisi}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0DCD0]">
                  <span className="font-bold text-[#666]">KONDISI</span>
                  <span className="font-black text-[#1E1E1E]">{selectedMemberModal.kondisi}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0DCD0]">
                  <span className="font-bold text-[#666]">STATUS</span>
                  <span className="font-black text-[#1E1E1E]">{selectedMemberModal.status}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0DCD0]">
                  <span className="font-bold text-[#666]">EXPERTISE</span>
                  <span className="font-black text-[#1E1E1E]">{selectedMemberModal.expertise}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMemberModal(null)}
                className="w-full bg-[#1E1E1E] text-white font-bold py-2 text-xs uppercase shadow-[2px_2px_0px_0px_#1E1E1E] cursor-pointer"
              >
                TUTUP
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AUDIT LOG MODAL (Accessible from top right button after schedule is generated) */}
      <AnimatePresence>
        {showAuditModal && result && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl max-h-[85vh] bg-[#F6F5F1] border-3 border-[#1E1E1E] p-6 shadow-[8px_8px_0px_0px_#1E1E1E] flex flex-col gap-4 overflow-hidden"
            >
              <div className="flex items-center justify-between border-b-2 border-[#1E1E1E] pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-[#1E1E1E]" />
                  <h3 className="font-black text-base sm:text-lg uppercase text-[#1E1E1E]">
                    LOG AUDIT & VERIFIKASI ATURAN
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="w-7 h-7 bg-[#1E1E1E] text-white flex items-center justify-center hover:bg-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2 font-mono text-xs overflow-y-auto max-h-[60vh] bg-white p-4 border-2 border-[#1E1E1E]">
                {result.auditLogs.map((log, lIdx) => (
                  <div 
                    key={`log-modal-${lIdx}`} 
                    className={`leading-relaxed ${
                      log.startsWith('✓')
                        ? 'text-[#2E5E28] font-bold'
                        : log.startsWith('✗')
                        ? 'text-[#C93B2B] font-bold'
                        : 'text-[#444]'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="px-5 py-2 bg-[#1E1E1E] text-white font-bold text-xs uppercase shadow-[2px_2px_0px_0px_#1E1E1E] cursor-pointer"
                >
                  TUTUP
                </button>
              </div>
            </motion.div>
          </div>
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
