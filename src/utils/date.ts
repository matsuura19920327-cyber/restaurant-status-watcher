export function nowISO(): string {
  return new Date().toISOString();
}

export function nowJST(): string {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}
