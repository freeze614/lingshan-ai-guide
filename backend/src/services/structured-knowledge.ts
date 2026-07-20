/**
 * Structured Knowledge Base — field-level indexing for scenic spots.
 * Parses the competition dataset (22 spots × 10 fields) into searchable records.
 * Each record is a self-contained, complete field value with full context.
 */
import fs from 'fs';
import path from 'path';

// ============================================================
// Types
// ============================================================

export interface SpotRecord {
  id: string;          // LS-001
  name: string;        // 灵山大照壁
  area: string;        // 灵山胜境
  fields: {
    location: string;
    params: string;
    coreFunction: string;
    culture: string;
    description: string;
    highlights: string;
    openingInfo: string;
    notes: string;
  };
}

export interface FieldDoc {
  id: string;          // LS-011_params
  spotId: string;
  spotName: string;
  area: string;
  fieldName: string;
  fieldLabel: string;  // 中文标签如"建筑/景观参数"
  text: string;
  keywords: string[];
}

// ============================================================
// Spot names for keyword extraction
// ============================================================

const SPOT_NAMES = [
  '灵山大佛', '九龙灌浴', '灵山梵宫', '五印坛城', '祥符禅寺',
  '灵山大照壁', '菩提大道', '百子戏弥勒', '曼飞龙塔', '无尽意斋',
  '佛足坛', '五智门', '降魔浮雕', '阿育王柱', '佛教文化博览馆',
  '拈花广场', '梵天花海', '香月花街', '五灯湖', '灵山精舍',
  '五明桥', '拈花湾', '香水海', '登云道', '鹿鸣谷', '拈花堂',
];

const FIELD_LABELS: Record<string, string> = {
  location: '具体位置',
  params: '建筑/景观参数',
  coreFunction: '核心功能',
  culture: '文化内涵',
  description: '详细介绍',
  highlights: '游玩亮点',
  openingInfo: '演艺/开放信息',
  notes: '备注',
};

// ============================================================
// Parser
// ============================================================

function parseDataset(text: string): SpotRecord[] {
  const spots: SpotRecord[] = [];
  const lines = text.split('\n');

  let i = 0;

  // Skip header lines until we hit actual data (first "灵山胜境" or "拈花湾")
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '灵山胜境' || line === '拈花湾禅意小镇') {
      break;
    }
    i++;
  }

  while (i < lines.length) {
    // Read area name
    let area = lines[i]?.trim() || '';
    i++;

    // Skip blank lines
    while (i < lines.length && !lines[i]?.trim()) i++;

    // Read spot code (LS-XXX or NH-XXX)
    const code = lines[i]?.trim() || '';
    if (!/^(LS|NH)-\d+$/.test(code)) {
      // Might be next area header, skip
      if (code === '灵山胜境' || code === '拈花湾禅意小镇') {
        continue;
      }
      i++;
      continue;
    }
    i++;

    // Skip blank lines
    while (i < lines.length && !lines[i]?.trim()) i++;

    // Read spot name
    const name = lines[i]?.trim() || '';
    i++;

    // Skip blank lines
    while (i < lines.length && !lines[i]?.trim()) i++;

    // Read 8 field values (each followed by blank lines)
    const fieldValues: string[] = [];
    for (let f = 0; f < 8 && i < lines.length; f++) {
      let fieldText = '';
      // Read until blank line or next spot starts
      while (i < lines.length) {
        const fl = (lines[i] || '').trim();
        // Stop at blank line
        if (!fl) { i++; break; }
        // Stop if we hit the next spot (area name + code pattern)
        if ((fl === '灵山胜境' || fl === '拈花湾禅意小镇') && fieldText) break;
        if (/^(LS|NH)-\d+$/.test(fl) && fieldText) break;
        // Stop if string gets too long (safety valve)
        if (fieldText.length > 5000) { i++; break; }
        // Append to field
        fieldText = fieldText ? fieldText + '\n' + fl : fl;
        i++;
      }
      if (fieldText) fieldValues.push(fieldText);
    }

    // Ensure we have at least 8 fields
    while (fieldValues.length < 8) fieldValues.push('');

    spots.push({
      id: code,
      name,
      area,
      fields: {
        location: fieldValues[0] || '',
        params: fieldValues[1] || '',
        coreFunction: fieldValues[2] || '',
        culture: fieldValues[3] || '',
        description: fieldValues[4] || '',
        highlights: fieldValues[5] || '',
        openingInfo: fieldValues[6] || '',
        notes: fieldValues[7] || '',
      },
    });

    // Skip any remaining blank lines
    while (i < lines.length && !lines[i]?.trim()) i++;
  }

  return spots;
}

// ============================================================
// Index Builder
// ============================================================

function extractKeywords(text: string): string[] {
  return SPOT_NAMES.filter(n => text.includes(n));
}

export function buildFieldIndex(spots: SpotRecord[]): FieldDoc[] {
  const docs: FieldDoc[] = [];

  for (const spot of spots) {
    const fieldEntries: Array<[string, string, string]> = [
      ['location', '具体位置', spot.fields.location],
      ['params', '建筑/景观参数', spot.fields.params],
      ['coreFunction', '核心功能', spot.fields.coreFunction],
      ['culture', '文化内涵', spot.fields.culture],
      ['description', '详细介绍', spot.fields.description],
      ['highlights', '游玩亮点', spot.fields.highlights],
      ['openingInfo', '演艺/开放信息', spot.fields.openingInfo],
      ['notes', '备注', spot.fields.notes],
    ];

    for (const [key, label, value] of fieldEntries) {
      if (!value || value.length < 5) continue;
      docs.push({
        id: `${spot.id}_${key}`,
        spotId: spot.id,
        spotName: spot.name,
        area: spot.area,
        fieldName: key,
        fieldLabel: label,
        text: value,
        keywords: extractKeywords(value),
      });
    }
  }

  return docs;
}

