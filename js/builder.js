/* ==========================================================
   builder.js  -  SmartBank transaction request builder
   Pattern used here : BUILDER  (Advanced)

   Ek transaction request me bahut saari cheezein hoti hain -
   direction, type, amount, mode, remark, gateway, beneficiary,
   extra context. Sab ek saath constructor me daalna galti se
   bhara hua form jaisa lagta hai.

   Builder step by step request banata hai aur build() par
   check karke ek saaf object deta hai.
   ========================================================== */

class TransactionBuilder {

  constructor() {
    this.req = {
      direction:   "debit",
      type:        "Transaction",
      amount:      0,
      mode:        "Online",
      remark:      "",
      paymentType: null,
      gatewayCode: null,
      toAccount:   null,
      ctx:         {}
    };
  }

  static create() { return new TransactionBuilder(); }

  debit()  { this.req.direction = "debit";  return this; }
  credit() { this.req.direction = "credit"; return this; }

  type(t)   { this.req.type   = t;          return this; }
  amount(a) { this.req.amount = Number(a);  return this; }
  mode(m)   { this.req.mode   = m;          return this; }
  remark(r) { this.req.remark = r;          return this; }

  // Bridge wala hissa : payment type + gateway
  via(paymentType, gatewayCode) {
    this.req.paymentType = paymentType;
    this.req.gatewayCode = gatewayCode;
    this.req.mode        = getGateway(gatewayCode).getName();
    return this;
  }

  to(accNo) {
    this.req.toAccount = accNo;
    this.req.ctx.toAccount = accNo;
    return this;
  }

  context(obj) {
    Object.assign(this.req.ctx, obj);
    return this;
  }

  build() {
    if (!this.req.amount || !isFinite(this.req.amount) || this.req.amount <= 0) {
      throw new Error("Amount sahi nahi hai.");
    }
    if (this.req.paymentType && !this.req.gatewayCode) {
      throw new Error("Payment ke liye gateway chunna zaroori hai.");
    }
    if (!this.req.remark) {
      this.req.remark = this.req.type;
    }
    this.req.remark  = String(this.req.remark).slice(0, 120);
    this.req.builtBy = "TransactionBuilder";
    return this.req;
  }
}
