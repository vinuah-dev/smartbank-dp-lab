/* ==========================================================
   app.js  -  SmartBank glue code
   Yahan saare patterns ek saath kaam karte hain.
   Ise sabse last me load karna hai.
   ========================================================== */


/* ---------------- chhote helpers ---------------- */

function money(n) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// user ka likha text HTML me daalne se pehle safe banao (XSS se bachav)
function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function maskAcc(accNo) {
  return "XXXX" + String(accNo).slice(-4);
}

function newTxnId() {
  const db = DatabaseConnection.getInstance();
  return "TXN" + String(db.count("transactions") + 1001);
}

function $(id) {
  return document.getElementById(id);
}

function go(page) {
  if (typeof window !== "undefined" && window.location) window.location.href = page;
}

function toast(message, kind) {
  const box = typeof document !== "undefined" ? $("toast") : null;
  if (!box) return;
  box.textContent = message;
  box.className = "toast show " + (kind || "ok");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.className = "toast"; }, 3500);
}

// "2026-10-16" jaisa local date (daily limit ke liye)
function localDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
         String(d.getDate()).padStart(2, "0");
}

// browser tab ka chhota icon
(function addFavicon() {
  if (typeof document === "undefined" || !document.head || !document.createElement) return;
  const link = document.createElement("link");
  link.rel  = "icon";
  link.href = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="6" fill="#1a4d8f"/>' +
    '<text x="16" y="21" font-size="13" font-family="Arial" font-weight="bold" ' +
    'fill="#fff" text-anchor="middle">SB</text></svg>');
  document.head.appendChild(link);
})();


/* ---------------- kaun si transaction daily limit me ginti hai ---------------- */

const LIMIT_TYPES   = ["Withdrawal", "Transfer", "Bill Payment", "Mobile Recharge"];
const SYSTEM_DEBITS = ["Service Charge"];

function debitedToday(accNo) {
  const today = localDayKey(new Date());
  return DatabaseConnection.getInstance()
    .select("transactions", t =>
      t.accNo === accNo && t.status === "APPROVED" && !t.reversed &&
      t.direction === "debit" && LIMIT_TYPES.indexOf(t.type) !== -1 &&
      t.ts && localDayKey(t.ts) === today)
    .reduce((sum, t) => sum + t.amount + (t.fee || 0), 0);
}


/* ==========================================================
   PEHLI BAAR KA DEMO DATA
   Users, accounts, aur pichle kuch dino ki transactions -
   taaki demo ke time dashboard khaali na dikhe. Purani
   transactions bhi asli engine se hi banti hain (sab patterns
   ke through), bas baad me unki date peeche kar dete hain.
   ========================================================== */

