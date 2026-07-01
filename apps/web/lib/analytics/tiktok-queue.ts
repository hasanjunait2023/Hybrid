export interface TikTokQueue {
  track: (
    name: string,
    payload?: Record<string, unknown>,
    options?: { event_id?: string },
  ) => void;
  page?: () => void;
  load?: (pixelId: string) => void;
}
