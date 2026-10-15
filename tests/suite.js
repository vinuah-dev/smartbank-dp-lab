/* ==========================================================
   tests/suite.js  -  SmartBank automated test suite

   Ye ek hi test file do jagah chalti hai:
     1. tests.html      -> browser me (SQLite ya browser storage)
     2. run-node.js     -> terminal me:  node tests/run-node.js

   Har section ek design pattern ya feature ko check karta hai.
   Test mode me alag database use hota hai, isliye asli demo
   data ko kuch nahi hota.
   ========================================================== */

function runSmartBankSuite(T) {
  const db = DatabaseConnection.getInstance();
  const sm = SessionManager.getInstance();
  const fc = BankingFacade.getInstance();
  const B  = () => TransactionBuilder.create();

  const userBy = email => db.selectOne("users", u => u.email === email);
  const accsOf = user  => db.select("accounts", a => a.userId === user.id);
  const bal    = accNo => db.selectOne("accounts", a => a.accNo === accNo).balance;
  const rowsOf = accNo => db.select("transactions", t => t.accNo === accNo);
  const near   = (a, b) => Math.abs(a - b) < 0.01;

  function loginAs(email, index) {
    const user = userBy(email);
    const acc  = accsOf(user)[index || 0];
    sm.login(user.id, acc.accNo);
    return { user: user, acc: acc, accNo: acc.accNo };
  }

  // Har account ka balance == uski saari approved entries ka jod
  function ledgerProblems() {
    const bad = [];
    for (const a of db.selectAll("accounts")) {
      const sum = rowsOf(a.accNo)
        .filter(t => t.status === "APPROVED")
        .reduce((s, t) => s + (t.direction === "credit" ? t.amount : -(t.amount + (t.fee || 0))), 0);
      if (!near(sum, a.balance)) bad.push(a.accNo + " balance " + a.balance + " != ledger " + sum);
    }
    return bad;
  }
  function checkLedger(label) {
    const bad = ledgerProblems();
    T.check("ledger balanced " + label, bad.length === 0, bad.join("; "));
  }

  /* ------------------------------------------------------------ */
  T.section("Setup");
  db.dropDatabase();
  T.check("database empty after drop", db.count("users") === 0 && db.count("transactions") === 0);
  T.check("seedDatabase() seeds an empty database", seedDatabase() === true);
  T.check("seedDatabase() does nothing the second time", seedDatabase() === false);
  T.log("Driver: " + db.getDriverName());

  /* ------------------------------------------------------------ */
  T.section("Password hashing");
  T.check("sha256('') matches the standard value",
          sha256("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  T.check("sha256('abc') matches the standard value",
          sha256("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  T.check("same password + different salt = different hash",
          hashPassword("1234", "aa") !== hashPassword("1234", "bb"));
  const anyUser = db.selectAll("users")[0];
  T.check("passwords are not stored as plain text",
          anyUser.password !== "1234" && /^[0-9a-f]{64}$/.test(anyUser.password) && !!anyUser.salt);

  /* ------------------------------------------------------------ */
  T.section("Seed data");
  const users = db.selectAll("users");
  T.check("3 customers + 1 staff", users.filter(u => u.role === "customer").length === 3 &&
                                   users.filter(u => u.role === "staff").length === 1);
  T.check("4 accounts", db.count("accounts") === 4);
  T.check("every account has an Account Opening entry",
          db.selectAll("accounts").every(a => rowsOf(a.accNo).some(t => t.type === "Account Opening")));
  T.check("past week history was created", db.count("transactions") >= 15);
  T.check("history is dated in the past (not today)",
          db.selectAll("transactions").every(t => localDayKey(t.ts) !== localDayKey(new Date())));
  T.check("seed transfers created Transfer In entries for receivers",
          db.select("transactions", t => t.type === "Transfer In").length === 2);
  T.check("seed history is not undoable", db.count("command_log") === 0);
  checkLedger("after seed");

  /* ------------------------------------------------------------ */
  T.section("Login, lockout and registration (Facade)");
  sm.logout();
  let r = fc.login("ramesh@smartbank.in", "wrong");
  T.check("wrong password rejected with tries left", !r.ok && /2 try/.test(r.error), r.error);
  fc.login("ramesh@smartbank.in", "wrong");
  r = fc.login("ramesh@smartbank.in", "wrong");
  T.check("3rd wrong password locks the account", !r.ok && r.locked === true, r.error);
  r = fc.login("ramesh@smartbank.in", "1234");
  T.check("even the right password waits while locked", !r.ok && r.locked === true);
  db.update("users", userBy("ramesh@smartbank.in").id, { lockedUntil: Date.now() - 1000 });
  r = fc.login("RAMESH@smartbank.in", "1234");
  T.check("login works after lock time (email case-insensitive)", r.ok && r.page === "dashboard.html");
  T.check("failed attempts reset after success", userBy("ramesh@smartbank.in").failedLogins === 0);
  r = fc.login("manager@smartbank.in", "admin");
  T.check("staff login goes to Bank Console", r.ok && r.page === "admin.html" && isStaff());
  T.check("unknown email rejected", !fc.login("nobody@x.in", "1").ok);

  const form = { name: "Priya Sharma", email: "priya@test.in", mobile: "98123 45678",
                 password: "pass1", confirm: "pass1", type: "Savings", opening: 5000 };
  const bad = (patch, why) => {
    const res = fc.register(Object.assign({}, form, patch));
    T.check("register rejects " + why, !res.ok, res.error);
  };
  bad({ name: "P1" }, "a bad name");
  bad({ email: "priya@" }, "a bad email");
  bad({ mobile: "12345" }, "a short mobile number");
  bad({ password: "ab", confirm: "ab" }, "a short password");
  bad({ confirm: "other" }, "a password mismatch");
  bad({ email: "sneha@smartbank.in" }, "an already used email");
  bad({ type: "Fixed Deposit", opening: 5000 }, "an FD below Rs. 25,000");
  const usersBefore = db.count("users");
  bad({ opening: "abc" }, "a non-number opening amount");
  T.check("failed registration does not leave half-created users", db.count("users") === usersBefore);
  r = fc.register(form);
  T.check("valid registration works", r.ok, r.error);
  const priya = userBy("priya@test.in");
  T.check("mobile normalised to +91-XXXXXXXXXX", priya.mobile === "+91-9812345678");
  T.check("new account has opening entry + welcome alert",
          rowsOf(r.account.accNo).some(t => t.type === "Account Opening" && t.amount === 5000) &&
          db.select("notifications", n => n.userId === priya.id && /Welcome/.test(n.title)).length === 1);

  /* ------------------------------------------------------------ */
  T.section("Singleton");
  T.check("BankConfig is one object", BankConfig.getInstance() === new BankConfig());
  T.check("DatabaseConnection is one object", DatabaseConnection.getInstance() === new DatabaseConnection());
  T.check("SessionManager is one object", SessionManager.getInstance() === new SessionManager());
  T.check("CommandInvoker is one object", CommandInvoker.getInstance() === new CommandInvoker());
  T.check("BankingFacade is one object", BankingFacade.getInstance() === new BankingFacade());

  /* ------------------------------------------------------------ */
  T.section("Chain of Responsibility");
  const ask = (amount, extra) => requestApproval(Object.assign({
    amount: amount, balance: 10000000, dailyLimit: 10000000, accountType: "Current",
    accountStatus: "Active", extraLimit: 0, usedToday: 0 }, extra || {}));
  T.check("Rs. 5,000 -> Clerk", ask(5000).approvedBy === "Clerk");
  T.check("Rs. 50,000 -> Manager", ask(50000).approvedBy === "Manager");
  T.check("Rs. 5,00,000 -> Branch Head", ask(500000).approvedBy === "Branch Head");
  const big = ask(2500000);
  T.check("Rs. 25,00,000 -> nobody, rejected at the end of the chain",
          big.status === "REJECTED" && big.trail[big.trail.length - 1].by === "System");
  T.check("chain order: Account Status first, Fraud Check second",
          ask(5000).trail[0].by === "Account Status" && ask(5000).trail[1].by === "Fraud Check");
  T.check("frozen account stopped by the first handler",
          ask(100, { accountStatus: "Frozen" }).trail.length === 1);
  T.check("FD stopped by Fraud Check", ask(100, { accountType: "Fixed Deposit" }).status === "REJECTED");
  const daily = ask(8000, { dailyLimit: 50000, usedToday: 45000 });
  T.check("daily limit counts what was already used today",
          daily.status === "REJECTED" && /5,000 baaki/.test(daily.trail[1].action), daily.trail[1].action);
  T.check("system debit (fee) is not blocked by the daily limit",
          ask(8000, { dailyLimit: 50000, usedToday: 50000, systemDebit: true }).status === "APPROVED");

  /* ------------------------------------------------------------ */
  T.section("Builder");
  let threw = false;
  try { B().debit().amount(0).build(); } catch (e) { threw = true; }
  T.check("builder rejects amount 0", threw);
  threw = false;
  try { B().debit().amount("abc").build(); } catch (e) { threw = true; }
  T.check("builder rejects a non-number amount", threw);
  const built = B().debit().type("Transfer").amount(500).via("transfer", "upi").to("SB1").remark("x").build();
  T.check("builder fills mode, toAccount and ctx",
          built.mode === "UPI" && built.toAccount === "SB1" && built.ctx.toAccount === "SB1" &&
          built.builtBy === "TransactionBuilder");

  /* ------------------------------------------------------------ */
  T.section("Deposits, withdrawals and daily limit");
  const ram = loginAs("ramesh@smartbank.in", 0);
  let start = bal(ram.accNo);
  r = fc.transact(B().credit().type("Deposit").amount(45000).mode("Cash").remark("t").build());
  T.check("deposit adds money", r.ok && near(bal(ram.accNo), start + 45000));
  T.check("result lists the patterns used",
          ["Builder", "Facade", "Command", "Singleton", "Proxy", "State", "Observer"]
            .every(p => r.patterns.indexOf(p) !== -1), r.patterns.join(","));
  r = fc.transact(B().debit().type("Withdrawal").amount(30000).mode("ATM").remark("t").build());
  T.check("Rs. 30,000 withdrawal approved by Manager", r.ok && r.approvedBy === "Manager");
  T.check("today's usage is tracked", near(debitedToday(ram.accNo), 30000));
  const beforeLimit = bal(ram.accNo);
  r = fc.transact(B().debit().type("Withdrawal").amount(25000).mode("ATM").remark("t").build());
  T.check("second withdrawal blocked by daily limit (30k + 25k > 50k), not by balance",
          !r.ok && near(bal(ram.accNo), beforeLimit) && beforeLimit > 25000 &&
          r.trail.some(t => /daily limit/.test(t.action)), JSON.stringify(r.trail));
  T.check("rejected attempt is still saved for audit",
          rowsOf(ram.accNo).some(t => t.status === "REJECTED" && t.amount === 25000));
  T.check("bad amounts rejected (negative / huge)",
          !executeTransaction({ direction: "debit", type: "Withdrawal", amount: -5, mode: "ATM", remark: "x" }).ok &&
          !executeTransaction({ direction: "credit", type: "Deposit", amount: 2e8, mode: "x", remark: "x" }).ok);
  checkLedger("after deposits/withdrawals");

  /* ------------------------------------------------------------ */
  T.section("Transfers (both sides of the ledger)");
  const sneha = accsOf(userBy("sneha@smartbank.in"))[0];
  const amitA = accsOf(userBy("amit@smartbank.in"))[0];
  start = bal(ram.accNo);
  const snehaStart = bal(sneha.accNo);
  const snehaAlerts = db.select("notifications", n => n.userId === sneha.userId).length;
  r = fc.transact(B().debit().type("Transfer").amount(4000).via("transfer", "upi")
                    .to(sneha.accNo).remark("test").build());
  T.check("transfer succeeded", r.ok, r.error);
  T.check("sender lost Rs. 4,000", near(bal(ram.accNo), start - 4000));
  T.check("receiver got Rs. 4,000", near(bal(sneha.accNo), snehaStart + 4000));
  const tin = rowsOf(sneha.accNo).filter(t => t.type === "Transfer In" && t.parentTxnId === r.txnId);
  T.check("receiver's statement has a Transfer In entry linked to the sender's txn", tin.length === 1);
  T.check("receiver was alerted too",
          db.select("notifications", n => n.userId === sneha.userId).length > snehaAlerts);

  start = bal(ram.accNo);
  r = fc.transact(B().debit().type("Transfer").amount(100).via("transfer", "upi").to("SB000000").remark("x").build());
  T.check("transfer to unknown account fails before any money moves", !r.ok && near(bal(ram.accNo), start));
  r = fc.transact(B().debit().type("Transfer").amount(100).via("transfer", "upi").to(ram.accNo).remark("x").build());
  T.check("transfer to the same account is blocked", !r.ok);
  checkLedger("after transfers");

  /* ------------------------------------------------------------ */
  T.section("Bridge + Adapter");
  let combos = 0;
  for (const type of ["transfer", "bill", "recharge"]) {
    for (const g of GATEWAY_OPTIONS) {
      const p = getPayment(type, getGateway(g.code));
      const run = p.execute(1000, { toAccount: "SB1", biller: "B", consumerNo: "C", mobile: "M" });
      if (run.ok && run.steps.length >= 3) combos++;
    }
  }
  T.check("all 3 payment types work with all 4 gateways (12 combinations)", combos === 12);
  const wallet = getGateway("wallet");
  T.check("QuickPay adapter is a PaymentGateway", wallet instanceof PaymentGateway);
  T.check("adapter converts paise fee to rupees (1.5% of 10,000 = 150)", wallet.getFee(10000) === 150);
  T.check("adapter converts the paise limit (Rs. 2,00,000)", wallet.getMaxLimit() === 200000);
  T.check("adapter turns statusCode 429 into ok:false", wallet.process(300000, {}).ok === false);
  start = bal(ram.accNo);
  r = fc.transact(B().debit().type("Transfer").amount(2000).via("transfer", "wallet")
                    .to(amitA.accNo).remark("wallet").build());
  T.check("wallet transfer works and charges Rs. 30 fee", r.ok && r.fee === 30 && near(bal(ram.accNo), start - 2030));
  T.check("wallet transfer marks Adapter in the pattern list", r.patterns.indexOf("Adapter") !== -1);

  /* ------------------------------------------------------------ */
  T.section("Decorator");
  start = bal(ram.accNo);
  r = fc.transact(B().debit().type("Bill Payment").amount(2000).via("bill", "upi")
                    .remark("bill").context({ biller: "X", consumerNo: "1" }).build());
  T.check("cashback 1% on bill (Rs. 20)", r.ok && r.cashback === 20 && near(bal(ram.accNo), start - 1980));
  const cb = rowsOf(ram.accNo).filter(t => t.type === "Cashback" && t.parentTxnId === r.txnId);
  T.check("cashback entry is linked to its bill", cb.length === 1);
  const billTxn = r.txnId;
  const decoR = decorateAccount(db.selectOne("accounts", a => a.accNo === ram.accNo));
  T.check("cashback capped at Rs. 100", decoR.getCashback("Mobile Recharge", 20000) === 100);
  T.check("no cashback on withdrawals", decoR.getCashback("Withdrawal", 5000) === 0);

  const sn = loginAs("sneha@smartbank.in", 0);
  const deco = decorateAccount(db.selectOne("accounts", a => a.accNo === sn.accNo));
  T.check("two decorators stacked (overdraft + rewards)", deco.getFeatureNames().length === 2);
  T.check("monthly fee adds up (49 + 19)", deco.getMonthlyFee() === 68);
  const snBal = bal(sn.accNo);
  const pointsBefore = db.selectOne("accounts", a => a.accNo === sn.accNo).rewardPoints || 0;
  r = fc.transact(B().debit().type("Withdrawal").amount(snBal + 5000).mode("Branch Counter").remark("od").build());
  T.check("overdraft lets balance go below zero", r.ok && near(r.balance, -5000), r.error);
  T.check("reward points earned and saved",
          r.points > 0 && db.selectOne("accounts", a => a.accNo === sn.accNo).rewardPoints === pointsBefore + r.points);
  const odTxn = r.txnId, odPoints = r.points;
  r = fc.transact(B().debit().type("Withdrawal").amount(20000).mode("ATM").remark("x").build());
  T.check("cannot go beyond the overdraft limit", !r.ok);
  T.check("FD cannot get add-ons", !fc.setFeatures(accsOf(userBy("ramesh@smartbank.in"))[1].accNo, ["cashback"]).ok);
  const fs = fc.setFeatures(amitA.accNo, ["insurance", "bogus", "cashback"]);
  T.check("unknown add-ons ignored, catalogue order kept",
          fs.ok && fs.features.join(",") === "cashback,insurance");
  fc.setFeatures(amitA.accNo, []);
  checkLedger("after decorator tests");

  /* ------------------------------------------------------------ */
  T.section("Command (undo / reverse)");
  start = bal(sn.accNo);
  r = fc.undoLast();
  T.check("undo reverses the last successful command (overdraft withdrawal)",
          r.ok && near(bal(sn.accNo), start + snBal + 5000), r.error);
  const odRow = rowsOf(sn.accNo).find(t => t.txnId === odTxn);
  T.check("original marked REVERSED", odRow.reversed === true);
  T.check("reward points taken back",
          db.selectOne("accounts", a => a.accNo === sn.accNo).rewardPoints === pointsBefore);
  T.check("reversal entry created", rowsOf(sn.accNo).some(t => t.type === "Reversal" && t.parentTxnId === odTxn));
  T.check("cannot reverse the same transaction twice", !fc.reverse(odRow.id).ok);

  loginAs("ramesh@smartbank.in", 0);
  start = bal(ram.accNo);
  r = fc.undoLast();
  T.check("undo of bill also takes back its cashback", r.ok && r.reversedCount === 2 && near(bal(ram.accNo), start + 1980), r.error);
  const cbRow = rowsOf(ram.accNo).find(t => t.type === "Cashback" && t.parentTxnId === billTxn);
  T.check("cashback entry marked REVERSED", cbRow.reversed === true);
  T.check("a linked child entry cannot be reversed on its own", !fc.reverse(tin[0].id).ok);

  // wallet transfer ko admin reverse kare -> dono taraf theek
  const walletRow = rowsOf(ram.accNo).find(t => t.mode === "QuickPay Wallet" && t.type === "Transfer" && !t.reversed);
  const amitBefore = bal(amitA.accNo);
  start = bal(ram.accNo);
  r = fc.reverse(walletRow.id);
  T.check("staff reverse of a transfer fixes both accounts",
          r.ok && near(bal(ram.accNo), start + 2030) && near(bal(amitA.accNo), amitBefore - 2000), r.error);
  r = fc.undoLast();
  T.check("undo skips commands that staff already reversed (next one is the UPI transfer)",
          r.ok && /Transfer of Rs. 4,000/.test(r.label), r.label);
  T.check("Account Opening cannot be reversed",
          !fc.reverse(rowsOf(ram.accNo).find(t => t.type === "Account Opening").id).ok);
  checkLedger("after undo / reverse");

  /* ------------------------------------------------------------ */
  T.section("State");
  T.check("bad status rejected", !fc.setStatus(ram.accNo, "Sleeping").ok);
  T.check("freeze works", fc.setStatus(ram.accNo, "Frozen").ok);
  r = fc.transact(B().debit().type("Withdrawal").amount(100).mode("ATM").remark("x").build());
  T.check("frozen account: withdrawal blocked by Account Status", !r.ok && r.trail[0].by === "Account Status");
  r = fc.transact(B().credit().type("Deposit").amount(100).mode("Cash").remark("x").build());
  T.check("frozen account: deposit still allowed", r.ok);
  T.check("frozen account cannot be closed directly", !fc.setStatus(ram.accNo, "Closed").ok);
  fc.setStatus(ram.accNo, "Active");

  const priyaAcc = accsOf(userBy("priya@test.in"))[0];
  const payoutBefore = bal(priyaAcc.accNo);
  r = fc.setStatus(priyaAcc.accNo, "Closed");
  T.check("closing pays out the balance and records it",
          r.ok && near(r.payout, payoutBefore) && bal(priyaAcc.accNo) === 0 &&
          rowsOf(priyaAcc.accNo).some(t => t.type === "Closure Payout"), r.error);
  r = fc.transact(B().debit().type("Transfer").amount(100).via("transfer", "upi").to(priyaAcc.accNo).remark("x").build());
  T.check("cannot transfer into a closed account", !r.ok);
  loginAs("priya@test.in", 0);
  r = fc.transact(B().credit().type("Deposit").amount(100).mode("Cash").remark("x").build());
  T.check("closed account: even deposit blocked", !r.ok);
  T.check("overdrawn account cannot be closed until cleared", (function () {
    const s = loginAs("sneha@smartbank.in", 0);
    fc.transact(B().debit().type("Withdrawal").amount(bal(s.accNo) + 1000).mode("Branch Counter").remark("x").build());
    const res = fc.setStatus(s.accNo, "Closed");
    fc.undoLast();
    return !res.ok;
  })());
  checkLedger("after state changes");

  /* ------------------------------------------------------------ */
  T.section("Strategy");
  T.check("Savings -> Simple Interest", getInterestStrategy("Savings") instanceof SimpleInterestStrategy);
  T.check("FD -> Compound Interest", getInterestStrategy("Fixed Deposit") instanceof CompoundInterestStrategy);
  T.check("Current -> No Interest", getInterestStrategy("Current") instanceof NoInterestStrategy);
  T.check("simple: 1,00,000 @ 4% for 3 years = 12,000", getInterestStrategy("Savings").calculate(100000, 3) === 12000);
  T.check("compound beats simple at the same rate",
          getInterestStrategy("Fixed Deposit").calculate(100000, 3) > 22500);
  const fd = loginAs("ramesh@smartbank.in", 1);
  start = bal(fd.accNo);
  r = fc.applyInterest(fd.accNo, 1);
  T.check("interest really credited to FD", r.ok && r.earned > 0 && near(bal(fd.accNo), start + r.earned));
  r = fc.transact(B().debit().type("Withdrawal").amount(1000).mode("ATM").remark("x").build());
  T.check("FD withdrawal still blocked (Factory Method rule)", !r.ok);
  loginAs("sneha@smartbank.in", 0);
  T.check("current account gets no interest", !fc.applyInterest(sn.accNo, 1).ok);

  /* ------------------------------------------------------------ */
  T.section("Proxy");
  const spy = new AccountProxy(sneha.accNo, userBy("ramesh@smartbank.in").id);
  T.check("someone else's account: read denied", spy.getBalance() === null);
  T.check("denied -> real object never created", spy.wasRealObjectCreated() === false);
  const own = new AccountProxy(ram.accNo, userBy("ramesh@smartbank.in").id);
  T.check("own account: real object not created yet", own.wasRealObjectCreated() === false);
  T.check("own account: read allowed", own.getBalance() !== null);
  T.check("real object created lazily on first use", own.wasRealObjectCreated() === true);
  T.check("denials are logged", db.select("access_log", l => !l.allowed && l.accNo === sneha.accNo).length > 0);

  /* ------------------------------------------------------------ */
  T.section("Observer (per-user alerts)");
  const rUser = userBy("ramesh@smartbank.in");
  const sUser = userBy("sneha@smartbank.in");
  T.check("5 observers by default", buildSubject(rUser, db.selectOne("accounts", a => a.accNo === ram.accNo))
                                      .getObserverNames().length === 5);
  saveAlertPrefs(rUser.id, { sms: false, email: false, push: true, lowBalance: true });
  T.check("prefs saved in the users table", userBy("ramesh@smartbank.in").alertPrefs.sms === false);
  T.check("Sneha's prefs untouched", getAlertPrefs(sUser).sms === true);
  loginAs("ramesh@smartbank.in", 0);
  const rSms = db.select("notifications", n => n.userId === rUser.id && n.channel === "SMS").length;
  const sSms = db.select("notifications", n => n.userId === sUser.id && n.channel === "SMS").length;
  r = fc.transact(B().debit().type("Transfer").amount(500).via("transfer", "upi").to(sneha.accNo).remark("x").build());
  T.check("Ramesh (SMS off) got no SMS",
          r.ok && db.select("notifications", n => n.userId === rUser.id && n.channel === "SMS").length === rSms);
  T.check("Sneha (SMS on) got her SMS",
          db.select("notifications", n => n.userId === sUser.id && n.channel === "SMS").length === sSms + 1);
  saveAlertPrefs(rUser.id, DEFAULT_ALERT_PREFS);
  T.check("Database Logger can never be switched off",
          buildSubject(Object.assign({}, rUser, { alertPrefs: { sms: false, email: false, push: false, lowBalance: false } }),
                       db.selectOne("accounts", a => a.accNo === ram.accNo)).getObserverNames().join() === "Database Logger");

  const am = loginAs("amit@smartbank.in", 0);
  const lowBefore = db.select("notifications", n => n.userId === am.user.id && n.channel === "Alert").length;
  r = fc.transact(B().debit().type("Withdrawal").amount(bal(am.accNo) - 500).mode("Branch Counter")
                    .remark("drain").build());
  const lowAfter = db.select("notifications", n => n.userId === am.user.id && n.channel === "Alert").length;
  T.check("low balance warning fires when balance drops below minimum (Rs. 500 < Rs. 1,000)",
          r.ok && near(bal(am.accNo), 500) && lowAfter === lowBefore + 1, r.error);
  r = fc.transact(B().credit().type("Deposit").amount(100).mode("Cash").remark("x").build());
  T.check("warning repeats while still below minimum (Rs. 600)",
          r.ok && db.select("notifications", n => n.userId === am.user.id && n.channel === "Alert").length === lowAfter + 1);
  r = fc.transact(B().credit().type("Deposit").amount(1000).mode("Cash").remark("x").build());
  T.check("no warning once balance is back above minimum (Rs. 1,600)",
          r.ok && db.select("notifications", n => n.userId === am.user.id && n.channel === "Alert").length === lowAfter + 1);

  /* ------------------------------------------------------------ */
  T.section("Monthly fee (Facade + Decorator)");
  const s2 = loginAs("sneha@smartbank.in", 0);
  start = bal(s2.accNo);
  r = fc.chargeMonthlyFee(s2.accNo);
  T.check("Rs. 68 fee charged to Sneha", r.ok && near(bal(s2.accNo), start - 68), r.error);
  T.check("account without add-ons has no fee", !fc.chargeMonthlyFee(amitA.accNo).ok);

  /* ------------------------------------------------------------ */
  T.section("Abstract Factory");
  for (const code of ["web", "mobile", "atm"]) {
    const f = getChannelFactory(code);
    const prefix = { web: "Web", mobile: "Mobile", atm: "ATM" }[code];
    T.check(f.getName() + ": theme, layout and wording come from one family",
            f.createTheme().constructor.name === prefix + "Theme" &&
            f.createLayout().constructor.name === prefix + "Layout" &&
            f.createWording().constructor.name === prefix + "Wording");
  }

  /* ------------------------------------------------------------ */
  T.section("Security");
  T.check("esc() neutralises HTML", esc('<img src=x onerror="a()">') === "&lt;img src=x onerror=&quot;a()&quot;&gt;");
  const evil = txnRowHtml({ txnId: "T1", type: "Deposit", mode: "<b>m</b>", approvedBy: "x", status: "APPROVED",
                            direction: "credit", amount: 1, fee: 0, balance: 1,
                            remark: "<script>alert(1)</script>", time: "now" });
  T.check("transaction rows never contain raw HTML from user input",
          evil.indexOf("<script>") === -1 && evil.indexOf("<b>m</b>") === -1);
  T.check("CSV cells are quoted and formula-safe", csvCell('=1+1') === '"\'=1+1"' && csvCell('a"b') === '"a""b"');

  /* ------------------------------------------------------------ */
  T.section("Edge cases");
  r = fc.register({ name: "Rohit Verma", email: "rohit@test.in", mobile: "9988776655",
                    password: "pass1", confirm: "pass1", type: "Savings", opening: 2000 });
  const rohitSecond = fc.openAccount("Current", 20000);
  fc.setStatus(r.account.accNo, "Closed");
  sm.logout();
  r = fc.login("rohit@test.in", "pass1");
  T.check("login skips a closed first account", r.ok && sm.get().accNo === rohitSecond.account.accNo,
          sm.get() && sm.get().accNo);

  const amit2 = loginAs("amit@smartbank.in", 0);
  fc.setFeatures(amit2.accNo, ["overdraft"]);
  r = fc.transact(B().debit().type("Withdrawal").amount(bal(amit2.accNo) + 2000).mode("Branch Counter").remark("od").build());
  const neg = fc.applyInterest(amit2.accNo, 1);
  T.check("no interest on a negative balance, with a clear reason",
          r.ok && bal(amit2.accNo) < 0 && !neg.ok && /Rs\. 0/.test(neg.error), neg.error);
  fc.undoLast();
  fc.setFeatures(amit2.accNo, []);
  T.check("overdraft undo brings balance back", bal(amit2.accNo) >= 0);

  /* ------------------------------------------------------------ */
  T.section("Clearing alerts");
  const others = db.select("notifications", n => n.userId !== rUser.id).length;
  db.deleteRows("notifications", db.select("notifications", n => n.userId === rUser.id).map(n => n.id));
  T.check("clearing my alerts leaves other customers' alerts alone",
          db.select("notifications", n => n.userId === rUser.id).length === 0 &&
          db.select("notifications", n => n.userId !== rUser.id).length === others && others > 0);

  /* ------------------------------------------------------------ */
  T.section("Final ledger check");
  checkLedger("for every account");
  T.log("Accounts: " + db.count("accounts") + ", transactions: " + db.count("transactions") +
        ", alerts: " + db.count("notifications") + ", access logs: " + db.count("access_log"));

  sm.logout();
}
