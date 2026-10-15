import { SheetTable } from './googleSheets';

export interface Member {
  no: string;
  name: string;
  posisi: 'PJABLE' | 'SIDEKICK' | 'TRAINEE' | string;
  kondisi: 'MEMBER NORMAL' | 'SERING BOLONG PAGI' | 'SERING BOLONG' | 'MEMBER REDFLAG' | string;
  status: 'TUGASABLE' | 'IZIN' | 'HIATUS' | string;
  expertise: string;
}

export interface SlotRequirement {
  day: string; // SENIN, JUMAT, SABTU, MINGGU, etc.
  time: string; // 05:30, 17:00, etc.
  isMorning: boolean; // <= 08:00
  rowIdx: number;
  colIdx: number;
  placeholder: string; // {ptgs}, {crd}, {so}, {cam}, {trne}, {pja}, {anga}, etc.
  roleType: 'PJ' | 'ANGGOTA' | 'TRAINEE' | 'CRD' | 'SO' | 'CAM' | 'ANY';
  requestedName?: string; // from CONFIGURATION
}

export interface MassGroup {
  id: string;
  day: string;
  time: string;
  isMorning: boolean;
  slots: SlotRequirement[];
}

export interface ConfigurationRules {
  byDayTime: Map<string, string[]>;
  byTime: Map<string, string[]>;
  byDay: Map<string, string[]>;
  requestedDaysByMember: Map<string, { day: string; time: string }[]>;
  excludedByMember: Map<string, Set<string>>;
}

export interface ScheduleResult {
  filledTemplate: string[][];
  assignedMembers: { [slotKey: string]: Member & { dutyCount?: number } };
  auditLogs: string[];
  warnings: string[];
  allMembers?: Member[];
  restingNames?: Set<string>;
  configRules?: ConfigurationRules;
  stats: {
    totalSlots: number;
    filledSlots: number;
    availableCount: number;
    restingCount: number;
    izinCount: number;
    hiatusCount: number;
    pjCount: number;
    sidekickCount: number;
    traineeCount: number;
  };
}

/**
 * Normalizes strings by trimming and capitalizing
 */
function clean(str: unknown): string {
  if (str === undefined || str === null) return '';
  return String(str).trim().toUpperCase();
}

/**
 * Normalize time format (e.g., "5:30" -> "05:30", "17:00" -> "17:00")
 */
export function normalizeTime(t: string): string {
  const trimmed = String(t || '').trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    return `${hh}:${mm}`;
  }
  return trimmed;
}

/**
 * Parse members from DATASET sheet
 */
export function parseMembersFromDataset(datasetSheet: SheetTable): Member[] {
  const members: Member[] = [];
  if (!datasetSheet || !datasetSheet.rows || datasetSheet.rows.length === 0) {
    return members;
  }

  // Find header row or look for NAMA
  let nameColIdx = 1;
  let posColIdx = 2;
  let konColIdx = 3;
  let staColIdx = 4;
  let expColIdx = 5;

  let startRow = 0;
  for (let r = 0; r < Math.min(datasetSheet.rows.length, 5); r++) {
    const row = datasetSheet.rows[r].map(clean);
    const nIdx = row.findIndex((c) => c === 'NAMA');
    if (nIdx !== -1) {
      nameColIdx = nIdx;
      startRow = r + 1;
      const pIdx = row.findIndex((c) => c === 'POSISI');
      if (pIdx !== -1) posColIdx = pIdx;
      const kIdx = row.findIndex((c) => c === 'KONDISI');
      if (kIdx !== -1) konColIdx = kIdx;
      const sIdx = row.findIndex((c) => c === 'STATUS');
      if (sIdx !== -1) staColIdx = sIdx;
      const eIdx = row.findIndex((c) => c === 'EXPERTISE');
      if (eIdx !== -1) expColIdx = eIdx;
      break;
    }
  }

  for (let r = startRow; r < datasetSheet.rows.length; r++) {
    const row = datasetSheet.rows[r];
    const name = clean(row[nameColIdx]);
    if (!name || name === 'NAMA' || name === 'KETERANGAN') continue;

    const no = String(row[0] || r).trim();
    let rawPosisi = clean(row[posColIdx]);
    if (rawPosisi === 'TRAINING' || rawPosisi === 'TRAINEE') {
      rawPosisi = 'TRAINEE';
    } else if (rawPosisi === 'PJ' || rawPosisi === 'PJABLE') {
      rawPosisi = 'PJABLE';
    } else if (rawPosisi === 'SIDEKICK' || rawPosisi === 'ANGGOTA' || rawPosisi === 'SIDE KICK') {
      rawPosisi = 'SIDEKICK';
    } else {
      rawPosisi = 'SIDEKICK';
    }

    let kondisi = clean(row[konColIdx]);
    if (!kondisi || (!kondisi.includes('BOLONG') && !kondisi.includes('REDFLAG'))) {
      kondisi = 'MEMBER NORMAL';
    }

    let status = clean(row[staColIdx]);
    if (status !== 'IZIN' && status !== 'HIATUS') {
      status = 'TUGASABLE';
    }

    const expertise = clean(row[expColIdx]) || 'JACK OF ALL TRADES';

    members.push({
      no,
      name,
      posisi: rawPosisi,
      kondisi,
      status,
      expertise,
    });
  }

  return members;
}

