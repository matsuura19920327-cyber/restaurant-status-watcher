import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config';
import { ShopStatus } from '../types';

export interface FetchResult {
  status: ShopStatus;
  bodyText: string | null;
  errorMessage: string | null;
}

const CAPTCHA_SIGNALS = ['Access Denied', 'Robot Check', 'CAPTCHA', '403 Forbidden'];

export async function fetchTabelogPage(url: string): Promise<FetchResult> {
  try {
    const response = await axios.get<string>(url, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
      },
      timeout: 20000,
      validateStatus: () => true,
      maxRedirects: 5,
    });

    if (response.status === 404) {
      return { status: 'not_found', bodyText: null, errorMessage: null };
    }

    if (response.status === 403 || response.status === 429) {
      return { status: 'blocked', bodyText: null, errorMessage: `HTTP ${response.status}` };
    }

    if (response.status >= 400) {
      return { status: 'unknown', bodyText: null, errorMessage: `HTTP ${response.status}` };
    }

    let $ : cheerio.CheerioAPI;
    try {
      $ = cheerio.load(response.data as string);
    } catch {
      return { status: 'parse_error', bodyText: null, errorMessage: 'cheerio parse failed' };
    }

    const title = $('title').text();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    if (!bodyText || bodyText.length < 100) {
      return { status: 'parse_error', bodyText: null, errorMessage: 'body too short' };
    }

    for (const signal of CAPTCHA_SIGNALS) {
      if (title.includes(signal) || bodyText.includes(signal)) {
        return { status: 'blocked', bodyText: null, errorMessage: `CAPTCHA/block detected: ${signal}` };
      }
    }

    return { status: 'active', bodyText, errorMessage: null };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return { status: 'timeout', bodyText: null, errorMessage: error.message };
      }
      if (error.response?.status === 403 || error.response?.status === 429) {
        return { status: 'blocked', bodyText: null, errorMessage: `HTTP ${error.response.status}` };
      }
    }
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'unknown', bodyText: null, errorMessage: msg };
  }
}
