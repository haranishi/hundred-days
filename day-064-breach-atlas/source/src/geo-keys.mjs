import codes from './geo-codes.json' with { type: 'json' };

export const LOCATION_IDS = new Map(codes.map((code, index) => [code, index + 1]));