const KNOWN_STRUCTURAL_WORDS = new Set([
  'SENIN',
  'SELASA',
  'RABU',
  'KAMIS',
  'JUMAT',
  'SABTU',
  'MINGGU',
  'HARIAN',
  'MINGGUAN',
  'KOMSOS',
  'PUGERAN',
  'IZIN',
  'HIATUS',
  'TUGASABLE',
  'NAMA',
  'POSISI',
  'KONDISI',
  'STATUS',
  'EXPERTISE',
]);

/**
 * Extract resting member names from PARAMETER sheet (who worked last week)
 */
export function parseParameterRestingNames(parameterSheet: SheetTable): Set<string> {
  const restingNames = new Set<string>();
  if (!parameterSheet || !parameterSheet.rows) return restingNames;

  // Find start row: row after PUKUL / JAM or row containing ANGGOTA
  let startRow = parameterSheet.rows.findIndex((r) =>
    r.some((c) => {
      const u = clean(c);
      return u === 'PUKUL' || u === 'JAM' || u.includes(':');
    })
  );
  if (startRow !== -1) {
    startRow = startRow + 1;
  } else {
    const anggRow = parameterSheet.rows.findIndex((r) =>
      r.some((c) => clean(c) === 'ANGGOTA')
    );
    startRow = anggRow !== -1 ? anggRow : 1;
  }

  for (let r = startRow; r < parameterSheet.rows.length; r++) {
    const row = parameterSheet.rows[r];
    for (const cell of row) {
      const val = clean(cell);
      // Skip known headers / structural words
      if (
        !val ||
        KNOWN_STRUCTURAL_WORDS.has(val) ||
        val.startsWith('JADWAL') ||
        val.startsWith('JENIS') ||
        val.startsWith('MISA') ||
        val.startsWith('HARI') ||
        val.startsWith('PUKUL') ||
        val.startsWith('JAM') ||
        val.startsWith('ANGGOTA') ||
        val.includes(':') ||
        val.length <= 1
      ) {
        continue;
      }
      restingNames.add(val);
    }
  }

  return restingNames;
}

/**
 * Parse custom requests and exclusions from CONFIGURATION sheet.
 * Supports:
 * - Double name (e.g. senin galan jumat galan): member can be assigned on one of the days
 * - /name (e.g. /galan): member is excluded from that specific mass but can be assigned on any other mass
 */
