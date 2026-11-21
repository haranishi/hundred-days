// 手順の入口。手順ができた魚から登録する（本物の手順の担当が8種に広げる）。
import aji from './aji.js';
export const PROCEDURES = { aji };
export const getProcedure = (id) => PROCEDURES[id] || null;
