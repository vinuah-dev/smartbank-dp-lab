/* ==========================================================
   strategy.js  -  SmartBank interest calculation
   Pattern used here : STRATEGY  (Advanced)

   Har account type par interest alag tarike se lagta hai:
     Savings -> simple interest
     FD      -> compound interest (har 3 mahine)
     Current -> koi interest nahi

   Formula ko account class ke andar likhne ke bajaye alag
   strategy classes me rakha hai. Account ko sirf ek strategy
   object mil jaata hai aur wo calculate() bula leta hai.
   Naya scheme aane par sirf ek nayi class banegi.
   ========================================================== */


/* ---------- Strategy interface ---------- */
class InterestStrategy {
  getName()      { return "No Interest"; }
  getRate()      { return 0; }
  getFormula()   { return "-"; }
  calculate(principal, years) { return 0; }
}


/* ---------- Concrete Strategies ---------- */

class NoInterestStrategy extends InterestStrategy {
  getName()    { return "No Interest"; }
  getFormula() { return "Current account par interest nahi milta"; }
}

class SimpleInterestStrategy extends InterestStrategy {

  constructor(rate) { super(); this.rate = rate; }

  getName()    { return "Simple Interest"; }
  getRate()    { return this.rate; }
  getFormula() { return "SI = P x R x T / 100"; }

  calculate(principal, years) {
    return Math.round(principal * this.rate * years / 100);
  }
}

class CompoundInterestStrategy extends InterestStrategy {

  // n = saal me kitni baar compound hota hai (FD me 4 = har 3 mahine)
  constructor(rate, n) { super(); this.rate = rate; this.n = n; }

  getName()    { return "Compound Interest"; }
  getRate()    { return this.rate; }
  getFormula() { return "A = P (1 + R/100n)^(nT),  CI = A - P"; }

  calculate(principal, years) {
    const amount = principal *
                   Math.pow(1 + this.rate / (100 * this.n), this.n * years);
    return Math.round(amount - principal);
  }
}


/* account type ke hisaab se strategy do */
function getInterestStrategy(accountType) {
  if (accountType === "Savings")       return new SimpleInterestStrategy(4.0);
  if (accountType === "Fixed Deposit") return new CompoundInterestStrategy(7.5, 4);
  return new NoInterestStrategy();
}

/* dashboard par 1 / 3 / 5 saal ka projection dikhane ke liye */
function interestProjection(accountRow) {
  const strategy = getInterestStrategy(accountRow.type);
  return {
    strategy: strategy.getName(),
    rate:     strategy.getRate(),
    formula:  strategy.getFormula(),
    rows: [1, 3, 5].map(function (y) {
      const earned = strategy.calculate(accountRow.balance, y);
      return { years: y, interest: earned, maturity: accountRow.balance + earned };
    })
  };
}
