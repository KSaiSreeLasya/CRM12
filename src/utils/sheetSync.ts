export const parseCsv = (csv: string) => {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];

  const headers = [] as string[];
  // simple CSV parsing with support for quoted commas
  const parseLine = (line: string) => {
    const res: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        res.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    res.push(cur);
    return res.map((s) => s.trim());
  };

  const first = parseLine(lines[0]);
  for (const h of first) {
    headers.push(h);
  }

  const rows = [] as Record<string, string>[];
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] ?? '';
    }
    rows.push(obj);
  }

  return rows;
};

const normalizeHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

export const mapSheetRowToLead = (row: Record<string, string>) => {
  const mapped: Record<string, any> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeHeader(rawKey);
    if (key.includes('name') && (key.includes('customer') || key === 'name')) mapped['customer_name'] = value;
    else if (key.includes('phone')) mapped['customer_phone'] = value;
    else if (key.includes('email')) mapped['customer_email'] = value;
    else if (key.includes('location')) mapped['location'] = value;
    else if (key === 'id' || key.endsWith('id')) mapped['id'] = value;
    else if (key.includes('source')) mapped['source'] = value;
    else if (key.includes('assigned')) mapped['assigned_to'] = value;
    else if (key.includes('stage') || key.includes('status')) mapped['status'] = value;
    else mapped[key] = value; // extra columns preserved
  }
  return mapped;
};

export const fetchGoogleSheetLeads = async (sheetUrl: string) => {
  try {
    // Extract sheetId
    const m = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)\/edit/);
    const sheetId = m ? m[1] : null;
    if (!sheetId) throw new Error('Invalid Google Sheet URL');

    // default to first sheet gid=0
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const resp = await fetch(exportUrl);
    if (!resp.ok) throw new Error('Failed to fetch sheet CSV');
    const csv = await resp.text();
    const rows = parseCsv(csv);
    const leads = rows.map(mapSheetRowToLead);
    return leads;
  } catch (error) {
    console.error('fetchGoogleSheetLeads error:', error);
    return [];
  }
};
