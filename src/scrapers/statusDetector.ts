const PENDING_KEYWORDS = [
  '掲載保留',
  '店舗の運営状況の確認が出来ておらず',
  '休業期間が未確定',
  '移転・閉店の事実確認が出来ない',
] as const;

export interface DetectionResult {
  isPending: boolean;
  detectedText: string | null;
}

export function detectPendingStatus(bodyText: string): DetectionResult {
  for (const keyword of PENDING_KEYWORDS) {
    if (bodyText.includes(keyword)) {
      return { isPending: true, detectedText: keyword };
    }
  }
  return { isPending: false, detectedText: null };
}
