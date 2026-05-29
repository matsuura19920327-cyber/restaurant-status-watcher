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

// 食べログ店舗URLの判定: パス階層が /都道府県/A####/A######/数字/ の4階層のみ
function isCleanShopUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if (!url.hostname.includes('tabelog.com')) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    // ["tokyo", "A1304", "A130401", "13012345"] の4つだけが店舗ページ
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

// 次ページリンクのセレクタ候補（食べログのHTML構造変更に備えて複数用意）
const NEXT_PAGE_SELECTORS = [
  'a[data-anchor="next"]',
  'a.c-pagination__next',
  'a[rel="next"]',
  '.c-pagination__arrow-next a',
  'a.js-gtm-seo-pagination-next',
];

// 店舗名リンクのセレクタ候補（検索結果・ランキングページ）
const SHOP_LINK_SELECTORS = [
  'a.list-rst__rst-name-target',
  'a.hyakumeiten-list__rst-name',
  'a.award-rst__name',
  '.list-rst h3 a',
  '.ranking-list h3 a',
];

export interface CollectOptions {
  areaName?: string;
  genre?: string;
  maxPages?: number;
  pageIntervalMs?: number;
}

export async function collectShopsFromUrl(
  startUrl: string,
  options: CollectOptions = {},
): Promise<CollectedShop[]> {
  const {
    areaName = '',
    genre = '',
    maxPages = 10,
    pageIntervalMs = 3000,
  } = options;

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const results: CollectedShop[] = [];
  const seenIds = new Set<string>();

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });
    // webdriver フラグを隠す
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });
    const page = await context.newPage();

    let currentUrl: string | null = startUrl;
    let pageNum = 1;

    while (currentUrl && pageNum <= maxPages) {
      logger.info(`ページ ${pageNum}/${maxPages} を取得中: ${currentUrl}`);

      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // 店舗リストが現れるまで待つ（最大8秒）
        await page.waitForSelector(
          '.list-rst__rst-name-target, .hyakumeiten-list__rst-name, .js-rstinfo-panel, .list-rst',
          { timeout: 8000 },
        ).catch(() => {
          // セレクタが見つからなくてもページの内容で続行
        });
        await page.waitForTimeout(1000);

        // CAPTCHA・ブロック検知
        const title = await page.title();
        if (title.toLowerCase().includes('access denied') || title.includes('ロボット')) {
          logger.warn(`アクセス制限を検知しました (title: ${title})。収集を停止します。`);
          break;
        }

        // 1. 専用セレクタで店舗リンクを抽出（店舗名も取れる）
        let shopLinks: { href: string; name: string }[] = [];
        for (const selector of SHOP_LINK_SELECTORS) {
          const found = await page.$$eval(selector, (anchors) =>
            (anchors as HTMLAnchorElement[]).map((a) => ({
              href: a.href ?? '',
              name: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
            })),
          );
          if (found.length > 0) {
            shopLinks = found;
            break;
          }
        }

        // 2. 専用セレクタで取れなければ全aタグからパターンマッチ
        if (shopLinks.length === 0) {
          shopLinks = await page.$$eval('a[href]', (anchors) =>
            (anchors as HTMLAnchorElement[]).map((a) => ({
              href: a.href ?? '',
              name: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
            })),
          );
        }

        let newOnPage = 0;
        for (const { href, name } of shopLinks) {
          if (!isCleanShopUrl(href)) continue;

          let normalizedUrl: string;
          try {
            normalizedUrl = normalizeUrl(href);
          } catch {
            continue;
          }

          const shopId = extractShopId(normalizedUrl);
          if (!shopId || seenIds.has(shopId)) continue;

          seenIds.add(shopId);
          results.push({
            shopId,
            shopUrl: normalizedUrl,
            shopName: name,
            areaName,
            genre,
          });
          newOnPage++;
        }

        logger.info(`  → ${newOnPage} 件取得（累計 ${results.length} 件）`);

        // 次ページリンクを探す
        let nextUrl: string | null = null;
        for (const selector of NEXT_PAGE_SELECTORS) {
          const href = await page.$eval(
            selector,
            (el) => (el as HTMLAnchorElement).href,
          ).catch(() => null);
          if (href) {
            nextUrl = href;
            break;
          }
        }

        currentUrl = nextUrl;
        pageNum++;

        if (currentUrl) {
          await sleep(pageIntervalMs);
        }
      } catch (error) {
        logger.error(`ページ ${pageNum} の取得に失敗: ${error}`);
        break;
      }
    }

    if (pageNum > maxPages) {
      logger.info(`最大ページ数 (${maxPages}) に達しました。`);
    }
  } finally {
    await browser.close();
  }

  return results;
}
