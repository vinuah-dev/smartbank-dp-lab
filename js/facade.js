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


  /* ---------------- transactions ---------------- */

  // request TransactionBuilder se banti hai
  transact(request) {
    const command = new TransactionCommand(request);      // COMMAND
    return this.invoker.run(command);                     // INVOKER
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
    const acc = this.db.selectOne("accounts", a => a.accNo === accNo);
    if (acc === null) return { ok: false, error: "Account nahi mila." };

    const current = getAccountState(acc.status);

    if (status === "Closed") {
      const allowed = current.canClose();
      if (!allowed.ok) return { ok: false, error: allowed.reason };
    }

    this.db.update("accounts", acc.id, { status: status });
    return { ok: true, status: status, note: getAccountState(status).getNote() };
  }

  // DECORATOR pattern - feature lagana / hatana
  setFeatures(accNo, features) {
    const acc = this.db.selectOne("accounts", a => a.accNo === accNo);
    if (acc === null) return { ok: false, error: "Account nahi mila." };

    this.db.update("accounts", acc.id, { features: features });
    const decorated = decorateAccount(this.db.selectOne("accounts", a => a.id === acc.id));

    return { ok: true,
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
    const earned   = strategy.calculate(acc.balance, years || 1);

    if (earned <= 0) {
      return { ok: false, error: acc.type + " account par interest nahi milta." };
    }

    const request = TransactionBuilder.create()
      .credit()
      .type("Interest Credit")
      .amount(earned)
      .mode(strategy.getName())
      .remark(years + " saal ka interest @ " + strategy.getRate() + "%")
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
                   t => t.accNo === accNo && t.status === "APPROVED" && !t.reversed);

    let credited = 0, debited = 0;
    for (const t of rows) {
      if (t.direction === "credit") credited += t.amount;
      else debited += t.amount + (t.fee || 0);
    }
    return { count: rows.length, credited: credited, debited: debited };
  }

  bankStats() {
    return {
      users:         this.db.count("users"),
      accounts:      this.db.count("accounts"),
      transactions:  this.db.count("transactions"),
      notifications: this.db.count("notifications"),
      accessLogs:    this.db.count("access_log"),
      commands:      this.db.count("command_log"),
      totalMoney:    this.db.selectAll("accounts")
                        .reduce((sum, a) => sum + a.balance, 0),
      queries:       this.db.queryCount
    };
  }
}
