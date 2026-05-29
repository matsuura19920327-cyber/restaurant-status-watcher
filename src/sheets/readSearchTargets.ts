import { config } from '../config';
import { SheetsClient } from './client';

const SHEET = 'search_targets';

export interface SearchTarget {
  rowIndex: number;
  targetId: string;
  areaName: string;
  genre: string;
  searchUrl: string;
  maxPages: number;
  enabled: boolean;
}

export async function readSearchTargets(sheets: SheetsClient): Promise<SearchTarget[]> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET}!A:F`,
  });

  const rows = response.data.values as string[][] | undefined;
  if (!rows || rows.length <= 1) return [];

  const result: SearchTarget[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const searchUrl = (row[3] ?? '').trim();
    if (!searchUrl) continue;

    const enabled = (row[5] ?? 'TRUE').toUpperCase() !== 'FALSE';

    result.push({
      rowIndex: i + 1,
      targetId: row[0] ?? `target_${i}`,
      areaName: row[1] ?? '',
      genre: row[2] ?? '',
      searchUrl,
      maxPages: parseInt(row[4] ?? '3', 10) || 3,
      enabled,
    });
  }

  return result;
}
