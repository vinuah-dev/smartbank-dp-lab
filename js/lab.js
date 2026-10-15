/* ==========================================================
   lab.js  -  DP Lab page ke live demos aur code viewer

   Har "Run live demo" button asli classes ko chalata hai - koi
   nakli output nahi. Jin demos me paisa hilta hai (Observer,
   Command, poora flow) wo logged-in customer ke account par
   chalte hain; login na ho to demo customer ke account par.
   ========================================================== */


/* ---------------- chhota console helper ---------------- */
function labConsole(key) {
  const box = document.getElementById("out-" + key);
  box.innerHTML = "";
  const add = (text, cls) => {
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = text;
    box.appendChild(line);
  };
  return {
    line: t => add(t), ok: t => add(t, "ok"), bad: t => add(t, "bad"),
    info: t => add(t, "info"), warn: t => add(t, "warn"), sql: t => add(t, "sql"),
    gap: () => add(" ")
  };
}


/* ---------------- syntax highlight (sirf dikhane ke liye) ---------------- */
const JS_KEYWORDS = "class|extends|constructor|return|if|else|for|of|in|const|let|var|new|this|static|" +
                    "throw|function|null|true|false|super|typeof|instanceof|while|break|continue|try|catch|finally|do";

function highlightJS(src) {
  const re = new RegExp(
    "(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)" +                                   // comments
    "|(\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`)" + // strings
    "|\\b(" + JS_KEYWORDS + ")\\b" +                                                 // keywords
    "|\\b(\\d+(?:\\.\\d+)?)\\b" +                                                     // numbers
    "|\\b([A-Z][A-Za-z0-9_]*)\\b", "g");                                             // class names
  let out = "", last = 0, m;
  while ((m = re.exec(src)) !== null) {
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "n" : "t";
    out += '<span class="' + cls + '">' + esc(m[0]) + "</span>";
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}


/* ---------------- asli source code (Function.toString se) ---------------- */
const LAB_CODE = {
  singleton:       ["js/core.js",      () => [BankConfig, DatabaseConnection, SessionManager]],
  cor:             ["js/approval.js",  () => [ApprovalHandler, AccountStatusHandler, FraudCheckHandler,
                                                LimitApprover, ClerkApprover, buildApprovalChain]],
  factory:         ["js/accounts.js",  () => [AccountFactory, SavingsAccountFactory, FDAccountFactory,
                                                FixedDepositAccount, getAccountFactory]],
  proxy:           ["js/accounts.js",  () => [AccountService, AccountProxy, RealAccountService]],
  abstractFactory: ["js/channels.js",  () => [ChannelFactory, ATMFactory, MobileAppFactory, ATMTheme, applyChannel]],
  bridge:          ["js/payments.js",  () => [Payment, MoneyTransfer, PaymentGateway, UPIGateway, CardGateway, getPayment]],
  observer:        ["js/observer.js",  () => [TransactionObserver, SMSObserver, LowBalanceObserver,
                                                DatabaseLoggerObserver, TransactionSubject, buildSubject]],
  database:        ["js/core.js",      () => [StorageDriver, LocalStorageDriver, SQLiteServerDriver]],
  state:           ["js/state.js",     () => [AccountState, ActiveState, FrozenState, ClosedState, getAccountState]],
  strategy:        ["js/strategy.js",  () => [InterestStrategy, SimpleInterestStrategy, CompoundInterestStrategy,
                                                getInterestStrategy]],
  command:         ["js/command.js",   () => [Command, TransactionCommand, CommandInvoker, reverseTransactionRow]],
  decorator:       ["js/decorator.js", () => [AccountComponent, BasicAccount, AccountFeature, CashbackFeature,
                                                OverdraftFeature, decorateAccount]],
  adapter:         ["js/adapter.js",   () => [QuickPayWalletAPI, WalletGatewayAdapter]],
  facade:          ["js/facade.js",    () => [BankingFacade]],
  builder:         ["js/builder.js",   () => [TransactionBuilder]],
  engine:          ["js/app.js",       () => [executeTransaction]]
};

function toggleCode(key, button) {
  const box = document.getElementById("code-" + key);
  if (box.innerHTML === "") {
    const [file, list] = LAB_CODE[key];
    box.innerHTML = list().map(fn =>
      '<div class="code-title">' + esc(file) + "  →  " + esc(fn.name) + "</div>" +
      '<pre class="code">' + highlightJS(fn.toString()) + "</pre>").join("");
    box.hidden = false;
  } else {
    box.hidden = !box.hidden;
  }
  if (button) button.textContent = box.hidden ? "View code" : "Hide code";
}


/* ---------------- demo ke liye kaunsa customer ---------------- */
function withDemoCustomer(fallbackEmail, fn) {
  const db      = DatabaseConnection.getInstance();
  const session = SessionManager.getInstance();
  const me      = session.getUser();

  if (me && me.role !== "staff") return fn(session.getAccount(), me);

  // login nahi hai (ya staff hai) -> demo customer ke roop me, phir wapas
  const saved = session.snapshot();
  const user  = db.selectOne("users", u => u.email === fallbackEmail);
  const acc   = db.selectOne("accounts", a => a.userId === user.id);
  session.login(user.id, acc.accNo);
  try { return fn(acc, user); }
  finally { session.restore(saved); }
}

function sqlLogSince(id) {
  if (!DatabaseConnection.getInstance().isSQLite()) return [];
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "api/sql-log?since=" + id, false);
  xhr.send(null);
  return xhr.status === 200 ? JSON.parse(xhr.responseText).entries : [];
}
function lastSqlId() {
  const all = sqlLogSince(0);
  return all.length ? all[all.length - 1].id : 0;
}
function printSql(o, entries, max) {
  const writes = entries.filter(e => e.kind === "write");
  if (!DatabaseConnection.getInstance().isSQLite()) {
    o.warn("(Browser storage mode - asli SQL dekhne ke liye start.bat se server chalao)");
    return;
  }
  o.info("SQLite par chali queries (" + writes.length + " writes):");
  writes.slice(0, max || 12).forEach(e => o.sql("  " + e.sql));
  if (writes.length > (max || 12)) o.sql("  ... aur " + (writes.length - (max || 12)) + " queries");
}