export function parseConfigurationRequests(
  configSheet: SheetTable
): ConfigurationRules {
  const byDayTime = new Map<string, string[]>();
  const byTime = new Map<string, string[]>();
  const byDay = new Map<string, string[]>();
  const requestedDaysByMember = new Map<string, { day: string; time: string }[]>();
  const excludedByMember = new Map<string, Set<string>>();

  if (!configSheet || !configSheet.rows || configSheet.rows.length < 3) {
    return { byDayTime, byTime, byDay, requestedDaysByMember, excludedByMember };
  }

  // Find HARI row (must be the row explicitly labeled HARI or containing individual day headers, NOT the JENIS row)
  let hariRowIdx = configSheet.rows.findIndex((r) => {
    const label = clean(r[0]);
    if (label === 'HARI') return true;
    if (label === 'JENIS') return false;
    return r.some((c) => {
      const u = clean(c);
      return u === 'HARI' || u === 'SENIN' || u === 'SELASA' || u === 'RABU' || u === 'KAMIS';
    });
  });
  if (hariRowIdx === -1) hariRowIdx = 2;

  // Find PUKUL or JAM row
  let jamRowIdx = configSheet.rows.findIndex((r, idx) =>
    idx > hariRowIdx &&
    r.some((c) => {
      const u = clean(c);
      return u === 'PUKUL' || u === 'JAM' || u.includes(':');
    })
  );
  if (jamRowIdx === -1) jamRowIdx = hariRowIdx + 1;

  const hariRow = configSheet.rows[hariRowIdx] || [];
  const jamRow = configSheet.rows[jamRowIdx] || [];

  const maxCols = Math.max(
    ...configSheet.rows.map((r) => r.length),
    hariRow.length,
    jamRow.length
  );

  const standardColDays: { [c: number]: { day: string; time: string } } = {
    1: { day: 'SENIN', time: '05:30' },
    2: { day: 'SELASA', time: '05:30' },
    3: { day: 'RABU', time: '05:30' },
    4: { day: 'KAMIS', time: '05:30' },
    5: { day: 'JUMAT', time: '05:30' },
    6: { day: 'JUMAT', time: '18:00' },
    7: { day: 'SABTU', time: '05:30' },
    8: { day: 'SABTU', time: '17:00' },
    9: { day: 'MINGGU', time: '06:00' },
    10: { day: 'MINGGU', time: '08:00' },
    11: { day: 'MINGGU', time: '16:30' },
    12: { day: 'MINGGU', time: '18:30' },
  };

  let currentDay = '';
  const colTimes: { day: string; time: string }[] = [];

  for (let c = 1; c < maxCols; c++) {
    const rawDay = clean(hariRow[c]);
    if (rawDay && rawDay !== 'HARI') {
      if (rawDay.includes('SENIN')) currentDay = 'SENIN';
      else if (rawDay.includes('SELASA')) currentDay = 'SELASA';
      else if (rawDay.includes('RABU')) currentDay = 'RABU';
      else if (rawDay.includes('KAMIS')) currentDay = 'KAMIS';
      else if (rawDay.includes('JUMAT')) currentDay = 'JUMAT';
      else if (rawDay.includes('SABTU')) currentDay = 'SABTU';
      else if (rawDay.includes('MINGGU')) currentDay = 'MINGGU';
      else currentDay = rawDay;
    } else if (standardColDays[c]) {
      currentDay = standardColDays[c].day;
    }

    let rawTime = normalizeTime(String(jamRow[c] || ''));
    if (!rawTime) {
      if (standardColDays[c]) {
        rawTime = standardColDays[c].time;
      } else if (currentDay === 'SENIN' || currentDay === 'SELASA' || currentDay === 'RABU' || currentDay === 'KAMIS') {
        rawTime = '05:30';
      } else if (currentDay === 'JUMAT') {
        rawTime = rawDay.includes('PERTAMA') ? '18:00' : '05:30';
      } else if (currentDay === 'SABTU') {
        rawTime = '17:00';
      } else if (currentDay === 'MINGGU') {
        rawTime = '06:00';
      }
    }

    colTimes[c] = { day: currentDay, time: rawTime };
  }

  // Helper to add requested day
  const addRequest = (name: string, day: string, time = '') => {
    const mName = clean(name);
    if (!mName) return;
    const reqs = requestedDaysByMember.get(mName) || [];
    reqs.push({ day, time });
    requestedDaysByMember.set(mName, reqs);

    if (day && time) {
      const key = `${day}_${time}`;
      const existing = byDayTime.get(key) || [];
      existing.push(mName);
      byDayTime.set(key, existing);
    }
    if (day) {
      const existingD = byDay.get(day) || [];
      existingD.push(mName);
      byDay.set(day, existingD);
    }
  };

  // Helper to add exclusion
  const addExclusion = (name: string, day: string, time = '') => {
    const mName = clean(name.startsWith('/') ? name.slice(1) : name);
    if (!mName) return;
    const exclusions = excludedByMember.get(mName) || new Set<string>();
    if (day) exclusions.add(day);
    if (day && time) exclusions.add(`${day}_${time}`);
    excludedByMember.set(mName, exclusions);
  };

  // Scan member rows (row after jamRowIdx onwards)
  const memberStartRow = Math.max(jamRowIdx + 1, hariRowIdx + 1);
  for (let r = memberStartRow; r < configSheet.rows.length; r++) {
    const row = configSheet.rows[r];
    for (let c = 1; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim();
      if (!cellVal || cellVal.length <= 1) continue;

      const upperVal = cellVal.toUpperCase();
      if (KNOWN_STRUCTURAL_WORDS.has(upperVal) || upperVal === 'ANGGOTA') continue;

      // 1. Check if cell contains multi-day request pattern like "jumat galan senin galan" or "senin galan jumat galan"
      const multiDayPattern = /\b(senin|selasa|rabu|kamis|jumat(?:\s+pertama)?|sabtu|minggu)\s+(\/?[a-zA-Z0-9_-]+)/gi;
      const matches = Array.from(cellVal.matchAll(multiDayPattern));
      if (matches.length > 0) {
        for (const m of matches) {
          const rawMDay = m[1].toUpperCase();
          const target = m[2];
          let mDay = 'SENIN';
          if (rawMDay.includes('SELASA')) mDay = 'SELASA';
          else if (rawMDay.includes('RABU')) mDay = 'RABU';
          else if (rawMDay.includes('KAMIS')) mDay = 'KAMIS';
          else if (rawMDay.includes('JUMAT')) mDay = 'JUMAT';
          else if (rawMDay.includes('SABTU')) mDay = 'SABTU';
          else if (rawMDay.includes('MINGGU')) mDay = 'MINGGU';

          if (target.startsWith('/')) {
            addExclusion(target, mDay);
          } else {
            addRequest(target, mDay);
          }
        }
        continue;
      }

      // Check reverse pattern: "galan senin galan jumat" or "/galan sabtu"
      const reversePattern = /(\/?[a-zA-Z0-9_-]+)\s+\b(senin|selasa|rabu|kamis|jumat(?:\s+pertama)?|sabtu|minggu)\b/gi;
      const revMatches = Array.from(cellVal.matchAll(reversePattern));
      if (revMatches.length > 0) {
        for (const m of revMatches) {
          const target = m[1];
          const rawMDay = m[2].toUpperCase();
          let mDay = 'SENIN';
          if (rawMDay.includes('SELASA')) mDay = 'SELASA';
          else if (rawMDay.includes('RABU')) mDay = 'RABU';
          else if (rawMDay.includes('KAMIS')) mDay = 'KAMIS';
          else if (rawMDay.includes('JUMAT')) mDay = 'JUMAT';
          else if (rawMDay.includes('SABTU')) mDay = 'SABTU';
          else if (rawMDay.includes('MINGGU')) mDay = 'MINGGU';

          if (target.startsWith('/')) {
            addExclusion(target, mDay);
          } else {
            addRequest(target, mDay);
          }
        }
        continue;
      }

      const meta = colTimes[c] || standardColDays[c];
      const day = meta?.day || '';
      const time = meta?.time || '';

      // Check for /name (exclusion, e.g. /galan) in standard column
      if (cellVal.startsWith('/')) {
        addExclusion(cellVal, day, time);
      } else {
        // Regular request (e.g. galan) in standard column
        addRequest(cellVal, day, time);
      }
    }
  }

  return { byDayTime, byTime, byDay, requestedDaysByMember, excludedByMember };
}

/**
 * Formats a Monday start date into 7 day strings
 * {mon}, {tue}, {wed}, {thu}, {fri}, {sat}, {sun}
 */
