export type ShopStatus =
  | 'active'
  | 'pending'
  | 'not_found'
  | 'blocked'
  | 'timeout'
  | 'parse_error'
  | 'unknown';

export type AlertType = 'new_pending' | 'continued_pending' | 'recovered' | 'none' | 'error';

export type AlertLogType =
  | 'new_pending'
  | 'continued_pending_summary'
  | 'recovered'
  | 'system_error';

export interface Shop {
  rowIndex: number;
  shopId: string;
  source: string;
  shopName: string;
  shopUrl: string;
  areaName: string;
  genre: string;
  currentStatus: ShopStatus | '';
  isPending: boolean;
  firstFoundAt: string;
  lastCheckedAt: string;
  lastPendingDetectedAt: string;
  memo: string;
}

export interface CheckResult {
  shop: Shop;
  previousStatus: ShopStatus | '';
  currentStatus: ShopStatus;
  alertType: AlertType;
  detectedText: string | null;
  errorMessage: string | null;
}