function seedDatabase() {
  const db = DatabaseConnection.getInstance();
  db.connect();

  if (db.count("users") > 0) return false;      // pehle se bana hua hai

  const session = SessionManager.getInstance();
  const saved   = session.snapshot();

  const makeUser = function (u) {
    const salt = makeSalt();
    return db.insert("users", {
      name: u.name, email: u.email, mobile: u.mobile,
      password: hashPassword(u.password, salt), salt: salt,
      role: u.role || "customer", designation: u.designation || null,
      alertPrefs: Object.assign({}, DEFAULT_ALERT_PREFS),
      failedLogins: 0, lockedUntil: 0, createdAt: new Date().toISOString()
    });
  };

  const demoUsers = [
    { key: "ramesh", name: "Ramesh Kumar", email: "ramesh@smartbank.in", mobile: "+91-9876543210",
      password: "1234", accounts: [["Savings", 45000, ["cashback"]], ["Fixed Deposit", 100000, []]] },
    { key: "sneha", name: "Sneha Patil", email: "sneha@smartbank.in", mobile: "+91-9812345678",
      password: "1234", accounts: [["Current", 80000, ["overdraft", "rewards"]]] },
    { key: "amit", name: "Amit Rao", email: "amit@smartbank.in", mobile: "+91-9765432109",
      password: "1234", accounts: [["Savings", 12000, []]] }
  ];

  const people = {};
  for (const u of demoUsers) {
    const user = makeUser(u);
    people[u.key] = { user: user, accounts: [] };

    for (const [type, open, features] of u.accounts) {
      // FACTORY METHOD se account banaya
      const made = getAccountFactory(type).openAccount(user.id, open);
      const row  = db.selectOne("accounts", a => a.accNo === made.account.accNo);
      if (features.length > 0) db.update("accounts", row.id, { features: features });   // DECORATOR
      people[u.key].accounts.push(row.accNo);
    }
  }

  // bank ka staff - ye Bank Console me jaata hai
  makeUser({ name: "Meena Joshi", email: "manager@smartbank.in", mobile: "+91-9700000001",
             password: "admin", role: "staff", designation: "Branch Manager" });

  // accounts ek mahina pehle khule the
  backdate(0, 30, 0);
  const opened = new Date(); opened.setDate(opened.getDate() - 30);
  for (const a of db.selectAll("accounts")) {
    db.update("accounts", a.id, { openedOn: opened.toLocaleDateString() });
  }

  // ---- pichle hafte ki transactions (asli engine se) ----
  const B = () => TransactionBuilder.create();
  const plan = [
    ["ramesh", 0, 6, B().debit().type("Bill Payment").amount(1850).via("bill", "upi")
                     .remark("Mahanagar Electricity bill")
                     .context({ biller: "Mahanagar Electricity", consumerNo: "MH-4457821" })],
    ["sneha",  0, 5, B().debit().type("Withdrawal").amount(15000).mode("Branch Counter")
                     .remark("Office expenses")],
    ["ramesh", 0, 5, B().debit().type("Transfer").amount(5000).via("transfer", "upi")
                     .to(people.sneha.accounts[0]).remark("Rent share")],
    ["amit",   0, 4, B().credit().type("Deposit").amount(2000).mode("Cash at Branch")
                     .remark("Cash deposit")],
    ["ramesh", 0, 3, B().credit().type("Deposit").amount(12000).mode("Cheque")
                     .remark("Freelance payment")],
    ["sneha",  0, 3, B().debit().type("Bill Payment").amount(4200).via("bill", "netbank")
                     .remark("SpeedNet Broadband bill")
                     .context({ biller: "SpeedNet Broadband", consumerNo: "SN-882101" })],
    ["ramesh", 0, 2, B().debit().type("Mobile Recharge").amount(299).via("recharge", "card")
                     .remark("Recharge for +91-9876543210").context({ mobile: "+91-9876543210" })],
    ["amit",   0, 2, B().debit().type("Mobile Recharge").amount(199).via("recharge", "upi")
                     .remark("Recharge for +91-9765432109").context({ mobile: "+91-9765432109" })],
    ["sneha",  0, 1, B().debit().type("Transfer").amount(2500).via("transfer", "wallet")
                     .to(people.amit.accounts[0]).remark("Dinner split")
                     .context({ walletId: "sneha@quickpay" })],
    ["ramesh", 0, 1, B().debit().type("Withdrawal").amount(3000).mode("ATM")
                     .remark("Withdrawal from ATM")]
  ];

  const facade = BankingFacade.getInstance();
  plan.forEach(function (step, i) {
    const who = people[step[0]];
    const before = lastIds();
    session.login(who.user.id, who.accounts[step[1]]);
    facade.transact(step[3].build());
    backdate(before, step[2], i);
  });

  // seed wali transactions undo list me nahi aani chahiye
  db.truncate("command_log");
  session.restore(saved);
  return true;

  function lastIds() {
    const max = t => db.selectAll(t).reduce((m, r) => Math.max(m, r.id), 0);
    return { transactions: max("transactions"), notifications: max("notifications") };
  }

  // jo rows `after` ke baad bani unki date `daysAgo` din peeche kar do
  function backdate(after, daysAgo, slot) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(9 + (slot % 9), (slot * 17) % 60, 0, 0);
    const ts = d.toISOString(), time = d.toLocaleString();

    const tAfter = typeof after === "number" ? after : after.transactions;
    const nAfter = typeof after === "number" ? after : after.notifications;

    for (const t of db.select("transactions", r => r.id > tAfter)) {
      db.update("transactions", t.id, { ts: ts, time: time });
    }
    for (const n of db.select("notifications", r => r.id > nAfter)) {
      db.update("notifications", n.id, { time: time, read: true });
    }
  }
}


