/* ==========================================================
   facade.js  -  SmartBank single entry point
   Pattern used here : FACADE  (Advanced)

   Ab system me bahut saare hisse ho gaye hain - proxy, approval
   chain, gateways, observers, commands, state, decorators.
   Har page ko in sabse alag alag baat karni pade to page ka
   code ganda ho jaayega.

   BankingFacade ek simple darwaza hai. Page sirf itna kehta hai
   "ye transaction kar do" ya "account freeze kar do", aur andar
   ka saara jhamela facade sambhal leta hai.
   ========================================================== */

class BankingFacade {

  constructor() {
    if (BankingFacade.instance) return BankingFacade.instance;

    this.db      = DatabaseConnection.getInstance();
    this.session = SessionManager.getInstance();
    this.invoker = CommandInvoker.getInstance();

    BankingFacade.instance = this;
  }

  static getInstance() {
    if (!BankingFacade.instance) BankingFacade.instance = new BankingFacade();
    return BankingFacade.instance;
  }


  /* ---------------- login / register ---------------- */

  login(email, password) {
    const config = BankConfig.getInstance();
    email = String(email || "").trim().toLowerCase();

    const user = this.db.selectOne("users", u => u.email.toLowerCase() === email);
    if (user === null) return { ok: false, error: "Is email se koi account nahi mila." };

    // 3 galat password ke baad thodi der ke liye lock
    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      const secs = Math.ceil((user.lockedUntil - now) / 1000);
      return { ok: false, locked: true,
               error: "Bahut baar galat password. " + secs + " second baad try karo." };
    }

    if (hashPassword(password, user.salt) !== user.password) {
      const tries = (user.failedLogins || 0) + 1;
      if (tries >= config.maxLoginTries) {
        this.db.update("users", user.id, { failedLogins: 0, lockedUntil: now + config.lockSeconds * 1000 });
        return { ok: false, locked: true,
                 error: "Galat password. Account " + config.lockSeconds + " second ke liye lock ho gaya." };
      }
      this.db.update("users", user.id, { failedLogins: tries });
      const left = config.maxLoginTries - tries;
      return { ok: false, error: "Password galat hai. " + left + " try aur bache hain." };
    }

    this.db.update("users", user.id, { failedLogins: 0, lockedUntil: 0 });

    // bank staff ka apna console hai, uska koi account nahi hota
    if (user.role === "staff") {
      this.session.login(user.id, null);
      return { ok: true, user: user, page: "admin.html" };
    }

    const acc = this.db.selectOne("accounts", a => a.userId === user.id);
    if (acc === null) return { ok: false, error: "Is user ka koi account nahi hai." };

