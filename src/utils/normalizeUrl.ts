export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/^http:/, 'https:');
  const urlObj = new URL(trimmed);
  urlObj.search = '';
  urlObj.hash = '';
  if (!urlObj.pathname.endsWith('/')) {
    urlObj.pathname += '/';
  }
  return urlObj.toString();
}

export function extractShopId(url: string): string | null {
  // https://tabelog.com/tokyo/A1308/A130802/13264137/
  const match = url.match(/tabelog\.com\/[^/]+\/[^/]+\/[^/]+\/(\d+)/);
  if (match) {
    return `tabelog_${match[1]}`;
  }
  return null;
}