/* ==========================================================
   DEMOS
   ========================================================== */

const LAB_DEMOS = {

  singleton() {
    const o = labConsole("singleton");
    const a = BankConfig.getInstance(), b = BankConfig.getInstance(), c = new BankConfig();
    o.info("BankConfig.getInstance() do baar + new BankConfig() ek baar:");
    o.line("  a === b  -> " + (a === b));
    o.line("  b === c  -> " + (b === c) + "   (new likhne par bhi wahi purana object mila)");
    o.line("  bank: " + a.bankName + ", IFSC " + a.ifsc + ", object bana tha " + a.bootTime + " par");
    o.gap();
    const d1 = DatabaseConnection.getInstance(), d2 = new DatabaseConnection();
    o.info("DatabaseConnection:");
    o.line("  same object -> " + (d1 === d2) + "   driver: " + d1.getDriverName());
    o.line("  is page par ab tak " + d1.queryCount + " queries isi ek connection se chali");
    o.gap();
    o.info("Baaki singletons:");
    o.line("  SessionManager  -> " + (SessionManager.getInstance() === new SessionManager()));
    o.line("  CommandInvoker  -> " + (CommandInvoker.getInstance() === new CommandInvoker()));
    o.line("  BankingFacade   -> " + (BankingFacade.getInstance() === new BankingFacade()));
    o.ok("Har class ka poori website me sirf ek object hai.");
  },

  cor(amount) {
    const o = labConsole("cor");
    amount = Number(amount || document.getElementById("corAmount").value);
    const frozen = document.getElementById("corFrozen").checked;
    o.info("requestApproval( Rs. " + money(amount) + (frozen ? ", account FROZEN" : "") + " )");
    const r = requestApproval({ amount: amount, balance: 5000000, dailyLimit: 5000000, usedToday: 0,
                                accountType: "Current", accountStatus: frozen ? "Frozen" : "Active", extraLimit: 0 });
    r.trail.forEach((t, i) => o[/^Rejected/.test(t.action) ? "bad" : /Approved|Passed/.test(t.action) ? "ok" : "warn"](
      "  " + (i + 1) + ". " + t.by.padEnd(15) + " " + t.action));
    o.gap();
    o[r.status === "APPROVED" ? "ok" : "bad"]("Result: " + r.status + (r.approvedBy && r.approvedBy !== "-" ? " by " + r.approvedBy : ""));
    o.line("(Ye sirf approval check hai - is demo me koi paisa nahi hila)");
  },

  factory() {
    const o = labConsole("factory");
    for (const type of ["Savings", "Current", "Fixed Deposit"]) {
      const factory = getAccountFactory(type);
      const acc = factory.createAccount("DEMO", 1, 50000);          // sirf object, DB me nahi
      o.info(factory.constructor.name + ".createAccount()  ->  " + acc.constructor.name);
      o.line("  min balance Rs. " + money(acc.getMinBalance()) + " | interest " + acc.getInterest() +
             "% | daily limit " + (acc.getDailyLimit() ? "Rs. " + money(acc.getDailyLimit()) : "N/A") +
             " | withdraw allowed: " + acc.canWithdraw());
    }
    o.gap();
    o.ok("Client ne kahin 'new SavingsAccount()' nahi likha - factory ne decide kiya.");
    o.line("openAccount() isi createAccount() ko bula kar DB me save + Account Opening entry banata hai.");
  },

  proxy() {
    const o = labConsole("proxy");
    const db = DatabaseConnection.getInstance();
    const ramesh = db.selectOne("users", u => u.email === "ramesh@smartbank.in");
    const sneha  = db.selectOne("users", u => u.email === "sneha@smartbank.in");
    const acc    = db.selectOne("accounts", a => a.userId === ramesh.id);

    const own = new AccountProxy(acc.accNo, ramesh.id);
    o.info("Ramesh apna account " + acc.accNo + " dekh raha hai:");
    o.line("  proxy bana, real object bana?  " + own.wasRealObjectCreated());
    const bal = own.getBalance();
    o.ok("  getBalance() -> Rs. " + money(bal) + "   (owner verified)");
    o.line("  ab real object bana?  " + own.wasRealObjectCreated() + "   <- lazy loading");
    o.gap();
    const spy = new AccountProxy(acc.accNo, sneha.id);
    o.info("Sneha wahi account " + acc.accNo + " kholne ki koshish karti hai:");
    o.bad("  getBalance() -> " + spy.getBalance() + "   (" + spy.lastError + ")");
    o.line("  real object bana?  " + spy.wasRealObjectCreated() + "   <- DB tak pahuncha hi nahi");
    o.gap();
    o.info("access_log table ki aakhri 2 rows (proxy ne likhi):");
    db.selectAll("access_log").slice(-2).forEach(l =>
      o[l.allowed ? "ok" : "bad"]("  " + l.operation + "  " + (l.allowed ? "ALLOWED" : "DENIED") + "  user " + l.userId + "  " + l.reason));
  },

  abstractFactory() {
    const o = labConsole("abstractFactory");
    const row = document.getElementById("skinPreview");
    row.innerHTML = "";
    for (const code of ["web", "mobile", "atm"]) {
      const f = getChannelFactory(code);
      const theme = f.createTheme(), layout = f.createLayout(), words = f.createWording();
      const vars = Object.assign({}, theme.vars(), layout.vars());
      const style = Object.keys(vars).map(k => k + ":" + vars[k]).join(";");
      row.innerHTML +=
        '<div class="skin" style="' + esc(style) + '">' +
          '<div class="bar">SmartBank &middot; ' + esc(words.tagline()) + "</div>" +
          '<div class="body"><b>' + esc(words.greeting("Ramesh Kumar")) + "</b><br>" +
            '<span style="color:var(--muted);font-size:12px">' + esc(words.balanceLabel()) + "</span><br>" +
            "<b>Rs. 46,864</b><br>" +
            '<span class="sbtn">' + esc(words.payButton()) + "</span></div>" +
        "</div>";
      o.info(f.constructor.name + " -> " + theme.constructor.name + " + " + layout.constructor.name +
             " + " + words.constructor.name);
    }
    o.ok("Har preview ek hi factory ki family se bana - mix nahi ho sakta.");
  },

  bridge(type, code) {
    const o = labConsole("bridge");
    const payment = getPayment(type, getGateway(code));
    const amount  = 1000;
    o.info("new " + payment.constructor.name + "( new " + payment.gateway.constructor.name + "() ).execute(Rs. 1,000)");
    const run = payment.execute(amount, { toAccount: "SB123456", biller: "Mahanagar Electricity",
                                          consumerNo: "MH-4457821", mobile: "+91-9876543210" });
    run.steps.forEach(s => o.line("  - " + s));
    o.ok("Total: Rs. " + money(payment.getTotal(amount)) + "  (fee Rs. " + money(payment.gateway.getFee(amount)) + ")");
    o.line("(Dry run - koi paisa nahi hila. Asli payment Transfer / Bills page se hota hai.)");
  },

  observer() {
    const o = labConsole("observer");
    const db = DatabaseConnection.getInstance();
    withDemoCustomer("amit@smartbank.in", function (acc, user) {
      const subject = buildSubject(user, acc);
      o.info("Customer: " + user.name + " (" + acc.accNo + ")");
      o.line("Attached observers: " + subject.getObserverNames().join(", "));
      const nBefore = db.selectAll("notifications").reduce((m, n) => Math.max(m, n.id), 0);
      const sqlBefore = lastSqlId();

      const r = BankingFacade.getInstance().transact(
        TransactionBuilder.create().credit().type("Deposit").amount(100)
          .mode("Cash at Branch").remark("DP Lab Observer demo").build());
      o.gap();
      o.ok("Rs. 100 deposit hua (" + r.txnId + "), subject ne notify() bulaya:");
      db.select("notifications", n => n.id > nBefore).forEach(n => o.line("  [" + n.channel + "] " + n.title));
      const row = db.selectOne("transactions", t => t.txnId === r.txnId);
      o.line("  [DB] transactions table me row id " + row.id + " (balance_after Rs. " + money(row.balance) + ")");
      o.gap();
      printSql(o, sqlLogSince(sqlBefore), 10);
    });
  },

  database() {
    const o = labConsole("database");
    const db = DatabaseConnection.getInstance();
    o.info("Driver: " + db.getDriverName());
    for (const t of db.tables) o.line("  " + t.padEnd(14) + " " + String(db.count(t)).padStart(4) + " rows");
    o.gap();
    if (db.isSQLite()) {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "api/sql", false);
      xhr.setRequestHeader("Content-Type", "application/json");
      const sql = "SELECT u.full_name, COUNT(t.id) AS txns, ROUND(SUM(t.amount)) AS total " +
                  "FROM users u JOIN transactions t ON t.user_id = u.id " +
                  "WHERE t.status = 'APPROVED' GROUP BY u.id ORDER BY total DESC";
      xhr.send(JSON.stringify({ sql: sql }));
      const res = JSON.parse(xhr.responseText);
      o.sql(sql);
      res.rows.forEach(rw => o.line("  " + String(rw[0]).padEnd(14) + " " + String(rw[1]).padStart(3) +
                                    " txns   Rs. " + money(rw[2])));
      o.ok("Ye asli SQL query SQLite file par chali.");
    } else {
      o.warn("Server mode me yahan asli SQL JOIN query chalti. Abhi browser storage chal raha hai.");
    }
  },

  state() {
    const o = labConsole("state");
    o.info("State".padEnd(8) + "canDebit  canCredit  canClose");
    for (const s of ALL_STATES) {
      const st = getAccountState(s);
      const yn = r => (r.ok ? "yes" : "no ").padEnd(10);
      o.line(st.getName().padEnd(8) + yn(st.canDebit()) + yn(st.canCredit()) + yn(st.canClose()));
    }
    o.gap();
    const r = requestApproval({ amount: 500, balance: 10000, dailyLimit: 50000, usedToday: 0,
                                accountType: "Savings", accountStatus: "Frozen", extraLimit: 0 });
    o.info("Frozen account se Rs. 500 nikalne ki koshish:");
    o.bad("  " + r.trail[0].by + ": " + r.trail[0].action);
    o.ok("Rule FrozenState class ke andar hai - kahin if-else nahi.");
  },

  strategy() {
    const o = labConsole("strategy");
    const P = Number(document.getElementById("stratP").value) || 100000;
    o.info("Principal Rs. " + money(P));
    for (const type of ["Savings", "Fixed Deposit", "Current"]) {
      const s = getInterestStrategy(type);
      o.line(type.padEnd(14) + s.constructor.name);
      o.line("   " + s.getFormula());
      o.line("   1 saal: Rs. " + money(s.calculate(P, 1)) + "   3 saal: Rs. " + money(s.calculate(P, 3)) +
             "   5 saal: Rs. " + money(s.calculate(P, 5)));
    }
    o.ok("Same calculate() call, alag strategy object - alag formula.");
  },

  command() {
    const o = labConsole("command");
    const db = DatabaseConnection.getInstance();
    withDemoCustomer("amit@smartbank.in", function (acc) {
      const facade = BankingFacade.getInstance();
      const b0 = db.selectOne("accounts", a => a.accNo === acc.accNo).balance;
      o.info("Balance pehle:      Rs. " + money(b0));
      const r = facade.transact(TransactionBuilder.create().credit().type("Deposit").amount(50)
                                  .mode("Cash at Branch").remark("DP Lab Command demo").build());
      o.line("execute(): Rs. 50 deposit (" + r.txnId + ") -> Rs. " + money(r.balance));
      o.line("command_log me entry: \"" + facade.canUndo().label + "\"");
      const u = facade.undoLast();
      o.ok("undo(): " + u.label + " reverse hui (" + u.refId + ") -> Rs. " + money(u.balance));
      const orig = db.selectOne("transactions", t => t.txnId === r.txnId);
      o.line("Original row reversed = " + orig.reversed + ", aur ek 'Reversal' entry bani.");
      o.ok("Balance wapas Rs. " + money(db.selectOne("accounts", a => a.accNo === acc.accNo).balance));
    });
  },

  decorator() {
    const o = labConsole("decorator");
    const picked = ["cashback", "overdraft", "insurance", "rewards"].filter(k => document.getElementById("dec_" + k).checked);
    const acc = decorateAccount({ type: "Savings", features: picked });

    let chain = "BasicAccount", cur = acc;
    const names = [];
    while (cur.inner) { names.push(cur.constructor.name); cur = cur.inner; }
    names.reverse().forEach(n => { chain = n + "( " + chain + " )"; });

    o.info("Object: " + chain);
    o.line("getDescription()  -> " + acc.getDescription());
    o.line("getMonthlyFee()   -> Rs. " + acc.getMonthlyFee());
    o.line("getExtraLimit()   -> Rs. " + money(acc.getExtraLimit()) + "  (overdraft)");
    o.line("getCashback(Bill Payment, Rs. 5,000) -> Rs. " + acc.getCashback("Bill Payment", 5000));
    o.line("getRewardPoints(Rs. 5,000)  -> " + acc.getRewardPoints(5000) + " points");
    o.ok("Har wrapper apna hissa jodta hai aur baaki andar wale ko pass karta hai.");
  },

  adapter() {
    const o = labConsole("adapter");
    const api = new QuickPayWalletAPI();
    const ad  = new WalletGatewayAdapter();
    o.info("Third party QuickPayWalletAPI (paise me kaam karta hai):");
    o.line("  fetchCommission(250000 paise) -> " + api.fetchCommission(250000) + " paise");
    o.line("  walletTransfer(250000, 'amit@quickpay') -> " +
           JSON.stringify(api.walletTransfer(250000, "amit@quickpay")));
    o.gap();
    o.info("WalletGatewayAdapter (humare PaymentGateway jaisa, rupees me):");
    o.line("  getFee(2500)      -> Rs. " + ad.getFee(2500));
    o.line("  getMaxLimit()     -> Rs. " + money(ad.getMaxLimit()));
    const run = ad.process(2500, { walletId: "amit@quickpay" });
    run.steps.forEach(s => o.line("  - " + s));
    o.ok("process() -> { ok: " + run.ok + " }   <- statusCode 200 ko true me badla");
    o.bad("process(3,00,000) -> { ok: " + ad.process(300000, {}).ok + " }   <- statusCode 429 ko false me badla");
  },

  facade() {
    const o = labConsole("facade");
    const methods = Object.getOwnPropertyNames(BankingFacade.prototype).filter(m => m !== "constructor");
    o.info("BankingFacade ke " + methods.length + " public methods:");
    for (let i = 0; i < methods.length; i += 4) o.line("  " + methods.slice(i, i + 4).map(m => (m + "()").padEnd(20)).join(""));
    o.gap();
    o.info("facade.bankStats():");
    const s = BankingFacade.getInstance().bankStats();
    Object.keys(s).forEach(k => o.line("  " + k.padEnd(14) + " " + (k === "totalMoney" ? "Rs. " + money(s[k]) : s[k])));
  },

  builder() {
    const o = labConsole("builder");
    const req = TransactionBuilder.create().debit().type("Transfer").amount(5000)
                  .via("transfer", "upi").to("SB123456").remark("Rent").build();
    o.info("TransactionBuilder.create().debit().type('Transfer').amount(5000)");
    o.info("  .via('transfer','upi').to('SB123456').remark('Rent').build()");
    o.line(JSON.stringify(req, null, 2));
    o.gap();
    try {
      TransactionBuilder.create().debit().type("Transfer").amount(0).build();
    } catch (e) {
      o.bad("amount(0).build()  ->  Error: " + e.message);
    }
    try {
      const half = TransactionBuilder.create().debit().type("Bill Payment").amount(100);
      half.req.paymentType = "bill";          // gateway diya hi nahi
      half.build();
    } catch (e) {
      o.bad("gateway ke bina payment  ->  Error: " + e.message);
    }
  },

  flow() {
    const out = document.getElementById("out-flow");
    const db  = DatabaseConnection.getInstance();
    let result = null, who = null, sqlBefore = lastSqlId();
    withDemoCustomer("sneha@smartbank.in", function (acc, user) {
      who = user.name + " (" + acc.accNo + ")";
      const to = db.selectOne("accounts", a => a.userId !== user.id && a.status === "Active" && a.type !== "Fixed Deposit");
      result = BankingFacade.getInstance().transact(
        TransactionBuilder.create().debit().type("Transfer").amount(250).via("transfer", "wallet")
          .to(to.accNo).remark("DP Lab full flow demo").context({ walletId: "demo@quickpay" }).build());
    });
    out.innerHTML = '<p class="sub" style="margin-top:10px">Asli Rs. 250 transfer from ' + esc(who) +
                    " via QuickPay Wallet:</p>";
    const box = document.createElement("div");
    out.appendChild(box);
    renderResult(box, result);
    const sql = sqlLogSince(sqlBefore).filter(e => e.kind === "write");
    if (sql.length) {
      const pre = document.createElement("div");
      pre.className = "console";
      pre.textContent = "SQLite par " + sql.length + " write queries chali, jaise:\n" +
                        sql.slice(0, 6).map(e => "  " + e.sql).join("\n");
      out.appendChild(pre);
    }
  }
};

