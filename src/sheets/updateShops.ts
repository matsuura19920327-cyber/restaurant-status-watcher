import { config } from '../config';
import { Shop } from '../types';
import { SheetsClient } from './client';

const SHEET = 'shops';

// Updates columns G(current_status) H(is_pending) I(first_found_at) J(last_checked_at) K(last_pending_detected_at)
export async function updateShop(sheets: SheetsClient, shop: Shop): Promise<void> {
  const row = shop.rowIndex;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET}!G${row}:K${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [
          shop.currentStatus,
          shop.isPending ? 'TRUE' : 'FALSE',
          shop.firstFoundAt,
          shop.lastCheckedAt,
          shop.lastPendingDetectedAt,
        ],
      ],
    },
  });
}
