/**
 * 食べログ店舗URL収集スクリプト
 *
 * Usage:
 *   npm run collect -- --url <URL> [options]
 *
 * Options:
 *   --url        収集元URL（食べログ検索結果・ランキングページ）※必須
 *   --area       エリア名（shopsシートのarea_nameに設定）
 *   --genre      ジャンル名（shopsシートのgenreに設定）
 *   --max-pages  最大ページ数（デフォルト: 10）
 *   --dry-run    シートに書き込まず、取得結果だけ表示
 *
 * 例:
 *   # エリア+ジャンル検索
 *   npm run collect -- --url "https://tabelog.com/tokyo/A1304/A130401/R10/rstLst/" --area 渋谷 --genre ラーメン
 *
 *   # 百名店ランキング
 *   npm run collect -- --url "https://tabelog.com/award/hyakumeiten/ramen/" --genre ラーメン --max-pages 2
 *
 *   # エリア全ジャンル
 *   npm run collect -- --url "https://tabelog.com/tokyo/A1304/A130401/rstLst/" --area 渋谷
 */
import dotenv from 'dotenv';
dotenv.config();

import { createSheetsClient } from './sheets/client';
import { collectShopsFromUrl } from './collector/collectShops';
import { addNewShops } from './collector/addNewShops';
import { logger } from './utils/logger';

function extractPrefFromUrl(url: string): string | null {
  // https://tabelog.com/tokyo/... → "tokyo"
  const m = url.match(/tabelog\.com\/([a-z]+)\//);
  return m ? m[1] : null;
}

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      if (result[key] !== 'true') i++;
    }
  }
  return result;
}

function printUsage() {
  console.log(`
使い方:
  npm run collect -- --url <URL> [--area <エリア>] [--genre <ジャンル>] [--max-pages <ページ数>] [--dry-run]

例:
  # 渋谷のラーメン店を収集
  npm run collect -- --url "https://tabelog.com/tokyo/A1304/A130401/R10/rstLst/" --area 渋谷 --genre ラーメン

  # 食べログ百名店ラーメン
  npm run collect -- --url "https://tabelog.com/award/hyakumeiten/ramen/" --genre ラーメン --max-pages 2

  # 新宿エリア全店舗（最大5ページ）
  npm run collect -- --url "https://tabelog.com/tokyo/A1303/A130301/rstLst/" --area 新宿 --max-pages 5

  # 結果確認のみ（シートに書き込まない）
  npm run collect -- --url "https://tabelog.com/..." --dry-run
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const url = args.url;

  if (!url || url === 'true') {
    printUsage();
    process.exit(1);
  }

  const isDryRun = args['dry-run'] === 'true';
  const maxPages = args['max-pages'] ? parseInt(args['max-pages'], 10) : 10;

  logger.info('=== 食べログ店舗URL収集開始 ===');
  logger.info(`対象URL  : ${url}`);
  logger.info(`エリア   : ${args.area ?? '（未指定）'}`);
  logger.info(`ジャンル : ${args.genre ?? '（未指定）'}`);
  logger.info(`最大ページ: ${maxPages}`);
  logger.info(`モード   : ${isDryRun ? 'ドライラン（書き込みなし）' : '本番'}`);
  logger.info('');

  const shops = await collectShopsFromUrl(url, {
    areaName: args.area ?? '',
    genre: args.genre ?? '',
    maxPages,
    pageIntervalMs: 3000,
  });

  logger.info('');
  logger.info(`収集した店舗: ${shops.length} 件`);

  if (shops.length === 0) {
    logger.warn('店舗URLが取得できませんでした。URLが正しいか確認してください。');
    process.exit(0);
  }

  // 収集URLが検索エリアと一致しているか検証
  const expectedPref = extractPrefFromUrl(url);
  if (expectedPref) {
    const mismatch = shops.filter((s) => !s.shopUrl.includes(`tabelog.com/${expectedPref}/`));
    if (mismatch.length > shops.length * 0.5) {
      logger.warn('');
      logger.warn('⚠️  警告: 取得した店舗URLの多くが検索エリアと一致していません。');
      logger.warn(`   検索URL: ${url} (期待エリア: ${expectedPref})`);
      logger.warn(`   不一致: ${mismatch.length}件 / 全${shops.length}件`);
      logger.warn('   食べログがbot検知してリダイレクトしている可能性があります。');
      logger.warn('   --dry-run で内容を確認してから書き込んでください。');
      logger.warn('');
      if (!isDryRun) {
        logger.error('エリア不一致が多いため書き込みを中止しました。--dry-run で確認してください。');
        process.exit(1);
      }
    }
  }

  if (isDryRun) {
    logger.info('--- 取得結果プレビュー（最大20件）---');
    shops.slice(0, 20).forEach((s, i) => {
      logger.info(`${i + 1}. [${s.shopId}] ${s.shopName || '（名前なし）'} - ${s.shopUrl}`);
    });
    if (shops.length > 20) logger.info(`  ... 他 ${shops.length - 20} 件`);
    logger.info('ドライランのため、シートへの書き込みをスキップしました。');
    return;
  }

  const sheetsClient = await createSheetsClient();
  const result = await addNewShops(sheetsClient, shops);

  logger.info('');
  logger.info('=== 収集完了 ===');
  logger.info(`新規追加 : ${result.added} 件`);
  logger.info(`スキップ : ${result.skipped} 件（shopsシート既存）`);

  if (result.added > 0) {
    logger.info('');
    logger.info('追加した店舗（最大10件）:');
    result.newShops.slice(0, 10).forEach((s, i) => {
      logger.info(`  ${i + 1}. ${s.shopName || '（名前なし）'} [${s.shopId}]`);
    });
    logger.info('');
    logger.info('次のステップ: npm run check を実行して掲載保留チェックを開始してください');
  }
}

main().catch((error) => {
  logger.error(`予期しないエラー: ${error}`);
  process.exit(1);
});
