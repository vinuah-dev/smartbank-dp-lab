/* ==========================================================
   payments.js  -  SmartBank payment layer
   Pattern used here : BRIDGE  (Experiment 3)

   Do cheezein alag alag badalti hain:
     Abstraction    -> paisa kis kaam ke liye ja raha hai
                       (Transfer / Bill / Recharge)
     Implementation -> kis gateway se ja raha hai
                       (UPI / Card / Net Banking)

   Inheritance se karte to 3 x 3 = 9 classes banti.
   Bridge se sirf 3 + 3 = 6 classes me kaam ho gaya.
   ========================================================== */


/* ---------- Implementor ---------- */
class PaymentGateway {
  getName()            { return "Gateway"; }
  getFee(amount)       { return 0; }
  getMaxLimit()        { return Infinity; }
  process(amount, ctx) { return { ok: true, steps: [] }; }
}

/* ---------- Concrete Implementors ---------- */
class UPIGateway extends PaymentGateway {
  getName()      { return "UPI"; }
  getFee()       { return 0; }
  getMaxLimit()  { return 100000; }

  process(amount, ctx) {
    const steps = [
      "VPA " + (ctx.vpa || "user@smartbank") + " verify kiya",
      "UPI PIN authenticate hua",
      "NPCI switch ko request bheji",
      "Rs. " + money(amount) + " transfer complete (koi charge nahi)"
    ];
    if (amount > this.getMaxLimit()) {
      return { ok: false, error: "UPI ki limit Rs. 1,00,000 hai.", steps: steps.slice(0, 1) };
    }
    return { ok: true, steps: steps };
  }
}

class CardGateway extends PaymentGateway {
  getName()          { return "Debit / Credit Card"; }
  getFee(amount)     { return Math.round(amount * 0.02); }
  getMaxLimit()      { return 500000; }

  process(amount, ctx) {
    const fee = this.getFee(amount);
    const steps = [
      "Card number ka Luhn check pass hua",
      "Bank ne OTP verify kiya",
      "Processing fee 2% = Rs. " + money(fee),
      "Rs. " + money(amount + fee) + " card se charge hua"
    ];
    if (amount > this.getMaxLimit()) {
      return { ok: false, error: "Card ki limit Rs. 5,00,000 hai.", steps: steps.slice(0, 1) };
    }
    return { ok: true, steps: steps };
  }
}

class NetBankingGateway extends PaymentGateway {
  getName()      { return "Net Banking"; }
  getFee()       { return 5; }
  getMaxLimit()  { return 1000000; }

  process(amount, ctx) {
    const steps = [
      "Bank ke login page par redirect kiya",
      "Net banking credentials verify hue",
      "Service charge Rs. 5 laga",
      "Rs. " + money(amount + 5) + " account se debit hua"
    ];
    if (amount > this.getMaxLimit()) {
      return { ok: false, error: "Net Banking ki limit Rs. 10,00,000 hai.", steps: steps.slice(0, 1) };
    }
    return { ok: true, steps: steps };
  }
}

function getGateway(code) {
  if (code === "upi")    return new UPIGateway();
  if (code === "card")   return new CardGateway();
  // ye gateway third party ka hai, ADAPTER ke through aata hai (js/adapter.js)
  if (code === "wallet") return new WalletGatewayAdapter();
  return new NetBankingGateway();
}

// dropdown bharne ke liye ek hi jagah list
const GATEWAY_OPTIONS = [
  { code: "upi",     label: "UPI - no fee, limit Rs. 1,00,000" },
  { code: "card",    label: "Debit / Credit Card - 2% fee" },
  { code: "netbank", label: "Net Banking - Rs. 5 flat" },
  { code: "wallet",  label: "QuickPay Wallet - 1.5% (third party, Adapter)" }
];


/* ---------- Abstraction ---------- */
class Payment {

  constructor(gateway) {
    this.gateway = gateway;        // <-- YAHI BRIDGE HAI
  }

  getType()  { return "Payment"; }
  getIcon()  { return "*"; }

  // subclass apna extra kaam karke phir gateway ko bulati hai
  execute(amount, ctx) {
    return this.gateway.process(amount, ctx);
  }

  getTotal(amount) {
    return amount + this.gateway.getFee(amount);
  }
}

/* ---------- Refined Abstractions ---------- */
class MoneyTransfer extends Payment {
  getType() { return "Money Transfer"; }

  execute(amount, ctx) {
    const pre = ["Beneficiary account " + ctx.toAccount + " verify kiya",
                 "IFSC " + BankConfig.getInstance().ifsc + " match hua"];
    const res = super.execute(amount, ctx);
    res.steps = pre.concat(res.steps);
    return res;
  }
}

class BillPayment extends Payment {
  getType() { return "Bill Payment"; }

  execute(amount, ctx) {
    const pre = [ctx.biller + " ka biller ID check kiya",
                 "Consumer number " + ctx.consumerNo + " valid hai"];
    const res = super.execute(amount, ctx);
    res.steps = pre.concat(res.steps);
    if (res.ok) res.steps.push("Bill receipt generate ho gayi");
    return res;
  }
}

class MobileRecharge extends Payment {
  getType() { return "Mobile Recharge"; }

  execute(amount, ctx) {
    const pre = ["Number " + ctx.mobile + " ka operator detect kiya",
                 "Recharge plan Rs. " + money(amount) + " select hua"];
    const res = super.execute(amount, ctx);
    res.steps = pre.concat(res.steps);
    if (res.ok) res.steps.push("Operator ne recharge confirm kar diya");
    return res;
  }
}

function getPayment(type, gateway) {
  if (type === "transfer") return new MoneyTransfer(gateway);
  if (type === "bill")     return new BillPayment(gateway);
  return new MobileRecharge(gateway);
}
