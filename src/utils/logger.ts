function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string): void => {
    console.log(`[INFO]  ${timestamp()} ${msg}`);
  },
  warn: (msg: string): void => {
    console.warn(`[WARN]  ${timestamp()} ${msg}`);
  },
  error: (msg: string): void => {
    console.error(`[ERROR] ${timestamp()} ${msg}`);
  },
};
