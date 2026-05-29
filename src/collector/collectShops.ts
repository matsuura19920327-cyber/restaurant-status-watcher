import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { logger } from '../utils/logger';
import { sleep } from '../utils/sleep';
import { normalizeUrl, extractShopId } from '../utils/normalizeUrl';

export interface CollectedShop {
  shopId: string;
  shopUrl: string;
  shopName: string;
  areaName: string;
  genre: string;
}

export interface CollectOptions {
  areaName?: string;
  genre?: string;
  maxPages?: number;
  pageIntervalMs?: number;
}

// 店舗URLの判定: /都道府県/A####/A######/数字/ の4階層のみ
function isCleanShopUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if (!url.hostname.includes('tabelog.com')) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    return (
      parts.length === 4 &&
      /^A\d+$/.test(parts[1]) &&
      /^A\d+$/.test(parts[2]) &&
      /^\d+$/.test(parts[3])
    );
  } catch {
    return false;
  }
}

function extractShopsFromHtml(html: string): { href: string; name: string }[] {
  const $ = cheerio.load(html);
  const found: { href: string; name: string }[] = [];

  // 専用セレクタ優先（検索結果・ランキング）
  const selectors = [
    'a.list-rst__rst-name-target',
    'a.hyakumeiten-list__rst-name',
    'a.award-rst__name',
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (href) found.push({ href, name });
    });
    if (found.length > 0) return found;
  }

  // フォールバック: 全aタグからパターンマッチ
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const name = $(el).text().replace(/\s+/g, ' ').trim();
    if (href) found.push({ href, name });
  });

  return found;
}

function findNextPageUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const selectors = [
    'a[data-anchor="next"]',
    'a.c-pagination__next',
    'a[rel="next"]',
    '.c-pagination__arrow-next a',
  ];
  for (const selector of selectors) {
    const href = $(selector).attr('href');
    if (href) {
      try { return new URL(href, baseUrl).toString(); } catch { /* skip */ }
    }
  }
  return null;
}

// --- axios による収集（軽量・高速） ---
async function collectWithAxios(
  startUrl: string,
  options: CollectOptions,
): Promise<CollectedShop[] | null> {
  const { areaName = '', genre = '', maxPages = 3, pageIntervalMs = 3000 } = options;
  const results: CollectedShop[] = [];
  const seenIds = new Set<string>();

  let currentUrl: string | null = startUrl;
  let pageNum = 1;

  try {
    while (currentUrl && pageNum <= maxPages) {
      logger.info(`  [axios] ページ ${pageNum} 取得: ${currentUrl}`);

      const response = await axios.get<string>(currentUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja-JP,ja;q=0.9',
          'Referer': 'https://tabelog.com/',
        },
        timeout: 15000,
        validateStatus: (s) => s < 500,
      });

      if (response.status === 403 || response.status === 429) {
        logger.warn(`  [axios] アクセス制限 (HTTP ${response.status})。Playwrightにフォールバック`);
        return null;
      }

      const links = extractShopsFromHtml(response.data);
      let newOnPage = 0;

      for (const { href, name } of links) {
        if (!isCleanShopUrl(href)) continue;
        let normalized: string;
        try { normalized = normalizeUrl(href); } catch { continue; }
        const shopId = extractShopId(normalized);
        if (!shopId || seenIds.has(shopId)) continue;
        seenIds.add(shopId);
        results.push({ shopId, shopUrl: normalized, shopName: name, areaName, genre });
        newOnPage++;
      }

      logger.info(`  [axios] → ${newOnPage} 件取得（累計 ${results.length} 件）`);

      const nextUrl = findNextPageUrl(response.data, currentUrl);
      currentUrl = nextUrl;
      pageNum++;
      if (currentUrl) await sleep(pageIntervalMs);
    }
  } catch (error) {
    logger.warn(`  [axios] 取得失敗: ${error}。Playwrightにフォールバック`);
    return null;
  }

  // 取得できたが0件の場合もフォールバック対象
  if (results.length === 0) {
    logger.warn('  [axios] 0件。Playwrightにフォールバック');
    return null;
  }

  return results;
}

// --- Playwright による収集（フォールバック） ---
async function collectWithPlaywright(
  startUrl: string,
  options: CollectOptions,
): Promise<CollectedShop[]> {
  const { areaName = '', genre = '', maxPages = 3, pageIntervalMs = 3000 } = options;
  const results: CollectedShop[] = [];
  const seenIds = new Set<string>();

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'ja-JP,ja;q=0.9',
      },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();
    let currentUrl: string | null = startUrl;
    let pageNum = 1;

    while (currentUrl && pageNum <= maxPages) {
      logger.info(`  [playwright] ページ ${pageNum} 取得: ${currentUrl}`);

      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector(
          '.list-rst__rst-name-target, .hyakumeiten-list__rst-name, .list-rst',
          { timeout: 8000 },
        ).catch(() => {});
        await page.waitForTimeout(1000);

        const html = await page.content();
        const links = extractShopsFromHtml(html);
        let newOnPage = 0;

        for (const { href, name } of links) {
          if (!isCleanShopUrl(href)) continue;
          let normalized: string;
          try { normalized = normalizeUrl(href); } catch { continue; }
          const shopId = extractShopId(normalized);
          if (!shopId || seenIds.has(shopId)) continue;
          seenIds.add(shopId);
          results.push({ shopId, shopUrl: normalized, shopName: name, areaName, genre });
          newOnPage++;
        }

        logger.info(`  [playwright] → ${newOnPage} 件取得（累計 ${results.length} 件）`);

        const nextUrl = findNextPageUrl(html, currentUrl);
        currentUrl = nextUrl;
        pageNum++;
        if (currentUrl) await sleep(pageIntervalMs);
      } catch (error) {
        logger.error(`  [playwright] ページ取得失敗: ${error}`);
        break;
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

// --- メイン収集関数 ---
export async function collectShopsFromUrl(
  startUrl: string,
  options: CollectOptions = {},
): Promise<CollectedShop[]> {
  // まず axios で試みる
  const axiosResult = await collectWithAxios(startUrl, options);
  if (axiosResult !== null) {
    logger.info(`  収集完了 (axios): ${axiosResult.length} 件`);
    return axiosResult;
  }

  // axios がダメなら Playwright にフォールバック
  logger.info('  Playwright で再試行...');
  const playwrightResult = await collectWithPlaywright(startUrl, options);
  logger.info(`  収集完了 (playwright): ${playwrightResult.length} 件`);
  return playwrightResult;
}
