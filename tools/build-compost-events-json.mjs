/**
 * Build compost events JSON from CSV with strict validation.
 * Usage:
 *   node tools/build-compost-events-json.mjs
 *   node tools/build-compost-events-json.mjs --in data/compost-events.csv --out data/compost-events.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_IN_CSV = path.join(ROOT, 'data', 'compost-events.csv');
const DEFAULT_OUT_JSON = path.join(ROOT, 'data', 'compost-events.json');

const REQUIRED_HEADERS = [
  'event_id',
  'text_variant_id',
  'stage',
  'severity',
  'title',
  'desc',
  'best_action',
  'secondary_action',
  'bad_action',
  'success_text',
  'fail_text',
  'enabled'
];

const ALLOWED_STAGE = new Set(['state', 'action', 'result']);
const ALLOWED_SEVERITY = new Set(['good', 'info', 'warn', 'bad']);
const ALLOWED_ACTION = new Set([
  'none',
  'turn_pile',
  'add_water',
  'ventilate',
  'cover_keepwarm',
  'break_clumps',
  'remove_contaminant',
  'vent_gas',
  'leave_as_is'
]);
const EVENT_ID_RE = /^[a-z0-9_]+$/;
const VARIANT_ID_RE = /^[a-z0-9_]+$/;

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let row = [];
  let field = '';
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.length > 1 || field.length) rows.push(row);
  return rows;
}

function normalizeRow(row) {
  return row.map((v) => (v == null ? '' : String(v).trim()));
}

function rowToObject(headers, cells) {
  const out = {};
  for (let i = 0; i < headers.length; i++) {
    out[headers[i]] = cells[i] !== undefined ? cells[i] : '';
  }
  return out;
}

function parseBool(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return true;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return null;
}

function fail(errors) {
  console.error('[build-compost-events-json] validation failed:');
  errors.forEach((e) => console.error('  - ' + e));
  process.exitCode = 1;
}

function parseArgs(argv) {
  let inCsv = DEFAULT_IN_CSV;
  let outJson = DEFAULT_OUT_JSON;
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '').trim();
    if (a === '--in') {
      inCsv = path.resolve(ROOT, String(argv[i + 1] || ''));
      i++;
      continue;
    }
    if (a === '--out') {
      outJson = path.resolve(ROOT, String(argv[i + 1] || ''));
      i++;
      continue;
    }
    fail([`unknown argument: ${a}`]);
    return null;
  }
  if (!inCsv || !outJson) {
    fail(['--in/--out requires a valid file path']);
    return null;
  }
  return { inCsv, outJson };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) return;
  const IN_CSV = parsed.inCsv;
  const OUT_JSON = parsed.outJson;
  if (!fs.existsSync(IN_CSV)) {
    console.error('[build-compost-events-json] missing input: ' + IN_CSV);
    process.exitCode = 1;
    return;
  }

  const raw = fs.readFileSync(IN_CSV, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(raw);
  if (!rows.length) {
    fail(['CSV is empty']);
    return;
  }

  const headers = normalizeRow(rows[0]);
  const duplicatedHeaders = headers.filter((h, idx) => h && headers.indexOf(h) !== idx);
  if (duplicatedHeaders.length) {
    fail(['duplicated headers: ' + Array.from(new Set(duplicatedHeaders)).join(', ')]);
    return;
  }
  const headerSet = new Set(headers);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headerSet.has(h));
  if (missingHeaders.length) {
    fail(['missing required headers: ' + missingHeaders.join(', ')]);
    return;
  }

  const errors = [];
  const events = {};
  const seenRowKeys = new Set();

  for (let i = 1; i < rows.length; i++) {
    const csvRowNumber = i + 1;
    const cells = normalizeRow(rows[i]);
    if (!cells.length || (cells.length === 1 && cells[0] === '')) continue;
    const r = rowToObject(headers, cells);
    const rowErrors = [];

    const eventId = r.event_id;
    if (!eventId) {
      errors.push(`row ${csvRowNumber}: event_id is required`);
      continue;
    }
    if (!EVENT_ID_RE.test(eventId)) {
      errors.push(`row ${csvRowNumber}: event_id "${eventId}" must match ${EVENT_ID_RE}`);
      continue;
    }
    const variantId = String(r.text_variant_id || '').trim();
    if (!variantId) {
      errors.push(`row ${csvRowNumber}: text_variant_id is required`);
      continue;
    }
    if (!VARIANT_ID_RE.test(variantId)) {
      errors.push(`row ${csvRowNumber}: text_variant_id "${variantId}" must match ${VARIANT_ID_RE}`);
      continue;
    }
    const rowKey = eventId + '::' + variantId;
    if (seenRowKeys.has(rowKey)) {
      errors.push(`row ${csvRowNumber}: duplicate (event_id,text_variant_id) "${rowKey}"`);
      continue;
    }

    const stageRaw = String(r.stage || '').trim();
    if (!stageRaw) rowErrors.push(`row ${csvRowNumber}: stage is required`);
    const stage = stageRaw.toLowerCase();
    if (!ALLOWED_STAGE.has(stage)) {
      rowErrors.push(`row ${csvRowNumber}: stage "${r.stage}" invalid (allowed: state|action|result)`);
    }
    const severityRaw = String(r.severity || '').trim();
    if (!severityRaw) rowErrors.push(`row ${csvRowNumber}: severity is required`);
    const severity = severityRaw.toLowerCase();
    if (!ALLOWED_SEVERITY.has(severity)) {
      rowErrors.push(`row ${csvRowNumber}: severity "${r.severity}" invalid (allowed: good|info|warn|bad)`);
    }

    const title = String(r.title || '').trim();
    const desc = String(r.desc || '').trim();
    if (!title) rowErrors.push(`row ${csvRowNumber}: title is required`);
    if (!desc) rowErrors.push(`row ${csvRowNumber}: desc is required`);

    const bestAction = String(r.best_action || '').trim();
    const secondaryAction = String(r.secondary_action || '').trim();
    const badAction = String(r.bad_action || '').trim();
    const actionCols = [
      ['best_action', bestAction],
      ['secondary_action', secondaryAction],
      ['bad_action', badAction]
    ];
    if (stage === 'state') {
      if (!bestAction) {
        rowErrors.push(`row ${csvRowNumber}: best_action is required for state events`);
      }
      actionCols.forEach(([k, v]) => {
        if (!v) return;
        if (!ALLOWED_ACTION.has(v)) {
          rowErrors.push(
            `row ${csvRowNumber}: ${k} "${v}" invalid (allowed: ${Array.from(ALLOWED_ACTION).join('|')})`
          );
        }
      });
    } else {
      actionCols.forEach(([k, v]) => {
        if (!v) return;
        if (!ALLOWED_ACTION.has(v)) {
          rowErrors.push(
            `row ${csvRowNumber}: ${k} "${v}" invalid (allowed: ${Array.from(ALLOWED_ACTION).join('|')})`
          );
        }
      });
    }

    const enabled = parseBool(r.enabled);
    if (enabled == null) {
      rowErrors.push(`row ${csvRowNumber}: enabled "${r.enabled}" must be true/false/1/0/yes/no or empty`);
    }

    if (rowErrors.length) {
      rowErrors.forEach((e) => errors.push(e));
      continue;
    }

    if (!events[eventId]) {
      events[eventId] = {
        event_id: eventId,
        stage,
        severity,
        best_action: bestAction,
        secondary_action: secondaryAction,
        bad_action: badAction,
        enabled,
        variants: []
      };
    } else {
      const prev = events[eventId];
      if (prev.stage !== stage) {
        rowErrors.push(`row ${csvRowNumber}: stage must be same for event_id "${eventId}"`);
      }
      if (prev.severity !== severity) {
        rowErrors.push(`row ${csvRowNumber}: severity must be same for event_id "${eventId}"`);
      }
      if (prev.best_action !== bestAction) {
        rowErrors.push(`row ${csvRowNumber}: best_action must be same for event_id "${eventId}"`);
      }
      if (prev.secondary_action !== secondaryAction) {
        rowErrors.push(`row ${csvRowNumber}: secondary_action must be same for event_id "${eventId}"`);
      }
      if (prev.bad_action !== badAction) {
        rowErrors.push(`row ${csvRowNumber}: bad_action must be same for event_id "${eventId}"`);
      }
      if (prev.enabled !== enabled) {
        rowErrors.push(`row ${csvRowNumber}: enabled must be same for event_id "${eventId}"`);
      }
    }

    if (rowErrors.length) {
      rowErrors.forEach((e) => errors.push(e));
      continue;
    }

    events[eventId].variants.push({
      text_variant_id: variantId,
      title,
      desc,
      success_text: String(r.success_text || '').trim(),
      fail_text: String(r.fail_text || '').trim()
    });
    seenRowKeys.add(rowKey);
  }

  if (errors.length) {
    fail(errors);
    return;
  }

  const sorted = {};
  Object.keys(events).sort().forEach((k) => {
    events[k].variants.sort((a, b) => a.text_variant_id.localeCompare(b.text_variant_id));
    sorted[k] = events[k];
  });

  const out = {
    schema_version: 1,
    source_csv: 'data/compost-events.csv',
    generated_at: new Date().toISOString(),
    events: sorted
  };

  const tmp = OUT_JSON + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, OUT_JSON);
  } catch (e) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    console.error('[build-compost-events-json] write failed: ' + String(e && e.message ? e.message : e));
    process.exitCode = 1;
    return;
  }
  console.log(
    '[build-compost-events-json] wrote ' +
      OUT_JSON +
      ' (' +
      Object.keys(sorted).length +
      ' events)'
  );
}

main();
