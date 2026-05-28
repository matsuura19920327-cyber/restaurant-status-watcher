/**
 * 掲載保留判定ロジックの単体テスト用スクリプト
 * Usage: npm run test:status [URL]
 * URLを省略した場合はサンプルURLを使用します
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchTabelogPage } from './scrapers/fetchTabelogPage';
import { detectPendingStatus } from './scrapers/statusDetector';
import { normalizeUrl, extractShopId } from './utils/normalizeUrl';
import { logger } from './utils/logger';

const SAMPLE_URL = 'https://tabelog.com/tokyo/A1308/A130802/13264137/';

async function testStatus(rawUrl: string): Promise<void> {
  logger.info(`=== 掲載保留判定テスト ===`);
  logger.info(`入力URL: ${rawUrl}`);

  let url: string;
  try {
    url = normalizeUrl(rawUrl);
    logger.info(`正規化URL: ${url}`);
  } catch (error) {
    logger.error(`URL正規化失敗: ${error}`);
    url = rawUrl;
  }

  const shopId = extractShopId(url);
  logger.info(`shop_id: ${shopId ?? '（抽出失敗）'}`);

  logger.info('ページ取得中...');
  const fetchResult = await fetchTabelogPage(url);
  logger.info(`HTTPステータス結果: ${fetchResult.status}`);

  if (fetchResult.errorMessage) {
    logger.warn(`エラーメッセージ: ${fetchResult.errorMessage}`);
  }

  if (fetchResult.bodyText) {
    logger.info(`本文テキスト長: ${fetchResult.bodyText.length} 文字`);

    const detection = detectPendingStatus(fetchResult.bodyText);
    if (detection.isPending) {
      logger.info(`✅ 掲載保留検出: "${detection.detectedText}"`);
      logger.info('→ current_status = pending');
    } else {
      logger.info('✅ 掲載保留なし');
      logger.info('→ current_status = active');
    }
  } else {
    logger.info(`→ current_status = ${fetchResult.status}`);
  }

  logger.info('=== テスト完了 ===');
}

const targetUrl = process.argv[2] ?? SAMPLE_URL;
testStatus(targetUrl).catch((error) => {
  logger.error(`テスト実行エラー: ${error}`);
  process.exit(1);
});
