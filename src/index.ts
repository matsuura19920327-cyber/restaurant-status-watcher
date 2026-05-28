import dotenv from 'dotenv';
dotenv.config();

import { createSheetsClient, SheetsClient } from './sheets/client';
import { readShops } from './sheets/readShops';
import { updateShop } from './sheets/updateShops';
import { writeCheckLog } from './sheets/writeCheckLogs';
import { writeAlertLog } from './sheets/writeAlertLogs';
import { writeSystemLog } from './sheets/writeSystemLogs';
import { fetchTabelogPage } from './scrapers/fetchTabelogPage';
import { detectPendingStatus } from './scrapers/statusDetector';
import {
  sendSlackMessage,
  buildNewPendingMessage,
  buildContinuedPendingMessage,
  buildRecoveredMessage,
} from './alerts/slack';
import { sleep } from './utils/sleep';
import { logger } from './utils/logger';
import { nowISO } from './utils/date';
import { config } from './config';
import { Shop, ShopStatus, AlertType, CheckResult } from './types';

function determineAlertType(previous: ShopStatus | '', current: ShopStatus): AlertType {
  const isError: ShopStatus[] = ['blocked', 'timeout', 'unknown', 'parse_error'];
  if (isError.includes(current)) return 'error';
  if (previous !== 'pending' && current === 'pending') return 'new_pending';
  if (previous === 'pending' && current === 'pending') return 'continued_pending';
  if (previous === 'pending' && current === 'active') return 'recovered';
  return 'none';
}

async function sendNotifications(
  sheetsClient: SheetsClient,
  results: CheckResult[],
  now: string,
): Promise<void> {
  const newPending = results.filter((r) => r.alertType === 'new_pending');
  const continuedPending = results.filter((r) => r.alertType === 'continued_pending');
  const recovered = results.filter((r) => r.alertType === 'recovered');

  for (const result of newPending) {
    const message = buildNewPendingMessage(result);
    try {
      await sendSlackMessage(message);
      await writeAlertLog(sheetsClient, {
        alertedAt: now,
        alertType: 'new_pending',
        shopId: result.shop.shopId,
        shopName: result.shop.shopName,
        shopUrl: result.shop.shopUrl,
        areaName: result.shop.areaName,
        genre: result.shop.genre,
        slackMessage: message,
      });
      logger.info(`Slack通知送信: new_pending [${result.shop.shopId}]`);
    } catch (error) {
      logger.error(`Slack通知失敗 new_pending [${result.shop.shopId}]: ${error}`);
      try {
        await writeSystemLog(sheetsClient, 'ERROR', 'sendNotifications', 'slack_error', String(error));
      } catch {}
    }
  }

  if (continuedPending.length > 0) {
    const message = buildContinuedPendingMessage(continuedPending);
    try {
      await sendSlackMessage(message);
      await writeAlertLog(sheetsClient, {
        alertedAt: now,
        alertType: 'continued_pending_summary',
        shopId: continuedPending.map((r) => r.shop.shopId).join(','),
        shopName: `継続保留 ${continuedPending.length}件`,
        shopUrl: '',
        areaName: '',
        genre: '',
        slackMessage: message,
      });
      logger.info(`Slack通知送信: continued_pending_summary (${continuedPending.length}件)`);
    } catch (error) {
      logger.error(`Slack通知失敗 continued_pending_summary: ${error}`);
      try {
        await writeSystemLog(sheetsClient, 'ERROR', 'sendNotifications', 'slack_error', String(error));
      } catch {}
    }
  }

  for (const result of recovered) {
    const message = buildRecoveredMessage(result);
    try {
      await sendSlackMessage(message);
      await writeAlertLog(sheetsClient, {
        alertedAt: now,
        alertType: 'recovered',
        shopId: result.shop.shopId,
        shopName: result.shop.shopName,
        shopUrl: result.shop.shopUrl,
        areaName: result.shop.areaName,
        genre: result.shop.genre,
        slackMessage: message,
      });
      logger.info(`Slack通知送信: recovered [${result.shop.shopId}]`);
    } catch (error) {
      logger.error(`Slack通知失敗 recovered [${result.shop.shopId}]: ${error}`);
      try {
        await writeSystemLog(sheetsClient, 'ERROR', 'sendNotifications', 'slack_error', String(error));
      } catch {}
    }
  }
}