/* ---------------- login ki jaanch ---------------- */

function requireLogin() {
  const session = SessionManager.getInstance();
  const db      = DatabaseConnection.getInstance();
  const user    = session.isLoggedIn() ? session.getUser() : null;

  if (user === null) {                    // login nahi, ya database reset ho gaya tha
    session.logout();
    go("index.html");
    return false;
  }

  // customer ka active account sahi hona chahiye
  if (user.role !== "staff") {
    const acc = session.getAccount();
    if (acc === null || acc.userId !== user.id) {
      const first = db.selectOne("accounts", a => a.userId === user.id);
      if (first === null) { session.logout(); go("index.html"); return false; }
      session.switchAccount(first.accNo);
    }
  }
  return true;
}

function isStaff() {
  const user = SessionManager.getInstance().getUser();
  return user !== null && user.role === "staff";
}

// sirf customer wale pages (staff ka koi account nahi hota)
function requireCustomer() {
  if (!requireLogin()) return false;
  if (isStaff()) { go("admin.html"); return false; }
  return true;
}

function requireStaff() {
  if (!requireLogin()) return false;
  if (!isStaff()) { go("dashboard.html"); return false; }
  return true;
}


/* ---------------- header har page par ---------------- */

function dbBadge() {
  const db = DatabaseConnection.getInstance();
  return db.isSQLite()
    ? '<span class="dbpill sqlite" title="' + esc(db.getDriverName()) + '">DB: SQLite</span>'
    : '<span class="dbpill local" title="Server ke bina chal raha hai - data browser me save hota hai">' +
      'DB: Browser</span>';
}

