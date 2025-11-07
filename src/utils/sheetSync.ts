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
  // temporary store for address parts
  let postcode: string | undefined;

  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeHeader(rawKey);
    const val = value ?? '';

    if (key.includes('name')) {
      // any name-like column becomes customer_name (full_name, customer_name, name)
      mapped['customer_name'] = mapped['customer_name'] || val;
    } else if (key.includes('phone') || key.includes('mobile')) {
      mapped['customer_phone'] = mapped['customer_phone'] || val;
    } else if (key.includes('email')) {
      mapped['customer_email'] = mapped['customer_email'] || val;
    } else if (key.includes('address') || key.includes('street') || key.includes('location') || key.includes('place') || key.includes('area') || key.includes('city')) {
      // aggregate address pieces into location
      mapped['location'] = mapped['location'] ? `${mapped['location']}, ${val}` : val;
    } else if (key.includes('post') || key.includes('pin') || key.includes('zip') || key.includes('pincode')) {
      postcode = val;
    } else if (key === 'id' || key.endsWith('_id')) {
      mapped['id'] = val;
    } else if (key.includes('source')) {
      mapped['source'] = mapped['source'] || val;
    } else if (key.includes('assigned')) {
      mapped['assigned_to'] = mapped['assigned_to'] || val;
    } else if (key.includes('stage') || key.includes('status') || key.includes('lead_status')) {
      mapped['status'] = mapped['status'] || val;
    } else {
      mapped[key] = val; // extra columns preserved
    }
  }

  if (postcode) {
    if (mapped['location']) mapped['location'] = `${mapped['location']}, ${postcode}`;
    else mapped['location'] = postcode;
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
