// Parse each raw CSV into structured JSON.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const RAW_DIR = 'data-raw';
const OUT_DIR = 'src/data';

function readCsv(file) {
  const text = fs.readFileSync(path.join(RAW_DIR, file), 'utf-8');
  return parse(text, { skip_empty_lines: false, relax_column_count: true });
}

function trimCells(row) {
  return row.map((c) => (c ?? '').trim());
}

function cleanRow(row) {
  const t = trimCells(row);
  while (t.length && !t[t.length - 1]) t.pop();
  return t;
}

function nonEmpty(row) {
  return row.some((c) => c !== '');
}

function slug(s, i) {
  const base = (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base ? `${base}-${i}` : `item-${i}`;
}

// ---------- 溜娃 (play venues) ----------
// Sections: main list (numbered), 看红叶去处, 秋季农场
function parsePlay(rows) {
  const out = [];
  let section = '遛娃圣地';
  let idx = 0;
  const INSTRUCTIONAL = ['请大家推荐', '例 ', '例\u3000'];

  for (let i = 0; i < rows.length; i++) {
    const row = cleanRow(rows[i]);
    if (!nonEmpty(row)) continue;

    const [col0, col1, col2, col3] = [row[0] || '', row[1] || '', row[2] || '', row[3] || ''];

    // Column header row
    if (col0 === '' && (col1 === '车程' || col1 === '价格')) continue;

    // Instructional preamble
    if (INSTRUCTIONAL.some((p) => col0.startsWith(p))) continue;

    // Section headers: short zh-only row starting with 看/秋/春/夏/冬/农/红 etc
    const isNumbered = /^\d+[.、]/.test(col0);
    const isSectionHeader =
      !isNumbered && !col1 && !col2 && !col3 &&
      col0.length < 15 &&
      /^(看|秋|春|夏|冬|红|农|沙|海|室内|室外|水上|游泳|公园)/.test(col0);
    if (isSectionHeader) {
      section = col0.replace(/[:：]$/, '');
      continue;
    }
    // skip short non-numbered continuation labels like "Webcam"
    if (!isNumbered && !col1 && !col2 && !col3 && col0.length < 15 && !out.length) {
      continue;
    }

    if (isNumbered) {
      idx += 1;
      out.push({
        id: slug(col0, idx),
        num: parseInt(col0.match(/^(\d+)/)[1], 10),
        name: col0.replace(/^\d+[.、]\s*/, '').trim(),
        drive: col1,
        price: col2,
        tips: col3,
        section,
      });
    } else if (out.length) {
      // Continuation row — append to last entry's tips
      const last = out[out.length - 1];
      // Skip URL-only rows for tips, but treat as tips with link
      if (last.section === section) {
        const extra = row.filter(Boolean).join(' ').trim();
        if (extra) last.tips = [last.tips, extra].filter(Boolean).join(' · ');
      }
    }
  }
  return out;
}

// ---------- 医生 (doctors) ----------
function parseDoctors(rows) {
  const out = [];
  let idx = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = cleanRow(rows[i]);
    if (!nonEmpty(row)) continue;

    // Detect header row: col1 === '医生分类' or similar
    if (i === 0 && (row[1] || '').includes('医生')) continue;

    const [, category, name, address, phone, date, tag, comment] = [
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      row[4] || '',
      row[5] || '',
      row[6] || '',
      row[7] || '',
    ];

    if (name && name.length > 1) {
      idx += 1;
      out.push({
        id: slug(name, idx),
        category: category || '其他',
        name,
        address,
        phone,
        reviews: [],
      });
      if (comment || (date && tag)) {
        out[out.length - 1].reviews.push({ date, tag, text: comment });
      }
    } else if (out.length) {
      const last = out[out.length - 1];
      if (category && !last.category) last.category = category;
      if (address && !last.address) last.address = address;
      if (phone && !last.phone) last.phone = phone;
      if (comment || date || tag) {
        last.reviews.push({ date, tag, text: comment });
      }
    }
  }
  return out;
}