    this.session.login(user.id, acc.accNo);
    return { ok: true, user: user, page: "dashboard.html" };
  }

  validateNewUser(form) {
    const name   = String(form.name || "").trim();
    const email  = String(form.email || "").trim();
    const digits = String(form.mobile || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    const pass   = String(form.password || "");

    if (!/^[A-Za-z][A-Za-z .]{2,39}$/.test(name))           return "Naam me sirf letters ho (3 se 40 characters).";
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email))       return "Email sahi format me daalo (jaise you@example.com).";
    if (!/^[6-9]\d{9}$/.test(digits))                        return "Mobile number 10 digit ka hona chahiye.";
    if (pass.length < 4)                                     return "Password kam se kam 4 characters ka ho.";
    if (form.confirm !== undefined && form.confirm !== pass) return "Dono password match nahi kar rahe.";
    if (this.db.selectOne("users", u => u.email.toLowerCase() === email.toLowerCase())) {
      return "Ye email pehle se registered hai.";
    }
    return null;
  }

  register(form) {
    const problem = this.validateNewUser(form);
    if (problem) return { ok: false, error: problem };

    // user banane se pehle hi account ke rules check kar lo
    const rules = getAccountRules(form.type);
    const open  = Number(form.opening);
    if (!isFinite(open) || open < rules.minBalance) {
      return { ok: false, error: rules.type + " account ke liye kam se kam Rs. " +
                                 money(rules.minBalance) + " chahiye." };
    }

    const digits = String(form.mobile).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    const salt   = makeSalt();
    const user   = this.db.insert("users", {
      name: String(form.name).trim(), email: String(form.email).trim(),
      mobile: "+91-" + digits, password: hashPassword(form.password, salt), salt: salt,
      role: "customer", alertPrefs: Object.assign({}, DEFAULT_ALERT_PREFS),
      failedLogins: 0, lockedUntil: 0, createdAt: new Date().toISOString()
    });

    const made = getAccountFactory(form.type).openAccount(user.id, open);   // FACTORY METHOD
    if (!made.ok) return made;

    this.session.login(user.id, made.account.accNo);
    return { ok: true, user: user, account: made.account, page: "dashboard.html" };
  }


  /* ---------------- transactions ---------------- */

  // request TransactionBuilder se banti hai
  transact(request) {
    const command = new TransactionCommand(request);      // COMMAND
    const result  = this.invoker.run(command);            // INVOKER

    result.patterns = (request.builtBy ? ["Builder"] : [])
      .concat(["Facade", "Command"], result.patterns || []);
    return result;
  }

  undoLast() {
    const user = this.session.getUser();
    return this.invoker.undoLast(user.id);
  }

  canUndo() {
    const user = this.session.getUser();
    return this.invoker.lastUndoable(user.id);
  }

  reverse(txnRowId) {
    const row = this.db.selectOne("transactions", t => t.id === txnRowId);
    if (row === null) return { ok: false, error: "Transaction nahi mili." };
    return reverseTransactionRow(row);
  }


  /* ---------------- accounts ---------------- */

  myAccounts() {
    const user = this.session.getUser();
    return this.db.select("accounts", a => a.userId === user.id);
  }

  activeAccount() {
    return this.session.getAccount();
  }

  openAccount(type, openingBalance) {
    const user = this.session.getUser();
    return getAccountFactory(type).openAccount(user.id, openingBalance);   // FACTORY METHOD
  }

  balance(accNo) {
    const user  = this.session.getUser();
    const proxy = new AccountProxy(accNo, user.id);                        // PROXY
    return proxy.getBalance();
  }

  details(accNo) {
    const user = this.session.getUser();
    return new AccountProxy(accNo, user.id).getDetails();
  }

  // STATE pattern - status badalna
  setStatus(accNo, status) {
    if (ALL_STATES.indexOf(status) === -1) return { ok: false, error: "Galat status: " + status };

    const acc = this.db.selectOne("accounts", a => a.accNo === accNo);
    if (acc === null) return { ok: false, error: "Account nahi mila." };

    const current = getAccountState(acc.status);

    let payout = 0;
    if (status === "Closed") {
      const allowed = current.canClose();
      if (!allowed.ok) return { ok: false, error: allowed.reason };
      if (acc.balance < 0) {
        return { ok: false, error: "Overdraft ka Rs. " + money(-acc.balance) +
                                   " pehle wapas jama karna hoga, phir account band hoga." };
      }

      // bacha hua paisa customer ko counter par de diya - iski bhi entry banti hai
      payout = acc.balance;
      if (payout > 0) {
        this.db.update("accounts", acc.id, { balance: 0 });
        const user  = this.db.selectOne("users", u => u.id === acc.userId);
        const event = {
          txnId: newTxnId(), accNo: acc.accNo, userId: acc.userId,
          holder: user ? user.name : "Customer", type: "Closure Payout", direction: "debit",
          amount: payout, fee: 0, balance: 0, mode: "Cash at Branch", status: "APPROVED",
          approvedBy: "Bank Staff", remark: "Account band - poora balance customer ko diya"
        };
        if (user) buildSubject(user, Object.assign({}, acc, { balance: 0 })).notify(event);
        else      new DatabaseLoggerObserver().update(event);
      }
    }

    this.db.update("accounts", acc.id, { status: status });
    return { ok: true, status: status, payout: payout, note: getAccountState(status).getNote() };
  }

  // DECORATOR pattern - feature lagana / hatana
  setFeatures(accNo, features) {
    const acc = this.db.selectOne("accounts", a => a.accNo === accNo);
    if (acc === null) return { ok: false, error: "Account nahi mila." };
    if (acc.type === "Fixed Deposit" && features.length > 0) {
      return { ok: false, error: "Fixed Deposit par add-on services nahi lagti." };
    }

    const known = FEATURE_CATALOG.map(f => f.key);
    const clean = known.filter(k => features.indexOf(k) !== -1);    // catalogue ke order me

    this.db.update("accounts", acc.id, { features: clean });
    const decorated = decorateAccount(this.db.selectOne("accounts", a => a.id === acc.id));

    return { ok: true, features: clean,
             description: decorated.getDescription(),
             monthlyFee:  decorated.getMonthlyFee() };
  }

  decorated(accNo) {
    const acc = this.db.selectOne("accounts", a => a.accNo === accNo);
    return acc === null ? null : decorateAccount(acc);
  }

  // STRATEGY pattern - interest jama karna
  applyInterest(accNo, years) {
    const acc = this.db.selectOne("accounts", a => a.accNo === accNo);
    if (acc === null) return { ok: false, error: "Account nahi mila." };

    const strategy = getInterestStrategy(acc.type);
    const earned   = strategy.calculate(Math.max(0, acc.balance), years || 1);

    if (earned <= 0) {
      return { ok: false, error: acc.type + " account par interest nahi milta." };
    }

    const request = TransactionBuilder.create()
      .credit()
      .type("Interest Credit")
      .amount(earned)
      .mode(strategy.getName())
      .remark((years || 1) + " saal ka interest @ " + strategy.getRate() + "%")
      .build();

    const result = this.transact(request);
    result.earned   = earned;
    result.strategy = strategy.getName();
    return result;
  }

  // DECORATOR ki monthly fee kaatna (admin action)
  chargeMonthlyFee(accNo) {
    const acc = this.db.selectOne("accounts", a => a.accNo === accNo);
    if (acc === null) return { ok: false, error: "Account nahi mila." };

    const fee = decorateAccount(acc).getMonthlyFee();
    if (fee <= 0) return { ok: false, error: "Is account par koi paid feature nahi hai." };

    const request = TransactionBuilder.create()
      .debit()
      .type("Service Charge")
      .amount(fee)
      .mode("Auto Debit")
      .remark("Add-on services ki monthly fee")
      .build();

    return this.transact(request);
  }


  /* ---------------- reports ---------------- */

  statement(accNo, filters) {
    let rows = this.db.select("transactions", t => t.accNo === accNo);
    filters = filters || {};

    if (filters.type)   rows = rows.filter(t => t.type === filters.type);
    if (filters.status) rows = rows.filter(t => t.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(t => (t.txnId + " " + t.remark).toLowerCase().indexOf(q) !== -1);
    }
    return rows.reverse();
  }

  summary(accNo) {
    const rows = this.db.select("transactions",
                   t => t.accNo === accNo && t.status === "APPROVED" &&
                        !t.reversed && t.type !== "Reversal");

    let credited = 0, debited = 0;
    for (const t of rows) {
      if (t.direction === "credit") credited += t.amount;
      else debited += t.amount + (t.fee || 0);
    }
    return { count: rows.length, credited: credited, debited: debited,
             usedToday: debitedToday(accNo) };
  }

  bankStats() {
    const users = this.db.selectAll("users");
    return {
      customers:     users.filter(u => u.role !== "staff").length,
      staff:         users.filter(u => u.role === "staff").length,
      accounts:      this.db.count("accounts"),
      transactions:  this.db.count("transactions"),
      notifications: this.db.count("notifications"),
      accessLogs:    this.db.count("access_log"),
      commands:      this.db.count("command_log"),
      totalMoney:    this.db.selectAll("accounts").reduce((sum, a) => sum + a.balance, 0),
      queries:       this.db.queryCount
    };
  }
}