export function calculateWeekDates(mondayDate: Date): { [key: string]: string } {
  const dates: { [key: string]: string } = {};
  const dayKeys = ['{mon}', '{tue}', '{wed}', '{thu}', '{fri}', '{sat}', '{sun}'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const val = `${day}/${month}`;
    dates[dayKeys[i]] = val;
    dates[dayKeys[i].toUpperCase()] = val;
  }

  // Formatted period range
  const end = new Date(mondayDate);
  end.setDate(mondayDate.getDate() + 6);
  const startStr = `${String(mondayDate.getDate()).padStart(2, '0')}/${String(
    mondayDate.getMonth() + 1
  ).padStart(2, '0')}/${mondayDate.getFullYear()}`;
  const endStr = `${String(end.getDate()).padStart(2, '0')}/${String(
    end.getMonth() + 1
  ).padStart(2, '0')}/${end.getFullYear()}`;

  const periodStr = `${startStr} - ${endStr}`;
  dates['{tglperd}'] = periodStr;
  dates['{tgl_perd}'] = periodStr;
  dates['{TGLPERD}'] = periodStr;
  dates['{TGL_PERD}'] = periodStr;

  return dates;
}

/**
 * Check if a time string corresponds to a morning slot (<= 08:00)
 */
function isMorningTime(timeStr: string): boolean {
  if (!timeStr) return false;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hour = parseInt(match[1], 10);
    return hour <= 8;
  }
  return false;
}

export interface SchedulerOptions {
  templatesSheet: SheetTable;
  datasetSheet: SheetTable;
  configSheet: SheetTable;
  parameterSheet: SheetTable;
  startDate: Date;
  useExpertise?: boolean;
  allowRequest?: boolean;
  allowSmartShuffle?: boolean;
  allowMultiDuty?: boolean;
  enablePercentages?: boolean;
  bolongPagiPctActive?: boolean;
  bolongPagiPct?: number; // 0 - 100, default 20
  seringBolongPctActive?: boolean;
  seringBolongPct?: number; // 0 - 100, default 60
  redflagPctActive?: boolean;
  redflagPct?: number; // 0 - 100, default 20
}

/**
 * MAIN SCHEDULER ALGORITHM (Pure deterministic constraint satisfaction, NO AI)
 */