// ---------- 师傅 (services) ----------
function parseServices(rows) {
  const out = [];
  let idx = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = cleanRow(rows[i]);
    if (!nonEmpty(row)) continue;
    if (i === 0 && (row[1] || '').includes('类别')) continue;

    const [, category, name, phone, website, , date, comment] = [
      row[0] || '', row[1] || '', row[2] || '', row[3] || '',
      row[4] || '', row[5] || '', row[6] || '', row[7] || '',
    ];

    if (name && name.length > 1) {
      idx += 1;
      out.push({
        id: slug(name, idx),
        category: category || '其他',
        name,
        phone,
        website,
        reviews: [],
      });
      if (comment || date) {
        out[out.length - 1].reviews.push({ date, text: comment });
      }
    } else if (out.length) {
      const last = out[out.length - 1];
      if (category && !last.category) last.category = category;
      if (phone && !last.phone) last.phone = phone;
      if (website && !last.website) last.website = website;
      if (comment || date) {
        last.reviews.push({ date, text: comment });
      }
    }
  }
  return out;
}

// ---------- 课外班 (classes) ----------
function parseClasses(rows) {
  const out = [];
  let idx = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = cleanRow(rows[i]);
    if (!nonEmpty(row)) continue;
    if (i === 0) continue;
    const [category, org, location, time, price, link] = [
      row[0] || '', row[1] || '', row[2] || '', row[3] || '',
      row[4] || '', row[5] || '',
    ];
    if (!org && !location) continue;
    idx += 1;
    out.push({
      id: slug(`${category}-${org}`, idx),
      category: category || '其他',
      org,
      location,
      time,
      price,
      link,
    });
  }
  return out;
}

// ---------- 最近活动 (recent) - free-form blocks ----------
function parseRecent(rows) {
  const blocks = [];
  let current = null;
  for (const r of rows) {
    const row = cleanRow(r);
    if (!nonEmpty(row)) {
      current = null;
      continue;
    }
    const joined = row.filter(Boolean).join(' | ');
    if (!current) {
      current = { title: row[0] && !row[1] ? row[0] : '', items: [] };
      blocks.push(current);
      if (current.title) continue;
    }
    current.items.push(joined);
  }
  return blocks.filter((b) => b.items.length || b.title);
}

// ---------- 退休账户 ----------
function parseRetirement(rows) {
  return rows
    .map((r) => cleanRow(r).filter(Boolean).join(' '))
    .filter(Boolean)
    .map((text, i) => ({ id: `tip-${i + 1}`, text }));
}

// ---------- 电视电影 ----------
function parseStreaming(rows) {
  const out = [];
  for (const r of rows) {
    const row = cleanRow(r);
    if (!nonEmpty(row)) continue;
    const url = row[0];
    if (url.startsWith('http')) {
      try {
        const u = new URL(url);
        out.push({ url, domain: u.hostname.replace(/^www\./, '') });
      } catch {}
    }
  }
  return out;
}

function writeJson(name, data) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  const n = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`wrote ${file} (${n} items)`);
}

const files = fs.readdirSync(RAW_DIR);
function findBySize(size) {
  return files.find((f) => fs.statSync(path.join(RAW_DIR, f)).size === size);
}

const mapping = [
  { size: 5363, name: 'play', parser: parsePlay },
  { size: 18233, name: 'doctors', parser: parseDoctors },
  { size: 19724, name: 'services', parser: parseServices },
  { size: 2419, name: 'classes', parser: parseClasses },
  { size: 2858, name: 'recent', parser: parseRecent },
  { size: 1011, name: 'retirement', parser: parseRetirement },
  { size: 222, name: 'streaming', parser: parseStreaming },
];

for (const m of mapping) {
  const file = findBySize(m.size);
  if (!file) {
    console.warn(`missing file for ${m.name} (expected ${m.size} bytes)`);
    continue;
  }
  const rows = readCsv(file);
  writeJson(m.name, m.parser(rows));
}