async function main(): Promise<void> {
  const now = nowISO();
  logger.info('=== Restaurant Status Check Start ===');

  let sheetsClient: SheetsClient;
  try {
    sheetsClient = await createSheetsClient();
    logger.info('Google Sheets 接続成功');
  } catch (error) {
    logger.error(`Google Sheets 接続失敗: ${error}`);
    try {
      await sendSlackMessage(`【システムエラー】Google Sheets接続に失敗しました\n${error}`);
    } catch {}
    process.exit(1);
  }

  let shops: Shop[];
  try {
    shops = await readShops(sheetsClient);
    logger.info(`shopsシート読み込み完了: ${shops.length}件`);
  } catch (error) {
    logger.error(`shopsシート読み込み失敗: ${error}`);
    try {
      await writeSystemLog(sheetsClient!, 'ERROR', 'main', 'sheets_read_error', String(error));
      await sendSlackMessage(`【システムエラー】shopsシートの読み込みに失敗しました\n${error}`);
    } catch {}
    process.exit(1);
  }

  if (shops.length === 0) {
    logger.info('チェック対象の店舗がありません。処理を終了します。');
    return;
  }

  const results: CheckResult[] = [];
  let blockedCount = 0;

  for (const shop of shops) {
    if (blockedCount >= config.blockedThreshold) {
      logger.warn(`アクセス制限が ${config.blockedThreshold} 件に達しました。巡回を停止します。`);
      try {
        await writeSystemLog(
          sheetsClient,
          'WARN',
          'main',
          'blocked_threshold_exceeded',
          `blocked件数 ${blockedCount} がしきい値 ${config.blockedThreshold} に達したため巡回停止`,
        );
        await sendSlackMessage(
          `【システムエラー】アクセス制限が ${blockedCount} 件発生したため、本日の巡回を停止しました。`,
        );
      } catch {}
      break;
    }

    const previousStatus = shop.currentStatus;
    logger.info(`チェック中: [${shop.shopId}] ${shop.shopName || shop.shopUrl}`);

    const fetchResult = await fetchTabelogPage(shop.shopUrl);
    let currentStatus: ShopStatus = fetchResult.status;
    let detectedText: string | null = null;
    const errorMessage: string | null = fetchResult.errorMessage;

    if (currentStatus === 'active' && fetchResult.bodyText) {
      const detection = detectPendingStatus(fetchResult.bodyText);
      if (detection.isPending) {
        currentStatus = 'pending';
        detectedText = detection.detectedText;
      }
    }

    if (currentStatus === 'blocked') blockedCount++;

    const alertType = determineAlertType(previousStatus, currentStatus);

    const updatedShop: Shop = {
      ...shop,
      currentStatus,
      isPending: currentStatus === 'pending',
      firstFoundAt: shop.firstFoundAt || now,
      lastCheckedAt: now,
      lastPendingDetectedAt: currentStatus === 'pending' ? now : shop.lastPendingDetectedAt,
    };

    try {
      await updateShop(sheetsClient, updatedShop);
    } catch (error) {
      logger.error(`shopsシート更新失敗 [${shop.shopId}]: ${error}`);
    }

    const result: CheckResult = {
      shop: updatedShop,
      previousStatus,
      currentStatus,
      alertType,
      detectedText,
      errorMessage,
    };
    results.push(result);

    try {
      await writeCheckLog(sheetsClient, result, now);
    } catch (error) {
      logger.error(`check_logs書き込み失敗 [${shop.shopId}]: ${error}`);
    }

    logger.info(`  結果: ${previousStatus || 'none'} → ${currentStatus} [${alertType}]`);

    await sleep(config.requestIntervalMs);
  }

  await sendNotifications(sheetsClient, results, now);

  const summary = {
    total: results.length,
    active: results.filter((r) => r.currentStatus === 'active').length,
    pending: results.filter((r) => r.currentStatus === 'pending').length,
    blocked: results.filter((r) => r.currentStatus === 'blocked').length,
    newPending: results.filter((r) => r.alertType === 'new_pending').length,
    recovered: results.filter((r) => r.alertType === 'recovered').length,
  };

  logger.info(`=== 完了: ${JSON.stringify(summary)} ===`);
}

main().catch((error) => {
  logger.error(`予期しないエラー: ${error}`);
  process.exit(1);
});