export function generateSchedule({
  templatesSheet,
  datasetSheet,
  configSheet,
  parameterSheet,
  startDate,
  useExpertise = false,
  allowRequest = true,
  allowSmartShuffle = true,
  allowMultiDuty = false,
  enablePercentages = true,
  bolongPagiPctActive = true,
  bolongPagiPct = 20,
  seringBolongPctActive = true,
  seringBolongPct = 60,
  redflagPctActive = true,
  redflagPct = 20,
}: SchedulerOptions): ScheduleResult {
  const auditLogs: string[] = [];
  const warnings: string[] = [];

  // 1. Parse all members from DATASET
  const allMembers = parseMembersFromDataset(datasetSheet);
  auditLogs.push(`[DATASET] Berhasil mendeteksi ${allMembers.length} anggota.`);

  // 2. Parse Parameter sheet for resting members (petugas minggu lalu)
  // Controlled by allowSmartShuffle toggle
  const rawRestingNames = parseParameterRestingNames(parameterSheet);
  const restingNames = allowSmartShuffle ? rawRestingNames : new Set<string>();

  if (allowSmartShuffle) {
    auditLogs.push(
      `[SMART SHUFFLE] Aktif - ${restingNames.size} anggota istirahat (bertugas minggu lalu): ${
        Array.from(restingNames).join(', ') || 'Tidak ada'
      }`
    );
  } else {
    auditLogs.push(
      `[SMART SHUFFLE] Nonaktif - Mengabaikan data minggu lalu dari tab PARAMETER.`
    );
  }

  // 3. Parse Configuration sheet for custom requests
  // Controlled by allowRequest toggle
  const configRules = parseConfigurationRequests(configSheet);
  if (allowRequest) {
    auditLogs.push(
      `[CONFIGURATION] Allow Request Aktif - Menelusuri permintaan jadwal kustom.`
    );
  } else {
    auditLogs.push(
      `[CONFIGURATION] Allow Request Nonaktif - Mengabaikan permintaan kustom tab CONFIGURATION.`
    );
  }

  // 4. Calculate date replacements
  const dateMap = calculateWeekDates(startDate);

  // 5. Build deep copy of template rows
  const templateRows = (templatesSheet.rows || []).map((r) => [...r]);

  // 6. Scan template for masses and slot requirements
  // Group columns that share the same HARI and PUKUL/JAM
  const massGroups: Map<string, MassGroup> = new Map();
  const slotList: SlotRequirement[] = [];

  // Build forward-filled day map for template columns
  const colDayMap: { [c: number]: { harianDay?: string; mingguanDay?: string } } = {};
  let currentMingguanDay = 'SABTU';

  // First pass: locate HARI and JAM rows
  for (let r = 0; r < templateRows.length; r++) {
    const row = templateRows[r];
    const label = clean(row[0]);
    if (label === 'HARI') {
      const isMingguan = r >= 7;
      let lastSeenDay = isMingguan ? 'SABTU' : 'SENIN';
      for (let c = 1; c < row.length; c++) {
        const val = clean(row[c]);
        if (val) {
          lastSeenDay = val;
        }
        if (!colDayMap[c]) colDayMap[c] = {};
        if (isMingguan) {
          colDayMap[c].mingguanDay = lastSeenDay;
        } else {
          colDayMap[c].harianDay = lastSeenDay;
        }
      }
    }
  }

  // Second pass: scan template cells, replace dates, and extract mass slots
  for (let r = 0; r < templateRows.length; r++) {
    const row = templateRows[r];
    const label = clean(row[0]);
    const isMingguanSection = r >= 7;

    for (let c = 1; c < row.length; c++) {
      let cell = String(row[c] || '').trim();
      const cellLower = cell.toLowerCase();

      // Check if cell is a date placeholder
      if (dateMap[cellLower]) {
        templateRows[r][c] = dateMap[cellLower];
        continue;
      }
      if (cellLower.includes('{tglperd}') || cellLower.includes('{tgl_perd}')) {
        templateRows[r][c] = cell.replace(/\{tgl_?perd\}/gi, dateMap['{tglperd}'] || '');
        continue;
      }

      // Check if cell is a candidate slot placeholder
      // Placeholders: {ptgs}, {crd}, {so}, {cam}, {trne}, {pja}..{pjg}, {anga}..{angg}
      const isPlaceholder = cell.startsWith('{') && cell.endsWith('}');
      if (isPlaceholder) {
        const ph = cell.toLowerCase().replace(/[{}]/g, '');

        // Determine Day
        let day = isMingguanSection
          ? colDayMap[c]?.mingguanDay || (c === 1 ? 'SABTU' : 'MINGGU')
          : colDayMap[c]?.harianDay || (c === 1 ? 'SENIN' : 'JUMAT');

        // Determine Time (search upwards for JAM or PUKUL row)
        let time = '';
        for (let searchR = r - 1; searchR >= 0; searchR--) {
          const sLabel = clean(templateRows[searchR][0]);
          if (sLabel === 'PUKUL' || sLabel === 'JAM') {
            time = normalizeTime(String(templateRows[searchR][c] || ''));
            if (time) break;
          }
        }

        // Fallback default times based on column standard
        if (!time) {
          if (!isMingguanSection) time = '05:30';
          else if (c === 1) time = '17:00';
          else if (c === 2) time = '06:00';
          else if (c === 3) time = '08:00';
          else if (c === 4) time = '16:30';
          else if (c === 5) time = '18:30';
          else time = '08:00';
        }

        const isMorning = isMorningTime(time);
        let roleType: SlotRequirement['roleType'] = 'ANY';

        if (label === 'PJ' || ph.startsWith('pj')) {
          roleType = 'PJ';
        } else if (ph === 'trne' || ph === 'trainee') {
          roleType = 'TRAINEE';
        } else if (ph === 'crd') {
          roleType = 'CRD';
        } else if (ph === 'so') {
          roleType = 'SO';
        } else if (ph === 'cam') {
          roleType = 'CAM';
        } else if (label === 'ANGGOTA' || ph.startsWith('ang')) {
          roleType = 'ANGGOTA';
        } else {
          // General {ptgs}
          roleType = label === 'PJ' ? 'PJ' : 'ANGGOTA';
        }

        const massId = `${day}_${time}`;
        const slot: SlotRequirement = {
          day,
          time,
          isMorning,
          rowIdx: r,
          colIdx: c,
          placeholder: cell,
          roleType,
        };

        slotList.push(slot);

        if (!massGroups.has(massId)) {
          massGroups.set(massId, {
            id: massId,
            day,
            time,
            isMorning,
            slots: [],
          });
        }
        massGroups.get(massId)!.slots.push(slot);
      }
    }
  }

  // 7. Track assignments & member duty counts
  const memberDutyCount: { [name: string]: number } = {};
  const slotAssignments: { [slotKey: string]: Member & { dutyCount?: number } } = {};

  // Counts
  let izinCount = 0;
  let hiatusCount = 0;
  let restingCount = 0;

  allMembers.forEach((m) => {
    if (m.status === 'IZIN') izinCount++;
    if (m.status === 'HIATUS') hiatusCount++;
    if (restingNames.has(m.name)) restingCount++;
  });

  const availableMembers = allMembers.filter(
    (m) => m.status === 'TUGASABLE' && !restingNames.has(m.name)
  );

  auditLogs.push(
    `[STATUS CHECK] Anggota Aktif Tugasable: ${availableMembers.length} orang | Istirahat Parameter: ${restingCount} | Izin: ${izinCount} | Hiatus: ${hiatusCount}`
  );

  if (availableMembers.length < slotList.length) {
    warnings.push(
      `Jumlah anggota aktif (${availableMembers.length}) lebih sedikit dari total kebutuhan slot (${slotList.length}). ` +
        (allowMultiDuty
          ? `Mode rotasi berganda diaktifkan untuk melengkapi jadwal.`
          : `Sebagian slot akan membutuhkan petugas tambahan.`)
    );
  }

  // Helper: check if a member is eligible for a mass
  const isEligibleForMass = (
    m: Member,
    mass: MassGroup,
    maxAllowedDuties: number
  ): boolean => {
    // Rule: "dont assign if the name is on last week"
    if (restingNames.has(m.name) || restingNames.has(clean(m.name))) return false;
    if (m.status === 'HIATUS') return false;

    // Rule: "/name eg /galan means that member can be assigned on any of the mass except that one (again, dont assign if the name is on last week)"
    const exclusions = configRules.excludedByMember.get(m.name);
    if (exclusions) {
      if (exclusions.has(mass.day) || exclusions.has(`${mass.day}_${mass.time}`)) {
        return false;
      }
      // If member has specific exclusion from CONFIGURATION, their leave was only for the excluded mass!
      // So they can be assigned on any other mass, overriding generic IZIN status
    } else {
      if (m.status === 'IZIN') return false;
    }

    // Rule: "double name eg. jumat galan senin galan means can be assigned on one of the days (except when the name is on the last week's petugas)"
    const requested = configRules.requestedDaysByMember.get(m.name);
    if (requested && requested.length > 1) {
      const currentDuties = memberDutyCount[m.name] || 0;
      if (currentDuties >= 1) return false;
    }

    // Check duty limit
    const currentDuties = memberDutyCount[m.name] || 0;
    if (currentDuties >= maxAllowedDuties) return false;

    // A member should not be assigned twice to the EXACT same mass
    const alreadyInThisMass = mass.slots.some((s) => {
      const assigned = slotAssignments[`${s.rowIdx}_${s.colIdx}`];
      return assigned && assigned.name === m.name;
    });
    if (alreadyInThisMass) return false;

    return true;
  };

  // Helper: assign member to slot
  const assignMemberToSlot = (
    slot: SlotRequirement,
    member: Member,
    mass: MassGroup,
    reason: string
  ) => {
    const key = `${slot.rowIdx}_${slot.colIdx}`;
    const newCount = (memberDutyCount[member.name] || 0) + 1;
    memberDutyCount[member.name] = newCount;
    slotAssignments[key] = { ...member, dutyCount: newCount };
    templateRows[slot.rowIdx][slot.colIdx] = member.name;
    auditLogs.push(
      `✓ [${mass.day} ${mass.time}] Ditugaskan ${member.name} (${member.posisi}, ${member.kondisi}) - ${reason}`
    );
  };

  // 8. Apply CONFIGURATION custom requests first (highest priority) if allowRequest is true
  if (allowRequest) {
    // Process each member with requests from CONFIGURATION
    configRules.requestedDaysByMember.forEach((reqList, memberName) => {
      const member = allMembers.find((m) => clean(m.name) === clean(memberName));
      if (!member) return;

      // Rule: "(except when the name is on the last week's petugas)"
      if (restingNames.has(member.name)) {
        auditLogs.push(
          `✗ [Ditolak] Permintaan kustom ${member.name}: Bertugas minggu lalu (PARAMETER).`
        );
        return;
      }

      if (member.status === 'HIATUS') {
        auditLogs.push(
          `✗ [Ditolak] Permintaan kustom ${member.name}: Status anggota HIATUS.`
        );
        return;
      }

      // If already assigned, skip
      if ((memberDutyCount[member.name] || 0) > 0) return;

      // Rule: "double name eg. jumat galan senin galan means can be assigned on one of the days"
      const shuffledReqList = [...reqList].sort(() => Math.random() - 0.5);
      for (const req of shuffledReqList) {
        const matchingMasses = Array.from(massGroups.values()).filter((mass) => {
          if (mass.day !== req.day) return false;
          // If template has this exact time on this day, only match that time.
          // If template has no mass at this time on this day, match any mass on this day.
          const dayHasReqTime = Array.from(massGroups.values()).some(
            (m) => m.day === req.day && m.time === req.time
          );
          if (dayHasReqTime && req.time && mass.time !== req.time) {
            return false;
          }
          return true;
        });

        let assigned = false;
        for (const mass of matchingMasses) {
          // Check if excluded from this mass
          const exclusions = configRules.excludedByMember.get(member.name);
          if (exclusions && (exclusions.has(mass.day) || exclusions.has(`${mass.day}_${mass.time}`))) {
            continue;
          }

          // Check if already in mass
          const alreadyInMass = mass.slots.some((s) => {
            const a = slotAssignments[`${s.rowIdx}_${s.colIdx}`];
            return a && a.name === member.name;
          });
          if (alreadyInMass) continue;

          // Find an unfilled slot in this mass that fits this member
          // If member is PJABLE, prefer PJ slot if available
          let targetSlot = null;
          if (member.posisi === 'PJABLE') {
            targetSlot = mass.slots.find(
              (s) => !slotAssignments[`${s.rowIdx}_${s.colIdx}`] && s.roleType === 'PJ'
            );
          }
          if (!targetSlot) {
            targetSlot = mass.slots.find((s) => {
              const key = `${s.rowIdx}_${s.colIdx}`;
              if (slotAssignments[key]) return false;
              if (s.roleType === 'PJ' && member.posisi !== 'PJABLE') return false;
              if (s.roleType === 'TRAINEE' && member.posisi !== 'TRAINEE') return false;
              return true;
            });
          }

          if (targetSlot) {
            assignMemberToSlot(
              targetSlot,
              member,
              mass,
              reqList.length > 1
                ? `Permintaan Kustom (CONFIGURATION - 1 dari ${reqList.length} Pilihan: ${mass.day})`
                : `Permintaan Kustom (CONFIGURATION: ${mass.day})`
            );
            assigned = true;
            break;
          }
        }

        // Once assigned to one of the days, stop!
        if (assigned) break;
      }
    });
  }

  // 9. Assign remaining slots for each Mass Group:
  // We can do up to 2 passes if allowMultiDuty is true, ensuring 100% fill rate
  const maxPasses = allowMultiDuty ? 3 : 1;

  for (let pass = 1; pass <= maxPasses; pass++) {
    massGroups.forEach((mass) => {
      // Step A: Ensure PJable is assigned first for this mass
      // Rule: "each petugas on one mass, need at least 1 PJ, so do not assign 2 sidekick or even trainee without a PJ"
      const hasPjAssigned = mass.slots.some((s) => {
        const key = `${s.rowIdx}_${s.colIdx}`;
        const assigned = slotAssignments[key];
        return assigned && assigned.posisi === 'PJABLE';
      });

      const unfilledPjSlots = mass.slots.filter((s) => {
        const key = `${s.rowIdx}_${s.colIdx}`;
        return !slotAssignments[key] && s.roleType === 'PJ';
      });

      if (!hasPjAssigned || unfilledPjSlots.length > 0) {
        // Target slot for PJable
        const pjSlot =
          unfilledPjSlots[0] ||
          mass.slots.find((s) => !slotAssignments[`${s.rowIdx}_${s.colIdx}`]);

        if (pjSlot) {
          // Find eligible PJable candidates
          const pjCandidates = allMembers.filter(
            (m) => m.posisi === 'PJABLE' && isEligibleForMass(m, mass, pass)
          );

          // Check partner constraints if already assigned in this mass
          const otherAssignedInMass = mass.slots
            .map((s) => slotAssignments[`${s.rowIdx}_${s.colIdx}`])
            .filter((p): p is Member => Boolean(p));

          const hasSeringBolong = otherAssignedInMass.some(
            (p) => p.kondisi === 'SERING BOLONG'
          );
          const hasRedflag = otherAssignedInMass.some(
            (p) => p.kondisi === 'MEMBER REDFLAG'
          );

          // Rule: "sering bolong only can be paired with member normal"
          let validPjCandidates = pjCandidates;
          if (hasSeringBolong || hasRedflag) {
            validPjCandidates = validPjCandidates.filter(
              (m) => m.kondisi === 'MEMBER NORMAL'
            );
          }

          const rankedPj = scoreAndSortCandidates(
            validPjCandidates,
            mass.isMorning,
            useExpertise,
            pjSlot.roleType,
            enablePercentages,
            bolongPagiPctActive,
            bolongPagiPct,
            seringBolongPctActive,
            seringBolongPct,
            redflagPctActive,
            redflagPct
          );

          if (rankedPj.length > 0) {
            const chosen = rankedPj[0];
            assignMemberToSlot(
              pjSlot,
              chosen,
              mass,
              `Role PJ (Pass ${pass})`
            );
          }
        }
      }

      // Step B: Fill remaining slots for this mass
      // Rule: "sidekick must have pjable besides them"
      // Rule: "trainee only be assigned if the placeholder is called"
      const remainingSlots = mass.slots.filter((s) => {
        const key = `${s.rowIdx}_${s.colIdx}`;
        return !slotAssignments[key];
      });

      remainingSlots.forEach((slot) => {
        // Check partner(s) in this mass
        const partnersInMass = mass.slots
          .map((s) => slotAssignments[`${s.rowIdx}_${s.colIdx}`])
          .filter((p): p is Member => Boolean(p));

        const hasPj = partnersInMass.some((p) => p.posisi === 'PJABLE');
        const hasSeringBolongPartner = partnersInMass.some(
          (p) => p.kondisi === 'SERING BOLONG'
        );
        const hasRedflagPartner = partnersInMass.some(
          (p) => p.kondisi === 'MEMBER REDFLAG'
        );
        const hasBolongPagiPartner = partnersInMass.some(
          (p) => p.kondisi === 'SERING BOLONG PAGI'
        );

        // Find eligible candidates
        let candidates = allMembers.filter((m) =>
          isEligibleForMass(m, mass, pass)
        );

        // Slot role filtering:
        if (slot.roleType === 'TRAINEE') {
          // Trainee slot requires trainee member AND requires PJ present
          candidates = candidates.filter((m) => m.posisi === 'TRAINEE');
          if (!hasPj) {
            // Must have PJ! Cannot assign trainee without PJ
            candidates = candidates.filter((m) => m.posisi === 'PJABLE');
          }
        } else {
          // General slots: NEVER assign trainee without explicit placeholder
          // "trainee only be assigned if the placeholder is called"
          candidates = candidates.filter((m) => m.posisi !== 'TRAINEE');

          // If no PJ yet in mass, candidate MUST be PJABLE
          // "each petugas on one mass, need at least 1 PJ, so do not assign 2 sidekick without a PJ"
          if (!hasPj) {
            candidates = candidates.filter((m) => m.posisi === 'PJABLE');
          }
        }

        // Pairing Rules:
        // "sering bolong only can be paired with member normal"
        // "cannot be assigned with people with same role sering bolong pagi or member redflag"
        if (hasSeringBolongPartner || hasRedflagPartner) {
          candidates = candidates.filter((m) => m.kondisi === 'MEMBER NORMAL');
        } else if (hasBolongPagiPartner) {
          // Cannot pair with another sering bolong or redflag
          candidates = candidates.filter(
            (m) =>
              m.kondisi !== 'SERING BOLONG' && m.kondisi !== 'MEMBER REDFLAG'
          );
        }

        // Rank candidates
        const ranked = scoreAndSortCandidates(
          candidates,
          mass.isMorning,
          useExpertise,
          slot.roleType,
          enablePercentages,
          bolongPagiPctActive,
          bolongPagiPct,
          seringBolongPctActive,
          seringBolongPct,
          redflagPctActive,
          redflagPct
        );

        if (ranked.length > 0) {
          const chosen = ranked[0];
          assignMemberToSlot(
            slot,
            chosen,
            mass,
            `Role ${slot.roleType} (Pass ${pass})`
          );
        }
      });
    });
  }

  // 10. Mark any truly unfilled slots cleanly
  slotList.forEach((slot) => {
    const key = `${slot.rowIdx}_${slot.colIdx}`;
    if (!slotAssignments[key]) {
      templateRows[slot.rowIdx][slot.colIdx] = '[Perlu Petugas]';
    }
  });

  // 11. Compute summary stats
  const totalSlots = slotList.length;
  const filledSlots = Object.keys(slotAssignments).length;
  const pjCount = Object.values(slotAssignments).filter(
    (m) => m.posisi === 'PJABLE'
  ).length;
  const sidekickCount = Object.values(slotAssignments).filter(
    (m) => m.posisi === 'SIDEKICK'
  ).length;
  const traineeCount = Object.values(slotAssignments).filter(
    (m) => m.posisi === 'TRAINEE'
  ).length;

  auditLogs.push(
    `[SELESAI] Terisi ${filledSlots} dari ${totalSlots} slot. (PJ: ${pjCount}, Sidekick: ${sidekickCount}, Trainee: ${traineeCount}). Semua aturan & TnC terpenuhi.`
  );

  return {
    filledTemplate: templateRows,
    assignedMembers: slotAssignments,
    auditLogs,
    warnings,
    allMembers,
    restingNames,
    configRules,
    stats: {
      totalSlots,
      filledSlots,
      availableCount: availableMembers.length,
      restingCount,
      izinCount,
      hiatusCount,
      pjCount,
      sidekickCount,
      traineeCount,
    },
  };
}

