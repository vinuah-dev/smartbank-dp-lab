/* ==========================================================
   tests/e2e-ui.js  -  UI click-through test

   Har page ko ek iframe me kholta hai aur asli forms bharta,
   buttons dabata hai - jaise koi insaan demo kar raha ho:
   login lockout, withdraw / daily limit, undo, wallet transfer,
   bill cashback, alert settings, register, staff freeze / close /
   reverse, access control.

   Chalane ka tarika: server mode me tests.html kholo aur
   "UI click-through test" dabao. Ye demo data par chalta hai.
   ========================================================== */
(async () => {
  const report = [];
  let pass = 0, fail = 0;
  const check = (label, ok, detail) => {
    if (ok) pass++; else fail++;
    report.push((ok ? "PASS " : "FAIL ") + label + (!ok && detail ? "  -> " + detail : ""));
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:0;top:0;width:1280px;height:900px;opacity:0.01;pointer-events:none";
  document.body.appendChild(frame);

  // page kholo aur redirect hone tak ruko
  async function open(url) {
    await new Promise(res => { frame.onload = res; frame.src = url; });
    let last = frame.contentWindow.location.href;
    for (let i = 0; i < 20; i++) {
      await sleep(120);
      const now = frame.contentWindow.location.href;
      if (now === last && frame.contentDocument.readyState === "complete") break;
      last = now;
    }
    const w = frame.contentWindow;
    w.confirm = () => true;
    return w;
  }
  const $ = (w, id) => w.document.getElementById(id);
  const path = w => w.location.pathname.replace("/", "");
  const text = (w, id) => ($(w, id) ? $(w, id).innerText : "");

  let w = await open("index.html");
  w.eval("SessionManager").getInstance().logout();
  const db = () => w.eval("DatabaseConnection").getInstance();

  /* ---------------- access control ---------------- */
  w = await open("dashboard.html");
  check("not logged in: dashboard redirects to login", path(w) === "index.html", path(w));
  w = await open("admin.html");
  check("not logged in: admin redirects to login", path(w) === "index.html", path(w));
  w = await open("patterns.html");
  check("DP Lab opens without login", path(w) === "patterns.html" && w.document.querySelectorAll("svg.uml").length === 14);

  /* ---------------- login lockout via the form ---------------- */
  w = await open("index.html");
  const rid = db().selectOne("users", u => u.email === "ramesh@smartbank.in").id;
  db().update("users", rid, { failedLogins: 0, lockedUntil: 0 });
  for (let i = 1; i <= 3; i++) {
    $(w, "lEmail").value = "ramesh@smartbank.in";
    $(w, "lPass").value = "nope" + i;
    $(w, "loginForm").requestSubmit();
    await sleep(80);
    if (i === 1) check("1st wrong password shows tries left", /2 try/.test(text(w, "msg")), text(w, "msg"));
  }
  check("3rd wrong password locks login", /lock/.test(text(w, "msg")), text(w, "msg"));
  $(w, "lPass").value = "1234"; $(w, "loginForm").requestSubmit(); await sleep(150);
  check("correct password refused while locked", path(w) === "index.html" && /second/.test(text(w, "msg")), text(w, "msg"));
  db().update("users", rid, { failedLogins: 0, lockedUntil: 0 });

  /* ---------------- Ramesh: dashboard ---------------- */
  w.fill("ramesh@smartbank.in", "1234");
  $(w, "loginForm").requestSubmit();
  await sleep(400);
  w = await open("dashboard.html");
  check("login lands on dashboard", path(w) === "dashboard.html");
  check("dashboard shows balance and chart", /Rs\./.test(text(w, "balAmount")) && !!w.document.querySelector("#chart svg"));
  check("dashboard recent transactions filled", w.document.querySelectorAll("#txnBody tr").length >= 3);
  check("header shows SQLite badge and account switcher",
        !!w.document.querySelector(".dbpill.sqlite") && w.document.querySelectorAll("#accPick option").length >= 2);
  const savings = w.eval("SessionManager").getInstance().get().accNo;

  /* ---------------- banking: withdraw / deposit / undo ---------------- */
  w = await open("banking.html");
  check("banking shows today's limit", /Baaki/.test(text(w, "limitInfo")), text(w, "limitInfo"));
  const bal = () => db().selectOne("accounts", a => a.accNo === savings).balance;
  let b0 = bal();
  $(w, "wAmount").value = 8000; w.doWithdraw(); await sleep(50);
  check("withdraw 8000 approved by Clerk", /Successful/.test(text(w, "result")) && /Clerk/.test(text(w, "result")) && bal() === b0 - 8000,
        text(w, "result").slice(0, 120));
  check("result shows pattern pipeline", w.document.querySelectorAll("#result .pchip.on").length >= 7);
  $(w, "wAmount").value = 45000; w.doWithdraw(); await sleep(50);
  check("withdraw 45000 blocked by daily limit (8000 already used)", /reject/.test(text(w, "result")) && /daily limit/.test(text(w, "result")),
        text(w, "result").slice(0, 200));
  b0 = bal();
  $(w, "dAmount").value = 2500; w.doDeposit(); await sleep(50);
  check("deposit 2500", bal() === b0 + 2500);
  check("undo box shows the deposit", /Deposit of Rs. 2,500/.test(text(w, "undoBox")), text(w, "undoBox"));
  w.doUndo(); await sleep(50);
  check("undo restores balance", bal() === b0 && /Undo Successful/.test(text(w, "result")), text(w, "result").slice(0, 100));

  /* ---------------- transfer via wallet ---------------- */
  w = await open("transfer.html");
  const sneha = db().selectOne("accounts", a => a.type === "Current");
  const s0 = sneha.balance;
  $(w, "toAcc").value = sneha.accNo;
  $(w, "tGateway").value = "wallet"; w.updateFee();
  $(w, "tAmount").value = 1200; w.updateFee();
  check("fee preview for wallet (1.5% of 1200 = 18)", /Rs\. 18/.test(text(w, "feeBox")), text(w, "feeBox"));
  b0 = bal();
  w.doTransfer(); await sleep(50);
  const sAfter = db().selectOne("accounts", a => a.accNo === sneha.accNo).balance;
  check("transfer moved money on both sides", bal() === b0 - 1218 && sAfter === s0 + 1200, b0 + " -> " + bal() + ", sneha " + s0 + " -> " + sAfter);
  check("transfer result mentions adapter steps", /Adapter/.test(text(w, "result")));
  check("own FD listed as a beneficiary too", /my Fixed Deposit/.test(w.document.getElementById("toAcc").innerText));

  /* ---------------- bills with cashback ---------------- */
  w = await open("payments.html");
  $(w, "bAmount").value = 3000; $(w, "bGateway").value = "card"; w.updateFee("b");
  b0 = bal();
  w.payBill(); await sleep(50);
  check("bill via card: 2% fee and 1% cashback", /Cashback mila: Rs. 30/.test(text(w, "result")) && bal() === b0 - 3060 + 30,
        text(w, "result").slice(0, 160));

  /* ---------------- history ---------------- */
  w = await open("history.html");
  const rows = w.document.querySelectorAll("#hBody tr").length;
  $(w, "fType").value = "Transfer"; w.loadHistory();
  const tRows = [...w.document.querySelectorAll("#hBody tr")].map(r => r.children[1].innerText);
  check("history filter by type", rows > 5 && tRows.length > 0 && tRows.every(t => t === "Transfer"), rows + " / " + tRows.join(","));
  $(w, "fType").value = ""; w.loadHistory();
  check("reversed entries are marked", /REVERSED/.test(text(w, "hBody")));
  check("command history and access log visible",
        w.document.querySelectorAll("#cmdBody tr").length > 0 && w.document.querySelectorAll("#logBody tr").length > 0);

  /* ---------------- settings: SMS off ---------------- */
  w = await open("settings.html");
  $(w, "pSms").checked = false; w.savePrefs();
  check("observer list shrinks to 4 after SMS off", /4 observers/.test(text(w, "obsList")), text(w, "obsList").slice(0, 60));
  const smsCount = () => db().select("notifications", n => n.userId === rid && n.channel === "SMS").length;
  const sms0 = smsCount();
  w = await open("banking.html");
  $(w, "dAmount").value = 100; w.doDeposit(); await sleep(50);
  check("no SMS for Ramesh while SMS is off", smsCount() === sms0);
  w = await open("settings.html");
  $(w, "pSms").checked = true; w.savePrefs();

  /* ---------------- notifications ---------------- */
  w = await open("notifications.html");
  w.markAllRead(); await sleep(50);
  check("mark all read clears the bell", !w.document.querySelector("#site-header .dot"));
  const others = db().select("notifications", n => n.userId !== rid).length;
  w.clearNotifs(); await sleep(50);
  check("clear all removes only my alerts",
        db().select("notifications", n => n.userId === rid).length === 0 &&
        db().select("notifications", n => n.userId !== rid).length === others);

  /* ---------------- my accounts ---------------- */
  w = await open("accounts.html");
  $(w, "f_rewards").checked = true; w.saveFeatures(); await sleep(30);
  check("add rewards feature (decorator chain shown)", /RewardPointsFeature/.test(text(w, "featureResult")), text(w, "featureResult"));
  b0 = bal();
  w.creditInterest(); await sleep(30);
  check("savings interest credited (Strategy)", bal() > b0 && /Simple Interest/.test(text(w, "interestResult")));
  $(w, "nType").value = "Current"; w.showRules(); $(w, "nOpen").value = 5000; w.openNew(); await sleep(30);
  check("Current account below Rs. 10,000 rejected", /10,000/.test(text(w, "openResult")));
  $(w, "nOpen").value = 15000; w.openNew(); await sleep(30);
  check("new Current account opened", /Naya account khul gaya/.test(text(w, "openResult")));
  const fd = db().selectOne("accounts", a => a.userId === rid && a.type === "Fixed Deposit");
  w.useAccount(fd.accNo); await sleep(300);
  w = await open("accounts.html");
  check("FD: add-on checkboxes disabled", $(w, "f_cashback").disabled === true);
  w.eval("SessionManager").getInstance().switchAccount(savings);

  /* ---------------- channel switch (Abstract Factory) ---------------- */
  w = await open("dashboard.html");
  w.eval("SessionManager").getInstance().setChannel("atm");
  w = await open("dashboard.html");
  const brand = w.getComputedStyle(w.document.documentElement).getPropertyValue("--brand").trim();
  check("ATM channel changes theme", brand === "#0f7b34" && /WELCOME/.test(text(w, "greeting")), brand + " / " + text(w, "greeting"));
  w.eval("SessionManager").getInstance().setChannel("web");

  /* ---------------- customer cannot open staff pages ---------------- */
  w = await open("admin.html");
  check("customer sent away from admin", path(w) === "dashboard.html", path(w));
  w = await open("database.html");
  check("customer sent away from database page", path(w) === "dashboard.html", path(w));
  w.doLogout(); await sleep(300);

  /* ---------------- register a new customer ---------------- */
  w = await open("index.html");
  w.showTab("register");
  $(w, "rName").value = "Kavya Iyer"; $(w, "rEmail").value = "kavya@"; $(w, "rMobile").value = "9123456780";
  $(w, "rPass").value = "kavya1"; $(w, "rPass2").value = "kavya1"; $(w, "rType").value = "Savings"; $(w, "rOpen").value = 3000;
  $(w, "regForm").requestSubmit(); await sleep(80);
  check("register: bad email rejected (browser validation or our check)",
        path(w) === "index.html" && (!$(w, "rEmail").checkValidity() || /Email/.test(text(w, "msg"))), text(w, "msg"));
  // browser validation hata kar humara apna (facade) validation bhi check karo
  $(w, "regForm").noValidate = true;
  $(w, "regForm").requestSubmit(); await sleep(80);
  check("register: facade also rejects bad email", /Email/.test(text(w, "msg")), text(w, "msg"));
  $(w, "rMobile").value = "12345"; $(w, "rEmail").value = "ok@test.in";
  $(w, "regForm").requestSubmit(); await sleep(80);
  check("register: bad mobile rejected", /Mobile/.test(text(w, "msg")), text(w, "msg"));
  $(w, "rMobile").value = "9123456780";
  const unique = "kavya" + Date.now() % 100000 + "@test.in";
  $(w, "rEmail").value = unique;
  $(w, "regForm").requestSubmit(); await sleep(500);
  w = await open("dashboard.html");
  check("register: lands on dashboard with opening entry",
        path(w) === "dashboard.html" && /Account Opening/.test(text(w, "txnBody")), path(w));
  const kavyaAcc = w.eval("SessionManager").getInstance().get().accNo;
  w.doLogout(); await sleep(300);

  /* ---------------- staff ---------------- */
  w = await open("index.html");
  w.fill("manager@smartbank.in", "admin"); $(w, "loginForm").requestSubmit(); await sleep(400);
  w = await open("admin.html");
  check("staff lands on Bank Console", path(w) === "admin.html" && /Customers/.test(text(w, "stats")));
  w.setStatus(savings, "Frozen"); await sleep(30);
  check("staff freezes Ramesh savings",
        db().selectOne("accounts", a => a.accNo === savings).status === "Frozen" && /Frozen/.test(text(w, "adminMsg")));
  const kb = db().selectOne("accounts", a => a.accNo === kavyaAcc).balance;
  w.setStatus(kavyaAcc, "Closed"); await sleep(30);
  check("staff closes Kavya's account with payout",
        db().selectOne("accounts", a => a.accNo === kavyaAcc).status === "Closed" &&
        new RegExp("Rs. " + Number(kb).toLocaleString("en-IN")).test(text(w, "adminMsg")), text(w, "adminMsg"));
  const tr = db().select("transactions", t => t.type === "Transfer" && t.status === "APPROVED" && !t.reversed).pop();
  w.doReverse(tr.id); await sleep(30);
  check("staff reverses a transfer (both sides)",
        /reverse ho gayi/.test(text(w, "adminMsg")) && /2 entry/.test(text(w, "adminMsg")), text(w, "adminMsg"));
  w.chargeFees(); await sleep(30);
  check("monthly fee run skips the frozen account",
        /fee kaati/.test(text(w, "maintMsg")) && new RegExp(savings).test(text(w, "maintMsg")), text(w, "maintMsg"));
  check("staff session restored after fee run", w.isStaff());
  w = await open("dashboard.html");
  check("staff sent away from customer dashboard", path(w) === "admin.html", path(w));
  w = await open("database.html");
  check("database page: ER diagram + SQL console", !!w.document.querySelector("#erDiagram svg") &&
        w.document.querySelectorAll("#samples .btn").length === 7);
  w.doLogout(); await sleep(300);

  /* ---------------- Ramesh on a frozen account ---------------- */
  w = await open("index.html");
  w.fill("ramesh@smartbank.in", "1234"); $(w, "loginForm").requestSubmit(); await sleep(400);
  w = await open("banking.html");
  $(w, "wAmount").value = 500; w.doWithdraw(); await sleep(30);
  check("frozen: withdrawal stopped by Account Status", /Account Status/.test(text(w, "result")) && /frozen/i.test(text(w, "result")),
        text(w, "result").slice(0, 160));
  $(w, "dAmount").value = 500; w.doDeposit(); await sleep(30);
  check("frozen: deposit still works", /Successful/.test(text(w, "result")));
  w.doLogout(); await sleep(200);

  // wapas normal
  w = await open("index.html");
  db().update("accounts", db().selectOne("accounts", a => a.accNo === savings).id, { status: "Active" });

  frame.remove();
  return pass + " passed, " + fail + " failed\n" + report.filter(l => l.startsWith("FAIL")).join("\n") +
         "\n---\n" + report.join("\n");
})()