function renderHeader(active) {
  const session = SessionManager.getInstance();
  const config  = BankConfig.getInstance();
  const user    = session.getUser();
  const db      = DatabaseConnection.getInstance();

  if (user === null) return renderPublicHeader(active);

  // ABSTRACT FACTORY : channel ke hisaab se poora look badalta hai
  const channel = session.getChannel();
  const applied = applyChannel(channel);

  const unread = db.select("notifications", n => n.userId === user.id && !n.read).length;
  const staff  = user.role === "staff";

  const links = staff
    ? [["admin.html", "Bank Console"], ["database.html", "Database"], ["patterns.html", "DP Lab"]]
    : [
        ["dashboard.html", "Dashboard"],
        ["accounts.html",  "My Accounts"],
        ["banking.html",   "Deposit / Withdraw"],
        ["transfer.html",  "Transfer"],
        ["payments.html",  "Bill &amp; Recharge"],
        ["history.html",   "History"],
        ["settings.html",  "Settings"],
        ["patterns.html",  "DP Lab"]
      ];

  let nav = "";
  for (const [href, label] of links) {
    nav += '<a href="' + href + '"' + (active === href ? ' class="active"' : "") + ">" + label + "</a>";
  }

  // ---- account switcher (ek user ke kai account ho sakte hain) ----
  let switcher = "";
  if (!staff) {
    const mine = db.select("accounts", a => a.userId === user.id);
    const now  = session.get().accNo;

    switcher = '<select id="accPick" class="channel-pick" title="Active account">';
    for (const a of mine) {
      switcher += '<option value="' + esc(a.accNo) + '"' + (a.accNo === now ? " selected" : "") + ">" +
                  esc(a.accNo) + " - " + esc(a.type) +
                  (a.status && a.status !== "Active" ? " (" + esc(a.status) + ")" : "") + "</option>";
    }
    switcher += "</select>";
  }

  $("site-header").innerHTML =
    '<div class="topbar">' +
      '<div class="brand">' +
        '<span class="logo">SB</span>' +
        '<div><b>' + esc(config.bankName) + (staff ? " Staff" : "") + '</b> ' + dbBadge() +
        '<div class="tagline">' + esc(staff ? user.designation : applied.wording.tagline()) + '</div></div>' +
      '</div>' +
      '<div class="topbar-right">' +
        switcher +
        (staff ? "" :
          '<select id="channelPick" class="channel-pick" title="Abstract Factory - channel skin">' +
            '<option value="web"' + (channel === "web" ? " selected" : "") + '>Web Portal</option>' +
            '<option value="mobile"' + (channel === "mobile" ? " selected" : "") + '>Mobile App</option>' +
            '<option value="atm"' + (channel === "atm" ? " selected" : "") + '>ATM Machine</option>' +
          '</select>' +
          '<a href="notifications.html" class="bell" title="Notifications">' +
            'Alerts' + (unread > 0 ? '<span class="dot">' + unread + '</span>' : '') +
          '</a>') +
        '<span class="who">' + esc(user.name) + '</span>' +
        '<button class="btn small ghost" onclick="doLogout()">Logout</button>' +
      '</div>' +
    '</div>' +
    '<nav class="mainnav">' + nav + '</nav>' +
    storageWarning();

  if (!staff) {
    $("channelPick").onchange = function () {
      session.setChannel(this.value);
      window.location.reload();
    };
    $("accPick").onchange = function () {
      session.switchAccount(this.value);
      window.location.reload();
    };
  }
}

// bina login wale pages (DP Lab) ke liye
function renderPublicHeader(active) {
  applyChannel("web");
  $("site-header").innerHTML =
    '<div class="topbar">' +
      '<div class="brand"><span class="logo">SB</span>' +
        '<div><b>SmartBank</b> ' + dbBadge() + '<div class="tagline">Design Patterns Lab Project</div></div>' +
      '</div>' +
      '<div class="topbar-right"><a href="index.html"><button class="btn small ghost">Login</button></a></div>' +
    '</div>' +
    '<nav class="mainnav">' +
      '<a href="index.html">Login</a>' +
      '<a href="patterns.html"' + (active === "patterns.html" ? ' class="active"' : "") + '>DP Lab</a>' +
    '</nav>' + storageWarning();
}

function storageWarning() {
  return Store.persistent ? "" :
    '<div class="warnbar">Is browser me localStorage band hai, isliye data save nahi hoga. ' +
    'start.bat se server chalao ya file ko normal browser me kholo.</div>';
}

function doLogout() {
  SessionManager.getInstance().logout();
  go("index.html");
}


/* ==========================================================
   MAIN ENGINE
   Har transaction yahan se guzarta hai. Ek hi function me
   poora system kaam karta hai:

     SINGLETON    -> config, DB aur session ek hi jagah se
     PROXY        -> account ko safely access karna
     DECORATOR    -> account ke add-on features lagana
     BRIDGE       -> payment gateway se paisa bhejna
     ADAPTER      -> third party wallet ko gateway jaisa banana
     STATE        -> account Active/Frozen/Closed check
     CHAIN OF R.  -> debit ki approval lena
     OBSERVER     -> sabko notify karna + DB me save karna

   Ise seedha mat bulao - BankingFacade.transact() use karo,
   taaki COMMAND pattern wala undo bhi kaam kare.
   ========================================================== */