// ============================================================
// Two-Level Search
// ============================================================

/**
 * Match query against spot names. Returns scored spot matches.
 */
function matchSpots(query: string): Array<{ spotName: string; score: number }> {
  const results: Array<{ spotName: string; score: number }> = [];

  for (const name of SPOT_NAMES) {
    let score = 0;
    // Exact match
    if (query.includes(name)) score += 100;
    // Partial: longest common substring
    let maxSub = 0;
    for (let i = 0; i < name.length; i++) {
      for (let j = i + 2; j <= name.length; j++) {
        if (query.includes(name.slice(i, j))) {
          maxSub = Math.max(maxSub, j - i);
        }
      }
    }
    score += maxSub * 10;
    if (score > 0) results.push({ spotName: name, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Match query against field labels. Returns scored field matches.
 */
function matchFields(query: string): Array<{ fieldName: string; fieldLabel: string; score: number }> {
  const fieldHints: Record<string, string[]> = {
    params: ['高', '多高', '高度', '米', '重量', '吨', '面积', '平方米', '尺寸', '长', '宽', '参数', '大'],
    location: ['在哪', '位置', '哪里', '怎么走', '位于'],
    culture: ['文化', '意义', '象征', '内涵', '佛教', '代表', '历史', '唐代', '北宋'],
    description: ['介绍', '描述', '什么', '是什么', '详细'],
    highlights: ['亮点', '好玩', '好看', '特色', '打卡', '拍照', '不容错过'],
    openingInfo: ['时间', '几点', '开放', '表演', '演出', '票价', '门票', '免费', '收费', '场次'],
    coreFunction: ['功能', '作用', '用途'],
    notes: ['注意', '备注', '提示'],
  };

  const results: Array<{ fieldName: string; fieldLabel: string; score: number }> = [
    { fieldName: 'description', fieldLabel: '详细介绍', score: 1 }, // default fallback
  ];

  for (const [fieldName, keywords] of Object.entries(fieldHints)) {
    let score = 0;
    for (const kw of keywords) {
      if (query.includes(kw)) score += 5;
    }
    if (score > 0 || fieldName === 'description') {
      results.push({
        fieldName,
        fieldLabel: FIELD_LABELS[fieldName] || fieldName,
        score: fieldName === 'description' ? Math.max(score, 1) : score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export interface SearchResult {
  spotName: string;
  spotId: string;
  area: string;
  fieldLabel: string;
  fieldName: string;
  text: string;
  score: number;
}

/**
 * Two-level search: spot → field.
 */
export function searchStructured(query: string, topK: number = 5): SearchResult[] {
  const spotMatches = matchSpots(query);
  const fieldMatches = matchFields(query);

  if (spotMatches.length === 0) return [];

  const results: SearchResult[] = [];

  // Take top 3 spot matches, combine with top 3 field matches
  const topSpots = spotMatches.slice(0, 3);
  const topFields = fieldMatches.filter(f => f.score > 0).slice(0, 4);

  // Try to get the actual index
  const index = getFieldIndex();

  for (const spotMatch of topSpots) {
    for (const fieldMatch of topFields) {
      // Look up the actual field document
      const doc = index.find(
        d => d.spotName === spotMatch.spotName && d.fieldName === fieldMatch.fieldName
      );
      if (doc) {
        results.push({
          spotName: doc.spotName,
          spotId: doc.spotId,
          area: doc.area,
          fieldLabel: doc.fieldLabel,
          fieldName: doc.fieldName,
          text: doc.text,
          score: spotMatch.score + fieldMatch.score,
        });
      }
    }
  }

  // Deduplicate by spot+field
  const seen = new Set<string>();
  const unique = results.filter(r => {
    const key = `${r.spotId}_${r.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => b.score - a.score);
  return unique.slice(0, topK);
}

// ============================================================
// Singleton Index
// ============================================================

let _index: FieldDoc[] | null = null;
let _spots: SpotRecord[] | null = null;

export function getFieldIndex(): FieldDoc[] {
  if (_index) return _index;
  try {
    const dataDir = path.resolve(__dirname, '../../../data/raw');
    let text = '';
    const datasetPath = path.join(dataDir, 'knowledge_dataset.txt');
    if (fs.existsSync(datasetPath)) {
      text = fs.readFileSync(datasetPath, 'utf-8');
    }
    if (text) {
      _spots = parseDataset(text);
      _index = buildFieldIndex(_spots);
      console.log(`[Structured] Built field index: ${_spots.length} spots, ${_index.length} field docs`);
    } else {
      _index = [];
      _spots = [];
    }
  } catch (e: any) {
    console.error('[Structured] Failed to build index:', e.message);
    _index = [];
    _spots = [];
  }
  return _index;
}

export function getSpots(): SpotRecord[] {
  if (!_spots) getFieldIndex();
  return _spots || [];
}

export function getIndexStats() {
  const index = getFieldIndex();
  return {
    spotCount: getSpots().length,
    fieldDocCount: index.length,
  };
}
