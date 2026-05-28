import { config } from '../config';
import { Shop, ShopStatus } from '../types';
import { normalizeUrl, extractShopId } from '../utils/normalizeUrl';
import { SheetsClient } from './client';

const SHEET = 'shops';

export async function readShops(sheets: SheetsClient): Promise<Shop[]> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET}!A:L`,
  });

  const rows = response.data.values as string[][] | undefined;
  if (!rows || rows.length <= 1) return [];

  const result: Shop[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawUrl = row[3] ?? '';
    if (!rawUrl.trim()) continue;

    let shopUrl: string;
    let shopId: string;

    try {
      shopUrl = normalizeUrl(rawUrl);
    } catch {
      shopUrl = rawUrl.trim();
    }

    const extractedId = extractShopId(shopUrl);
    shopId = (row[0] ?? '').trim() || extractedId || `tabelog_row${i + 1}`;

    result.push({
      rowIndex: i + 1,
      shopId,
      source: row[1] ?? 'tabelog',
      shopName: row[2] ?? '',
      shopUrl,
      areaName: row[4] ?? '',
      genre: row[5] ?? '',
      currentStatus: (row[6] as ShopStatus) || '',
      isPending: (row[7] ?? '').toUpperCase() === 'TRUE',
      firstFoundAt: row[8] ?? '',
      lastCheckedAt: row[9] ?? '',
      lastPendingDetectedAt: row[10] ?? '',
      memo: row[11] ?? '',
    });
  }

  return result;
}