function executeTransaction(options) {
  const session = SessionManager.getInstance();
  const db      = DatabaseConnection.getInstance();
  const user    = session.getUser();

  const result = { ok: false, steps: [], trail: [], error: "", fee: 0,
                   userId: user.id, patterns: ["Singleton"] };
  const used = p => { if (result.patterns.indexOf(p) === -1) result.patterns.push(p); };
  const fail = msg => { result.error = msg; return result; };

  // ---- 1. PROXY : direct account object nahi milega ----
  const proxy   = new AccountProxy(session.get().accNo, user.id);
  const details = proxy.getDetails();
  used("Proxy");

  if (details === null) return fail(proxy.lastError);

  result.accNo = details.accNo;
  result.steps.push({ tag: "Proxy", text: "Access check pass hua, account " + details.accNo + " khula" });

  const amount = Math.round(Number(options.amount) * 100) / 100;
  if (!isFinite(amount) || amount <= 0) return fail("Sahi amount daaliye.");
  if (amount > 10000000)                return fail("Ek baar me Rs. 1 crore se zyada ki transaction nahi ho sakti.");

  // ---- 2. DECORATOR : account par lage hue features padho ----
  const decorated  = decorateAccount(details);
  const extraLimit = decorated.getExtraLimit();

  if (decorated.getFeatureNames().length > 0) {
    used("Decorator");
    result.steps.push({ tag: "Decorator",
      text: decorated.getDescription() +
            (extraLimit > 0 ? "  (overdraft Rs. " + money(extraLimit) + " available)" : "") });
  }

  // ---- 3. transfer ho to paisa jaane se PEHLE beneficiary check ----
  let target = null;
  if (options.toAccount) {
    target = db.selectOne("accounts", a => a.accNo === options.toAccount);
    if (target === null)                 return fail("Beneficiary account " + options.toAccount + " nahi mila.");
    if (target.accNo === details.accNo)  return fail("Usi account me transfer nahi kar sakte.");
    const canTake = getAccountState(target.status).canCredit();
    if (!canTake.ok)                     return fail("Beneficiary account: " + canTake.reason + ".");
  }

  let fee     = 0;
  let payment = null;

  // ---- 4. BRIDGE : abstraction ko implementation se joda ----
  if (options.gatewayCode) {
    const gateway = getGateway(options.gatewayCode);
    payment = getPayment(options.paymentType, gateway);   // <-- bridge bana
    used("Bridge");
    if (gateway instanceof WalletGatewayAdapter) used("Adapter");

    fee = gateway.getFee(amount);
    result.fee     = fee;
    result.gateway = gateway.getName();
    result.payType = payment.getType();
  }

  const totalDebit = amount + fee;

  const logRejected = function (why) {
    used("Observer");
    new DatabaseLoggerObserver().update({
      txnId: newTxnId(), accNo: details.accNo, userId: user.id,
      type: options.type, direction: options.direction, amount: amount,
      fee: fee, balance: details.balance, mode: options.mode,
      status: "REJECTED", approvedBy: "-", remark: options.remark + (why ? " (" + why + ")" : "")
    });
  };

  // ---- 5. STATE + CHAIN OF RESPONSIBILITY : approval ----
  let approval = null;
  used("State");
  if (options.direction === "debit") {
    const limited = LIMIT_TYPES.indexOf(options.type) !== -1;

    approval = requestApproval({
      amount:        totalDebit,
      balance:       details.balance,
      dailyLimit:    details.dailyLimit,
      usedToday:     limited ? debitedToday(details.accNo) : 0,
      systemDebit:   SYSTEM_DEBITS.indexOf(options.type) !== -1,
      accountType:   details.type,
      accountStatus: details.status,        // STATE
      extraLimit:    extraLimit,            // DECORATOR (overdraft)
      purpose:       options.type
    });
    used("Chain of Responsibility");
    result.trail = approval.trail;

    if (approval.status !== "APPROVED") {
      logRejected("");                      // reject hua transaction bhi audit ke liye DB me
      return fail("Transaction reject ho gaya.");
    }
  } else {
    // credit par bhi state check zaroori hai (closed account)
    const allowed = getAccountState(details.status).canCredit();
    if (!allowed.ok) {
      result.trail = [{ by: "Account Status", action: "Rejected - " + allowed.reason }];
      return fail(allowed.reason);
    }
  }

  // ---- 6. BRIDGE ka asli processing (gateway ki apni limit bhi hoti hai) ----
  if (payment !== null) {
    const run = payment.execute(amount, options.ctx || {});
    for (const s of run.steps) result.steps.push({ tag: payment.gateway instanceof WalletGatewayAdapter &&
                                                        /^Adapter|QuickPay/.test(s) ? "Adapter" : "Bridge", text: s });
    if (!run.ok) {
      logRejected("gateway: " + run.error);
      return fail(run.error);
    }
  }

  // ---- 7. PROXY ke through balance update ----
  let newBalance;
  if (options.direction === "debit") {
    newBalance = proxy.debit(totalDebit);
    result.steps.push({ tag: "Proxy",
      text: "Rs. " + money(totalDebit) + " debit hua (fee Rs. " + money(fee) + " included)" });
  } else {
    newBalance = proxy.credit(amount);
    result.steps.push({ tag: "Proxy", text: "Rs. " + money(amount) + " credit hua" });
  }

  const points = options.direction === "debit" ? decorated.getRewardPoints(amount) : 0;

  // ---- 8. OBSERVER : sabko khabar do + database me save ----
  const account = session.getAccount();
  const subject = buildSubject(user, account);
  used("Observer");

  const event = {
    txnId:      newTxnId(),
    accNo:      details.accNo,
    userId:     user.id,
    holder:     user.name,
    type:       options.type,
    direction:  options.direction,
    amount:     amount,
    fee:        fee,
    balance:    newBalance,
    mode:       options.mode,
    status:     "APPROVED",
    approvedBy: approval ? approval.approvedBy : "System",
    remark:     options.remark,
    toAccount:  options.toAccount || null,
    points:     points
  };

  const notified = subject.notify(event);
  result.steps.push({ tag: "Observer",
    text: notified + " observers ko notify kiya: " + subject.getObserverNames().join(", ") });

  // Database Logger ne jo row daali uska id chahiye (undo ke liye)
  const saved = db.select("transactions", t => t.txnId === event.txnId);
  result.txnRowId = saved.length > 0 ? saved[saved.length - 1].id : null;

  // ---- 9. transfer : samne wale ke account me paisa + uski apni entry ----
  if (target !== null) {
    const fresh   = db.selectOne("accounts", a => a.id === target.id);
    const tUser   = db.selectOne("users", u => u.id === fresh.userId);
    const tBal    = fresh.balance + amount;
    db.update("accounts", fresh.id, { balance: tBal });

    const tEvent = {
      txnId: newTxnId(), accNo: fresh.accNo, userId: fresh.userId,
      holder: tUser ? tUser.name : "Customer", type: "Transfer In", direction: "credit",
      amount: amount, fee: 0, balance: tBal, mode: options.mode, status: "APPROVED",
      approvedBy: "System", remark: "From " + user.name + " (" + details.accNo + ")",
      parentTxnId: event.txnId
    };
    // paane wale ki apni alert settings ke hisaab se uske observers
    if (tUser) buildSubject(tUser, Object.assign({}, fresh, { balance: tBal })).notify(tEvent);
    else       new DatabaseLoggerObserver().update(tEvent);

    result.steps.push({ tag: "Observer",
      text: "Rs. " + money(amount) + " " + fresh.accNo + " me jama hua, unke liye entry " +
            tEvent.txnId + " bani aur unhe bhi alert gaya" });
  }

  // ---- 10. DECORATOR ke faayde : reward points aur cashback ----
  if (points > 0) {
    const fresh = db.selectOne("accounts", a => a.accNo === details.accNo);
    db.update("accounts", fresh.id, { rewardPoints: (fresh.rewardPoints || 0) + points });
    result.points = points;
    result.steps.push({ tag: "Decorator", text: points + " reward points mile" });
  }

  const cashback = options.direction === "debit" ? decorated.getCashback(options.type, amount) : 0;
  if (cashback > 0) {
    newBalance = proxy.credit(cashback);
    result.cashback = cashback;
    result.steps.push({ tag: "Decorator", text: "Rs. " + money(cashback) + " cashback wapas jama hua" });

    // cashback ki apni entry bhi banti hai (parent se judi hui)
    subject.notify({
      txnId: newTxnId(), accNo: details.accNo, userId: user.id,
      holder: user.name, type: "Cashback", direction: "credit",
      amount: cashback, fee: 0, balance: newBalance, mode: "Auto Credit",
      status: "APPROVED", approvedBy: "System",
      remark: "Cashback on " + event.txnId, parentTxnId: event.txnId
    });
  }

  result.ok         = true;
  result.txnId      = event.txnId;
  result.balance    = newBalance;
  result.approvedBy = event.approvedBy;
  result.observers  = subject.getObserverNames();

  return result;
}


