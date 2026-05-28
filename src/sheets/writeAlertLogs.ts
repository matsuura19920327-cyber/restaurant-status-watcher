import { config } from '../config';
import { AlertLogType } from '../types';
import { SheetsClient } from './client';

const SHEET = 'alert_logs';

export interface AlertLogEntry {
  alertedAt: string;
  alertType: AlertLogType;
  shopId: string;
  shopName: string;
  shopUrl: string;
  areaName: string;
  genre: string;
  slackMessage: string;
}

export async function writeAlertLog(sheets: SheetsClient, entry: AlertLogEntry): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET}!A:H`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [
        [
          entry.alertedAt,
          entry.alertType,
          entry.shopId,
          entry.shopName,
          entry.shopUrl,
          entry.areaName,
          entry.genre,
          entry.slackMessage,
        ],
      ],
    },
  });
}
