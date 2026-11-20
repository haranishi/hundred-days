// 【見本の骨格】担当Dが全面的に作り直す（契約は interfaces-app.md）。
export function mountSlots(dialog, ctx) { return { open() { dialog.showModal?.(); } }; }