/* ---------------- result dikhane wala common UI ---------------- */

const PATTERN_PIPELINE = ["Builder", "Facade", "Command", "Singleton", "Proxy", "Decorator",
                          "Bridge", "Adapter", "State", "Chain of Responsibility", "Observer"];

function pipelineHtml(usedList) {
  usedList = usedList || [];
  return '<div class="pipeline" title="Is transaction me kaun kaun se patterns chale">' +
    PATTERN_PIPELINE.map(p =>
      '<span class="pchip' + (usedList.indexOf(p) !== -1 ? " on" : "") + '">' + p + "</span>"
    ).join('<span class="parrow">&rsaquo;</span>') + "</div>";
}

function renderResult(target, result) {
  let html = "";

  if (result.ok) {
    html += '<div class="result ok"><b>Transaction Successful</b><br>' +
            'Reference: ' + esc(result.txnId) +
            ' &nbsp;|&nbsp; Approved by: ' + esc(result.approvedBy) +
            ' &nbsp;|&nbsp; New Balance: Rs. ' + money(result.balance) +
            (result.cashback ? '<br>Cashback mila: Rs. ' + money(result.cashback) : '') +
            (result.points ? '<br>Reward points mile: ' + result.points : '') +
            '</div>';
  } else {
    html += '<div class="result bad"><b>Transaction Failed</b><br>' + esc(result.error) + '</div>';
  }

  if (result.patterns && result.patterns.length > 0) {
    html += '<h4>Patterns jo is transaction me chale</h4>' + pipelineHtml(result.patterns);
  }

  if (result.payType) {
    html += '<h4>Payment route <span class="hint">(Bridge)</span></h4>' +
            '<p style="font-size:13.5px">Abstraction <b>' + esc(result.payType) +
            '</b> + Implementation <b>' + esc(result.gateway) +
            '</b> &nbsp;|&nbsp; gateway fee Rs. ' + money(result.fee) + '</p>';
  }

  if (result.trail && result.trail.length > 0) {
    html += '<h4>Approval chain <span class="hint">(Chain of Responsibility)</span></h4><ol class="trail">';
    for (const t of result.trail) {
      html += "<li><b>" + esc(t.by) + ":</b> " + esc(t.action) + "</li>";
    }
    html += "</ol>";
  }

  if (result.steps && result.steps.length > 0) {
    html += '<h4>Behind the scenes</h4><ul class="steps">';
    for (const s of result.steps) {
      html += '<li><span class="tag">' + esc(s.tag) + '</span>' + esc(s.text) + "</li>";
    }
    html += "</ul>";
  }

  target.innerHTML = html;
  if (target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}


/* ---------------- transaction row ka common HTML ---------------- */

function txnRowHtml(t, opts) {
  opts = opts || {};
  const ok   = t.status === "APPROVED";
  const sign = t.direction === "credit" ? "+" : "-";

  let statusPill = '<span class="pill ' + (ok ? "green" : "red") + '">' + esc(t.status) + "</span>";
  if (t.reversed) statusPill += ' <span class="pill grey">REVERSED</span>';

  let row = "<tr>" +
    "<td>" + esc(t.txnId) + "</td>" +
    (opts.showAccount ? "<td>" + esc(t.accNo) + "</td>" : "") +
    "<td>" + esc(t.type) + "</td>" +
    "<td>" + esc(t.mode) + "</td>" +
    "<td>" + esc(t.approvedBy) + "</td>" +
    "<td>" + statusPill + "</td>" +
    '<td class="num ' + (t.direction === "credit" ? "cr" : "dr") + '">' + sign + " Rs. " + money(t.amount) + "</td>" +
    '<td class="num">Rs. ' + money(t.fee || 0) + "</td>" +
    '<td class="num">Rs. ' + money(t.balance) + "</td>" +
    "<td>" + esc(t.remark) + "</td>" +
    "<td>" + esc(t.time) + "</td>";

  if (opts.actions) {
    row += "<td>" + (canReverseRow(t)
      ? '<button class="btn small red" onclick="doReverse(' + Number(t.id) + ')">Reverse</button>'
      : '<span class="hint">' + (t.parentTxnId && !t.reversed && t.type !== "Reversal"
                                  ? "linked to " + esc(t.parentTxnId) : "-") + "</span>") + "</td>";
  }

  return row + "</tr>";
}


/* ---------------- statement CSV download ---------------- */

function csvCell(value) {
  let s = String(value === undefined || value === null ? "" : value);
  if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s;       // Excel formula injection se bachav
  return '"' + s.replace(/"/g, '""') + '"';
}

function downloadCSV(rows, filename) {
  const head = ["Ref", "Account", "Type", "Mode", "Approved By", "Status",
                "Direction", "Amount", "Fee", "Balance", "Remark", "Time"];

  const lines = [head.map(csvCell).join(",")];
  for (const t of rows) {
    lines.push([t.txnId, t.accNo, t.type, t.mode, t.approvedBy,
                t.reversed ? "REVERSED" : t.status, t.direction,
                t.amount, t.fee || 0, t.balance, t.remark, t.time].map(csvCell).join(","));
  }

  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href     = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}


/* ---------------- chhota bar chart (bina kisi library ke) ---------------- */

function miniChart(rows) {
  if (rows.length === 0) {
    return '<p class="empty">Chart ke liye kam se kam ek transaction chahiye.</p>';
  }

  const data = rows.slice(0, 8).reverse();
  const max  = Math.max.apply(null, data.map(t => t.amount));
  const W = 100 / data.length;

  let bars = "";
  data.forEach(function (t, i) {
    const h     = Math.max(4, Math.round((t.amount / max) * 92));
    const color = t.direction === "credit" ? "#1c7a3c" : "#b32d2d";

    bars += '<rect x="' + (i * W + W * 0.18).toFixed(2) + '%" y="' + (100 - h) + '%" ' +
            'width="' + (W * 0.64).toFixed(2) + '%" height="' + h + '%" ' +
            'fill="' + color + '" rx="2">' +
            "<title>" + esc(t.txnId + " - " + t.type + " Rs. " + money(t.amount)) + "</title>" +
            "</rect>";
  });

  let labels = "";
  data.forEach(function (t) {
    labels += '<span style="width:' + W.toFixed(2) + '%;text-align:center;' +
              'font-size:10px;color:var(--muted);overflow:hidden">' +
              (t.direction === "credit" ? "+" : "-") + money(t.amount) + "</span>";
  });

  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" ' +
         'aria-label="Last transactions bar chart" style="width:100%;height:130px;display:block">' +
         bars + "</svg>" +
         '<div style="display:flex">' + labels + "</div>" +
         '<p class="hint" style="margin-top:6px">Hara = paisa aaya, laal = paisa gaya. ' +
         'Bar par hover karo detail ke liye.</p>';
}
