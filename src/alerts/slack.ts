import axios from 'axios';
import { config } from '../config';
import { CheckResult } from '../types';

export async function sendSlackMessage(text: string): Promise<void> {
  await axios.post(
    config.slackWebhookUrl,
    { text },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    },
  );
}

export function buildNewPendingMessage(result: CheckResult): string {
  return [
    '【新規掲載保留アラート】',
    '',
    `■ 店舗名：${result.shop.shopName || '（店舗名未設定）'}`,
    `■ エリア：${result.shop.areaName || '（未設定）'}`,
    `■ ジャンル：${result.shop.genre || '（未設定）'}`,
    `■ 前回：${result.previousStatus || 'なし'}`,
    `■ 今回：${result.currentStatus}`,
    `■ 検出文言：${result.detectedText || '-'}`,
    `■ URL：${result.shop.shopUrl}`,
    '',
    '物件化・閉店・休業の可能性があります。',
  ].join('\n');
}

export function buildContinuedPendingMessage(results: CheckResult[]): string {
  const lines = [
    '【継続掲載保留サマリー】',
    '',
    `本日時点で、掲載保留が継続している店舗は ${results.length} 件です。`,
    '',
  ];
  results.forEach((result, index) => {
    const name = result.shop.shopName || '（店舗名未設定）';
    const area = result.shop.areaName || '（エリア未設定）';
    const genre = result.shop.genre || '（ジャンル未設定）';
    lines.push(`${index + 1}. ${name} / ${area} / ${genre}`);
  });
  return lines.join('\n');
}

export function buildRecoveredMessage(result: CheckResult): string {
  return [
    '【掲載保留から復帰】',
    '',
    `■ 店舗名：${result.shop.shopName || '（店舗名未設定）'}`,
    `■ エリア：${result.shop.areaName || '（未設定）'}`,
    `■ ジャンル：${result.shop.genre || '（未設定）'}`,
    `■ 前回：${result.previousStatus}`,
    `■ 今回：${result.currentStatus}`,
    `■ URL：${result.shop.shopUrl}`,
  ].join('\n');
}
