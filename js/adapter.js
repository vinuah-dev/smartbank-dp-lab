/* ==========================================================
   adapter.js  -  SmartBank third party wallet
   Pattern used here : ADAPTER  (Advanced)

   Bank ne ek bahar wali company "QuickPay" ka wallet jodna hai.
   Uska code humare paas hai lekin badal nahi sakte, aur uska
   interface humare PaymentGateway se bilkul alag hai:

     - amount paise me leta hai, rupees me nahi
     - method ke naam alag hain (walletTransfer, fetchCommission)
     - result me statusCode aata hai, true/false nahi

   Adapter beech me khada hota hai aur QuickPay ko humare
   PaymentGateway jaisa bana deta hai. Isliye QuickPay bhi
   Bridge pattern me waise hi lag jaata hai jaise UPI ya Card.
   ========================================================== */


/* ==========================================================
   ADAPTEE : ye class "third party" ki hai, hum ise chhu nahi sakte
   ========================================================== */
class QuickPayWalletAPI {

  constructor() {
    this.provider = "QuickPay Technologies Pvt Ltd";
    this.version  = "v2.3";
  }

  // amount PAISE me chahiye
  fetchCommission(amountInPaise) {
    return Math.round(amountInPaise * 0.015);          // 1.5%
  }

  maxTransferPaise() {
    return 20000000;                                    // Rs. 2,00,000
  }

  // wapas ek alag hi shakal ka object aata hai
  walletTransfer(amountInPaise, walletId) {
    if (amountInPaise > this.maxTransferPaise()) {
      return { statusCode: 429, message: "WALLET_LIMIT_EXCEEDED", txRef: null };
    }
    return {
      statusCode: 200,
      message: "SUCCESS",
      txRef: "QP" + Math.floor(Math.random() * 900000 + 100000),
      debitedPaise: amountInPaise + this.fetchCommission(amountInPaise),
      walletId: walletId
    };
  }
}


/* ==========================================================
   ADAPTER : QuickPay ko humare PaymentGateway jaisa bana diya
   ========================================================== */
class WalletGatewayAdapter extends PaymentGateway {

  constructor() {
    super();
    this.api = new QuickPayWalletAPI();      // adaptee andar rakha hai
  }

  getName() { return "QuickPay Wallet"; }

  // rupees -> paise -> rupees ka conversion adapter karta hai
  getFee(amount) {
    return Math.round(this.api.fetchCommission(amount * 100) / 100);
  }

  getMaxLimit() {
    return this.api.maxTransferPaise() / 100;
  }

  process(amount, ctx) {
    const steps = [
      "Adapter: Rs. " + money(amount) + " ko " + money(amount * 100) + " paise me convert kiya",
      "QuickPay " + this.api.version + " API ko walletTransfer() call kiya",
      "Wallet " + (ctx.walletId || "9876543210@quickpay") + " authenticate hua"
    ];

    const raw = this.api.walletTransfer(amount * 100, ctx.walletId || "9876543210@quickpay");

    // third party ka statusCode humare true/false me badla
    if (raw.statusCode !== 200) {
      steps.push("QuickPay ne statusCode " + raw.statusCode + " diya (" + raw.message + ")");
      return {
        ok: false,
        error: "QuickPay Wallet ki limit Rs. " + money(this.getMaxLimit()) + " hai.",
        steps: steps
      };
    }

    steps.push("QuickPay statusCode 200, ref " + raw.txRef);
    steps.push("Adapter: " + money(raw.debitedPaise) + " paise = Rs. " +
               money(raw.debitedPaise / 100) + " debit hua");

    return { ok: true, steps: steps };
  }
}
