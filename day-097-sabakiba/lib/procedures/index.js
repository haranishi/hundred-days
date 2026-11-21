// 手順の入口。親が管理する。本物の手順ができたら、ここの import を差し替える。
import aji from './_sample.js';
export const PROCEDURES = { aji };
export const getProcedure = (id) => PROCEDURES[id] || null;
