// 単独ゲームとDay56の開始後ロードで同じ素材を読む。保存IDは変更しない。
export const publicBase = typeof window !== 'undefined' && window.__dragonPublicBase
  ? window.__dragonPublicBase
  : import.meta.env.BASE_URL;
