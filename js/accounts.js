/* ==========================================================
   accounts.js  -  SmartBank account layer
   Patterns used here : FACTORY METHOD + PROXY  (Experiment 2)
   ========================================================== */


/* ==========================================================
   PART A : FACTORY METHOD

   Bank me teen tarah ke account hain aur teeno ke rules alag
   hain. Client ko "new SavingsAccount()" nahi likhna chahiye,
   isliye har type ka apna factory banaya hai.
   ========================================================== */

// ---------- Product ----------
class BankAccount {

  constructor(accNo, userId, balance) {
    this.accNo    = accNo;
    this.userId   = userId;
    this.balance  = balance;
    this.openedOn = new Date().toLocaleDateString();
  }

  getType()        { return "Account"; }
  getInterest()    { return 0; }
  getMinBalance()  { return 0; }
  getDailyLimit()  { return 0; }
  canWithdraw()    { return true; }

  // DB me store karne ke liye plain object
  toRow() {
    return {
      accNo:       this.accNo,
      userId:      this.userId,
      type:        this.getType(),
      balance:     this.balance,
      interest:    this.getInterest(),
      minBalance:  this.getMinBalance(),
      dailyLimit:  this.getDailyLimit(),
      openedOn:    this.openedOn,
      status:      "Active",      // STATE pattern (js/state.js)
      features:    [],            // DECORATOR pattern (js/decorator.js)
      rewardPoints: 0
    };
  }
}

// ---------- Concrete Products ----------
class SavingsAccount extends BankAccount {
  getType()       { return "Savings";  }
  getInterest()   { return 4.0;        }
  getMinBalance() { return 1000;       }
  getDailyLimit() { return 50000;      }
}

class CurrentAccount extends BankAccount {
  getType()       { return "Current";  }
  getInterest()   { return 0.0;        }
  getMinBalance() { return 10000;      }
  getDailyLimit() { return 200000;     }
}

class FixedDepositAccount extends BankAccount {
  getType()       { return "Fixed Deposit"; }
  getInterest()   { return 7.5;             }
  getMinBalance() { return 25000;           }
  getDailyLimit() { return 0;               }
  canWithdraw()   { return false; }   // FD se paisa nikal nahi sakte
}


// ---------- Creator ----------
class AccountFactory {

  // FACTORY METHOD - subclass ise override karti hai
  createAccount(accNo, userId, balance) {
    throw new Error("Subclass must implement createAccount()");
  }

  // sab factories ke liye common process
  openAccount(userId, openingBalance) {
    const db    = DatabaseConnection.getInstance();
    const accNo = "SB" + (100000 + db.count("accounts") * 7 +
                          Math.floor(Math.random() * 90000));

    const account = this.createAccount(accNo, userId, openingBalance);

    if (openingBalance < account.getMinBalance()) {
      return {
        ok: false,
        error: account.getType() + " account ke liye kam se kam Rs. " +
               money(account.getMinBalance()) + " chahiye."
      };
    }

    db.insert("accounts", account.toRow());
    return { ok: true, account: account };
  }
}

// ---------- Concrete Creators ----------
class SavingsAccountFactory extends AccountFactory {
  createAccount(a, u, b) { return new SavingsAccount(a, u, b); }
}

class CurrentAccountFactory extends AccountFactory {
  createAccount(a, u, b) { return new CurrentAccount(a, u, b); }
}

class FDAccountFactory extends AccountFactory {
  createAccount(a, u, b) { return new FixedDepositAccount(a, u, b); }
}

// factory choose karne ke liye chhota helper
function getAccountFactory(type) {
  if (type === "Savings") return new SavingsAccountFactory();
  if (type === "Current") return new CurrentAccountFactory();
  return new FDAccountFactory();
}

// account banane se pehle rules pata karne ke liye
function getAccountRules(type) {
  const sample = getAccountFactory(type).createAccount("TEMP", 0, 0);
  return {
    type:       sample.getType(),
    minBalance: sample.getMinBalance(),
    interest:   sample.getInterest(),
    dailyLimit: sample.getDailyLimit(),
    canWithdraw: sample.canWithdraw()
  };
}


/* ==========================================================
   PART B : PROXY

   Account ka balance seedha DB se padhne/badalne nahi dena.
   Har request AccountProxy ke through jaati hai jo:
     1. Check karta hai ki logged-in user hi owner hai
     2. Real object ko sirf zaroorat padne par load karta hai
     3. Har access ko access_log table me likh deta hai
   ========================================================== */

// ---------- Subject ----------
class AccountService {
  getBalance()      {}
  credit(amt)       {}
  debit(amt)        {}
  getDetails()      {}
}

// ---------- Real Subject : seedha DB se baat karta hai ----------
class RealAccountService extends AccountService {

  constructor(accNo) {
    super();
    this.db    = DatabaseConnection.getInstance();
    this.accNo = accNo;
    this.row   = this.db.selectOne("accounts", a => a.accNo === accNo);
  }

  getBalance() {
    this.row = this.db.selectOne("accounts", a => a.accNo === this.accNo);
    return this.row.balance;
  }

  credit(amount) {
    const bal = this.getBalance() + amount;
    this.db.update("accounts", this.row.id, { balance: bal });
    return bal;
  }

  debit(amount) {
    const bal = this.getBalance() - amount;
    this.db.update("accounts", this.row.id, { balance: bal });
    return bal;
  }

  getDetails() {
    this.row = this.db.selectOne("accounts", a => a.accNo === this.accNo);
    return this.row;
  }
}

// ---------- Proxy ----------
class AccountProxy extends AccountService {

  constructor(accNo, requestedByUserId) {
    super();
    this.db        = DatabaseConnection.getInstance();
    this.accNo     = accNo;
    this.userId    = requestedByUserId;
    this.real      = null;              // abhi load nahi kiya (lazy)
    this.lastError = "";
  }

  // ---- protection proxy ----
  _checkAccess(operation) {
    const acc = this.db.selectOne("accounts", a => a.accNo === this.accNo);

    let allowed = true;
    let reason  = "owner verified";

    if (acc === null) {
      allowed = false;
      reason  = "account not found";
    } else if (acc.userId !== this.userId) {
      allowed = false;
      reason  = "user is not the owner of this account";
    }

    // ---- logging proxy : har koshish record hoti hai ----
    this.db.insert("access_log", {
      accNo:     this.accNo,
      userId:    this.userId,
      operation: operation,
      allowed:   allowed,
      reason:    reason,
      time:      new Date().toLocaleString()
    });

    if (!allowed) this.lastError = "Access denied: " + reason;
    return allowed;
  }

  // ---- virtual proxy : real object pehli baar hi banta hai ----
  _getReal() {
    if (this.real === null) {
      this.real = new RealAccountService(this.accNo);
    }
    return this.real;
  }

  getBalance() {
    if (!this._checkAccess("READ_BALANCE")) return null;
    return this._getReal().getBalance();
  }

  getDetails() {
    if (!this._checkAccess("READ_DETAILS")) return null;
    return this._getReal().getDetails();
  }

  credit(amount) {
    if (!this._checkAccess("CREDIT")) return null;
    return this._getReal().credit(amount);
  }

  debit(amount) {
    if (!this._checkAccess("DEBIT")) return null;
    return this._getReal().debit(amount);
  }

  wasRealObjectCreated() {
    return this.real !== null;
  }
}