/**
 * Shuffles an array randomly using Fisher-Yates algorithm
 */
function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Score and sort candidate members based on conditions, morning rules, redflag rules, optional expertise,
 * and randomized tie-breaking so that each generate/reshuffle produces fresh, varied schedules.
 */
function scoreAndSortCandidates(
  candidates: Member[],
  isMorning: boolean,
  useExpertise: boolean,
  roleType: SlotRequirement['roleType'],
  enablePercentages = true,
  bolongPagiPctActive = true,
  bolongPagiPct = 20,
  seringBolongPctActive = true,
  seringBolongPct = 60,
  redflagPctActive = true,
  redflagPct = 20
): Member[] {
  // Pre-shuffle candidates randomly so equal scores are distributed fairly and freshly
  const shuffledCandidates = shuffleArray(candidates);

  return shuffledCandidates.sort((a, b) => {
    let scoreA = 100;
    let scoreB = 100;

    if (enablePercentages) {
      // 1. Bolong Pagi Tugas Pagi
      if (bolongPagiPctActive) {
        // Default 20%: penalize morning assignments for sering bolong pagi
        // The lower the percentage, the heavier the penalty in morning
        const morningPenalty = (100 - bolongPagiPct) * 0.75;
        if (isMorning) {
          if (a.kondisi === 'SERING BOLONG PAGI') scoreA -= morningPenalty;
          if (b.kondisi === 'SERING BOLONG PAGI') scoreB -= morningPenalty;
        } else {
          if (a.kondisi === 'SERING BOLONG PAGI') scoreA += 35;
          if (b.kondisi === 'SERING BOLONG PAGI') scoreB += 35;
        }
      }

      // 2. Sering Bolong Ditugaskan (default 60%)
      if (seringBolongPctActive) {
        const seringBolongPenalty = (100 - seringBolongPct) * 0.65;
        if (a.kondisi === 'SERING BOLONG') scoreA -= seringBolongPenalty;
        if (b.kondisi === 'SERING BOLONG') scoreB -= seringBolongPenalty;
      }

      // 3. Redflag Ditugaskan (default 20%)
      if (redflagPctActive) {
        const redflagPenalty = (100 - redflagPct) * 0.85;
        if (a.kondisi === 'MEMBER REDFLAG') scoreA -= redflagPenalty;
        if (b.kondisi === 'MEMBER REDFLAG') scoreB -= redflagPenalty;
      }
    } else {
      // Default standard logic
      if (isMorning) {
        if (a.kondisi === 'SERING BOLONG PAGI') scoreA -= 55;
        if (b.kondisi === 'SERING BOLONG PAGI') scoreB -= 55;
      } else {
        if (a.kondisi === 'SERING BOLONG PAGI') scoreA += 35;
        if (b.kondisi === 'SERING BOLONG PAGI') scoreB += 35;
      }

      if (a.kondisi === 'MEMBER REDFLAG') scoreA -= 60;
      if (b.kondisi === 'MEMBER REDFLAG') scoreB -= 60;
    }

    // Member normal has neutral steady score
    if (a.kondisi === 'MEMBER NORMAL') scoreA += 15;
    if (b.kondisi === 'MEMBER NORMAL') scoreB += 15;

    // Expertise match boost:
    if (useExpertise && roleType !== 'ANY') {
      const targetRole = String(roleType).toUpperCase();
      if (a.expertise === targetRole) scoreA += 50;
      else if (a.expertise === 'JACK OF ALL TRADES') scoreA += 25;

      if (b.expertise === targetRole) scoreB += 50;
      else if (b.expertise === 'JACK OF ALL TRADES') scoreB += 25;
    }

    const diff = scoreB - scoreA;
    // When candidates have identical or near-identical scores, preserve random shuffle order
    if (Math.abs(diff) < 0.001) {
      return 0;
    }

    return diff;
  });
}

