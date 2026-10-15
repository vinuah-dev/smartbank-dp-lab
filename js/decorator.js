/* ==========================================================
   decorator.js  -  SmartBank account add-on services
   Pattern used here : DECORATOR  (Advanced)

   Customer apne account par extra services laga sakta hai -
   Cashback, Overdraft, Insurance, Reward Points.

   Har combination ke liye nayi account class banana bewakoofi
   hoti (Savings+Cashback, Savings+Cashback+Overdraft ...).
   Decorator pattern me har feature ek wrapper hai jo account
   ke upar chadh jaata hai aur uska behaviour badal deta hai.
   Kitne bhi feature ek ke upar ek laga sakte hain.
   ========================================================== */


/* ---------- Component ---------- */
class AccountComponent {
  getDescription()             { return "Account"; }
  getMonthlyFee()              { return 0; }
  getExtraLimit()              { return 0; }   // overdraft
  getCashback(txnType, amount) { return 0; }
  getRewardPoints(amount)      { return 0; }
  getFeatureNames()            { return []; }
}


/* ---------- Concrete Component : plain account ---------- */
class BasicAccount extends AccountComponent {

  constructor(accountRow) {
    super();
    this.row = accountRow;
  }

  getDescription() { return this.row.type + " Account"; }
}


/* ---------- Base Decorator ---------- */
class AccountFeature extends AccountComponent {

  constructor(inner) {
    super();
    this.inner = inner;         // andar wala account ya doosra feature
  }

  // by default sab kuch andar wale ko pass kar do
  getDescription()             { return this.inner.getDescription(); }
  getMonthlyFee()              { return this.inner.getMonthlyFee(); }
  getExtraLimit()              { return this.inner.getExtraLimit(); }
  getCashback(t, a)            { return this.inner.getCashback(t, a); }
  getRewardPoints(a)           { return this.inner.getRewardPoints(a); }
  getFeatureNames()            { return this.inner.getFeatureNames(); }
}


/* ---------- Concrete Decorators ---------- */

class CashbackFeature extends AccountFeature {

  getDescription() { return this.inner.getDescription() + " + Cashback"; }
  getMonthlyFee()  { return this.inner.getMonthlyFee() + 29; }
  getFeatureNames(){ return this.inner.getFeatureNames().concat("Cashback"); }

  // bill aur recharge par 1% cashback, maximum Rs. 100
  getCashback(txnType, amount) {
    let own = 0;
    if (txnType === "Bill Payment" || txnType === "Mobile Recharge") {
      own = Math.min(Math.round(amount * 0.01), 100);
    }
    return this.inner.getCashback(txnType, amount) + own;
  }
}


class OverdraftFeature extends AccountFeature {

  getDescription() { return this.inner.getDescription() + " + Overdraft"; }
  getMonthlyFee()  { return this.inner.getMonthlyFee() + 49; }
  getFeatureNames(){ return this.inner.getFeatureNames().concat("Overdraft"); }

  // balance khatam ho jaaye to bhi Rs. 10,000 tak nikal sakte ho
  getExtraLimit()  { return this.inner.getExtraLimit() + 10000; }
}


class InsuranceFeature extends AccountFeature {

  getDescription() { return this.inner.getDescription() + " + Accident Insurance"; }
  getMonthlyFee()  { return this.inner.getMonthlyFee() + 99; }
  getFeatureNames(){ return this.inner.getFeatureNames().concat("Insurance"); }
}


class RewardPointsFeature extends AccountFeature {

  getDescription() { return this.inner.getDescription() + " + Reward Points"; }
  getMonthlyFee()  { return this.inner.getMonthlyFee() + 19; }
  getFeatureNames(){ return this.inner.getFeatureNames().concat("Reward Points"); }

  // har Rs. 100 kharch par 2 points
  getRewardPoints(amount) {
    return this.inner.getRewardPoints(amount) + Math.floor(amount / 100) * 2;
  }
}


/* ---------- catalogue aur builder ---------- */

const FEATURE_CATALOG = [
  { key: "cashback",  name: "Cashback",      cls: "CashbackFeature",
    fee: 29, desc: "Bill aur recharge par 1% cashback (max Rs. 100)" },
  { key: "overdraft", name: "Overdraft",     cls: "OverdraftFeature",
    fee: 49, desc: "Balance khatam hone par bhi Rs. 10,000 tak nikal sakte ho" },
  { key: "insurance", name: "Insurance",     cls: "InsuranceFeature",
    fee: 99, desc: "Rs. 2 lakh ka accident cover" },
  { key: "rewards",   name: "Reward Points", cls: "RewardPointsFeature",
    fee: 19, desc: "Har Rs. 100 kharch par 2 points" }
];

/* account row ke features list se decorator chain bana do */
function decorateAccount(accountRow) {
  let account = new BasicAccount(accountRow);

  const features = accountRow.features || [];

  // ek ke upar ek wrap hote jaate hain
  if (features.indexOf("cashback")  !== -1) account = new CashbackFeature(account);
  if (features.indexOf("overdraft") !== -1) account = new OverdraftFeature(account);
  if (features.indexOf("insurance") !== -1) account = new InsuranceFeature(account);
  if (features.indexOf("rewards")   !== -1) account = new RewardPointsFeature(account);

  return account;
}
