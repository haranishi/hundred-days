// Numeric locations are one-based so a data author can find the failing operation.
export class FoldError extends Error {
  constructor(message,{step=0,op=0,code='INVALID_DATA',cause}={}) {
    super(message,{cause}); this.name='FoldError'; this.step=step; this.op=op; this.code=code;
  }
}
