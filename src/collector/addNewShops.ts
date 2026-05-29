import { config } from '../config';
import { readShops } from '../sheets/readShops';
import { SheetsClient } from '../sheets/client';
import { logger } from '../utils/logger';
import { CollectedShop } from './collectShops';

export interface AddResult {
  added: number;
  skipped: number;
  newShops: CollectedShop[];
}

export async function addNewShops(
  sheets: SheetsClient,
  collectedShops: CollectedShop[],
): Promise<AddResult> {
  const existing = await readShops(sheets);
  const existingIds = new Set(existing.map((s) => s.shopId));

  const newShops = collectedShops.filter((s) => !existingIds.has(s.shopId));

  if (newShops.length === 0) {
    return { added: 0, skipped: collectedShops.length, newShops: [] };
  }

  const rows = newShops.map((s) => [
    s.shopId,
    'tabelog',
    s.shopName,
    s.shopUrl,
    s.areaName,
    s.genre,
    '',      // current_status: 未チェック
    'FALSE', // is_pending
    '',      // first_found_at: npm run check 時に自動設定
    '',      // last_checked_at
    '',      // last_pending_detected_at
    '',      // memo
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: 'shops!A:L',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return { added: newShops.length, skipped: collectedShops.length - newShops.length, newShops };
}