function runDemo(key, a, b) {
  try {
    LAB_DEMOS[key](a, b);
  } catch (e) {
    const box = document.getElementById("out-" + key);
    if (box) box.textContent = "Demo me error: " + e.message;
    console.error(e);
  }
}

/* Bridge matrix (3 payment types x 4 gateways) */
function renderBridgeMatrix() {
  const types = [["transfer", "Money Transfer"], ["bill", "Bill Payment"], ["recharge", "Mobile Recharge"]];
  let html = '<table class="matrix"><thead><tr><th>Rs. 1,000</th>' +
             GATEWAY_OPTIONS.map(g => "<th>" + esc(getGateway(g.code).getName()) + "</th>").join("") +
             "</tr></thead><tbody>";
  for (const [code, label] of types) {
    html += "<tr><td><b>" + label + "</b></td>";
    for (const g of GATEWAY_OPTIONS) {
      const p = getPayment(code, getGateway(g.code));
      html += '<td class="cell" title="Click karke steps dekho" onclick="runDemo(\'bridge\',\'' + code + "','" + g.code +
              '\')">Rs. ' + money(p.getTotal(1000)) + "</td>";
    }
    html += "</tr>";
  }
  document.getElementById("bridgeMatrix").innerHTML = html + "</tbody></table>";
}

function drawAllDiagrams() {
  document.querySelectorAll("[data-uml]").forEach(function (el) {
    const spec = PATTERN_DIAGRAMS[el.getAttribute("data-uml")];
    if (spec) UML.draw(el, spec);
  });
}
