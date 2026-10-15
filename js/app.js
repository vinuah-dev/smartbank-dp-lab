/* ==========================================================
   app.js  -  SmartBank glue code
   Yahan saare patterns ek saath kaam karte hain.
   Ise sabse last me load karna hai.
   ========================================================== */


/* ---------------- chhote helpers ---------------- */

function money(n) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
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

function toast(message, kind) {
  const box = $("toast");
  if (!box) return;
  box.textContent = message;
  box.className = "toast show " + (kind || "ok");
  setTimeout(() => { box.className = "toast"; }, 3500);
}


/* ---------------- pehli baar ka demo data ---------------- */

function seedDatabase() {
  const db = DatabaseConnection.getInstance();
  db.connect();

  if (db.count("users") > 0) return;      // pehle se bana hua hai

  const demoUsers = [
    { name: "Ramesh Kumar", email: "ramesh@smartbank.in", mobile: "+91-9876543210",
      password: "1234", accounts: [["Savings", 45000, ["cashback"]],
                                   ["Fixed Deposit", 100000, []]] },
    { name: "Sneha Patil", email: "sneha@smartbank.in", mobile: "+91-9812345678",
      password: "1234", accounts: [["Current", 80000, ["overdraft", "rewards"]]] },
    { name: "Amit Rao", email: "amit@smartbank.in", mobile: "+91-9765432109",
      password: "1234", accounts: [["Savings", 12000, []]] }
  ];

  for (const u of demoUsers) {
    const user = db.insert("users", {
      name: u.name, email: u.email, mobile: u.mobile,
      password: u.password, role: "customer"
    });

    for (const [type, open, features] of u.accounts) {
      // FACTORY METHOD se account banaya
      const made = getAccountFactory(type).openAccount(user.id, open);
      if (made.ok && features.length > 0) {
        const row = db.selectOne("accounts", a => a.accNo === made.account.accNo);
        db.update("accounts", row.id, { features: features });   // DECORATOR
      }
    }
  }

  // bank ka staff - ye admin portal me jaata hai
  db.insert("users", {
    name: "Meena Joshi", email: "manager@smartbank.in", mobile: "+91-9700000001",
    password: "admin", role: "staff", designation: "Branch Manager"
  });
}


/* ---------------- login ki jaanch ---------------- */

function requireLogin() {
  const session = SessionManager.getInstance();
  if (!session.isLoggedIn()) {
    window.location.href = "index.html";
    return false;
  }
  const user = session.getUser();
  if (user === null) {                    // database reset ho gaya tha
    session.logout();
    window.location.href = "index.html";
    return false;
  }
  return true;
}

function isStaff() {
  const user = SessionManager.getInstance().getUser();
  return user !== null && user.role === "staff";
}

function requireStaff() {
  if (!requireLogin()) return false;
  if (!isStaff()) {
    window.location.href = "dashboard.html";
    return false;
  }
  return true;
}


/* ---------------- header har page par ---------------- */

function renderHeader(active) {
  const session = SessionManager.getInstance();
  const config  = BankConfig.getInstance();
  const user    = session.getUser();
  const db      = DatabaseConnection.getInstance();

  // ABSTRACT FACTORY : channel ke hisaab se poora look badalta hai
  const channel = session.getChannel();
  const applied = applyChannel(channel);

  const unread = db.select("notifications",
                   n => n.userId === user.id && !n.read).length;

  const staff = user.role === "staff";

  const links = staff
    ? [["admin.html", "Bank Console"], ["patterns.html", "Patterns Used"]]
    : [
        ["dashboard.html",  "Dashboard"],
        ["accounts.html",   "My Accounts"],
        ["banking.html",    "Deposit / Withdraw"],
        ["transfer.html",   "Transfer"],
        ["payments.html",   "Bill &amp; Recharge"],
        ["history.html",    "History"],
        ["settings.html",   "Settings"],
        ["patterns.html",   "Patterns Used"]
      ];

  let nav = "";
  for (const [href, label] of links) {
    nav += '<a href="' + href + '"' +
           (active === href ? ' class="active"' : "") + ">" + label + "</a>";
  }

  // ---- account switcher (ek user ke kai account ho sakte hain) ----
  let switcher = "";
  if (!staff) {
    const mine = db.select("accounts", a => a.userId === user.id);
    const now  = session.get().accNo;

    switcher = '<select id="accPick" class="channel-pick" title="Active account">';
    for (const a of mine) {
      switcher += '<option value="' + a.accNo + '"' +
                  (a.accNo === now ? " selected" : "") + ">" +
                  a.accNo + " - " + a.type + "</option>";
    }
    switcher += "</select>";
  }

  $("site-header").innerHTML =
    '<div class="topbar">' +
      '<div class="brand">' +
        '<span class="logo">SB</span>' +
        '<div><b>' + config.bankName + (staff ? " Staff" : "") + '</b>' +
        '<div class="tagline">' +
          (staff ? user.designation : applied.wording.tagline()) + '</div></div>' +
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
        '<span class="who">' + user.name + '</span>' +
        '<button class="btn small ghost" onclick="doLogout()">Logout</button>' +
      '</div>' +
    '</div>' +
    '<nav class="mainnav">' + nav + '</nav>' +
    (Store.persistent ? "" :
      '<div class="warnbar">Is browser me localStorage band hai, isliye data save ' +
      'nahi hoga. File ko normal browser me kholo ya local server chalao.</div>');

  if (!staff) {
    $("channelPick").onchange = function () {
      session.setChannel(this.value);
      window.location.reload();
    };
    $("accPick").onchange = function () {
      const s = session.get();
      session.login(user.id, this.value);
      session.setChannel(s.channel);
      window.location.reload();
    };
  }
}

function doLogout() {
  SessionManager.getInstance().logout();
  window.location.href = "index.html";
}


/* ==========================================================
   MAIN ENGINE
   Har transaction yahan se guzarta hai. Ek hi function me
   poora system kaam karta hai:

     SINGLETON    -> config, DB aur session ek hi jagah se
     PROXY        -> account ko safely access karna
     DECORATOR    -> account ke add-on features lagana
     BRIDGE       -> payment gateway se paisa bhejna
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
                   userId: user.id };

  // ---- 1. PROXY : direct account object nahi milega ----
  const proxy   = new AccountProxy(session.get().accNo, user.id);
  const details = proxy.getDetails();

  if (details === null) {
    result.error = proxy.lastError;
    return result;
  }
  result.accNo = details.accNo;
  result.steps.push({ tag: "Proxy",
    text: "Access check pass hua, account " + details.accNo + " khula" });

  const amount = Number(options.amount);
  if (!amount || amount <= 0) {
    result.error = "Sahi amount daaliye.";
    return result;
  }

  // ---- 2. DECORATOR : account par lage hue features padho ----
  const decorated  = decorateAccount(details);
  const extraLimit = decorated.getExtraLimit();

  if (decorated.getFeatureNames().length > 0) {
    result.steps.push({ tag: "Decorator",
      text: decorated.getDescription() +
            (extraLimit > 0 ? "  (overdraft Rs. " + money(extraLimit) + " available)" : "") });
  }

  let fee     = 0;
  let payment = null;

  // ---- 3. BRIDGE : abstraction ko implementation se joda ----
  if (options.gatewayCode) {
    const gateway = getGateway(options.gatewayCode);
    payment = getPayment(options.paymentType, gateway);   // <-- bridge bana

    fee = gateway.getFee(amount);
    result.fee     = fee;
    result.gateway = gateway.getName();
    result.payType = payment.getType();
  }

  const totalDebit = amount + fee;

  // ---- 4. STATE + CHAIN OF RESPONSIBILITY : approval ----
  let approval = null;
  if (options.direction === "debit") {
    approval = requestApproval({
      amount:        totalDebit,
      balance:       details.balance,
      dailyLimit:    details.dailyLimit,
      accountType:   details.type,
      accountStatus: details.status,        // STATE
      extraLimit:    extraLimit,            // DECORATOR (overdraft)
      purpose:       options.type
    });

    result.trail = approval.trail;

    if (approval.status !== "APPROVED") {
      result.error = "Transaction reject ho gaya.";
      // reject hua transaction bhi DB me jaata hai (audit ke liye)
      new DatabaseLoggerObserver().update({
        txnId: newTxnId(), accNo: details.accNo, userId: user.id,
        type: options.type, direction: options.direction, amount: amount,
        fee: fee, balance: details.balance, mode: options.mode,
        status: "REJECTED", approvedBy: "-", remark: options.remark
      });
      return result;
    }
  } else {
    // credit par bhi state check zaroori hai (closed account)
    const allowed = getAccountState(details.status).canCredit();
    if (!allowed.ok) {
      result.error = allowed.reason;
      result.trail = [{ by: "Account Status", action: "Rejected - " + allowed.reason }];
      return result;
    }
  }

  // ---- 5. BRIDGE ka actual processing ----
  if (payment !== null) {
    const run = payment.execute(amount, options.ctx || {});

    for (const s of run.steps) {
      result.steps.push({ tag: "Bridge", text: s });
    }

    if (!run.ok) {
      result.error = run.error;
      return result;
    }
  }

  // ---- 6. PROXY ke through balance update ----
  let newBalance;
  if (options.direction === "debit") {
    newBalance = proxy.debit(totalDebit);
    result.steps.push({ tag: "Proxy",
      text: "Rs. " + money(totalDebit) + " debit hua (fee Rs. " + money(fee) + " included)" });
  } else {
    newBalance = proxy.credit(amount);
    result.steps.push({ tag: "Proxy", text: "Rs. " + money(amount) + " credit hua" });
  }

  // ---- 7. agar transfer hai to samne wale ka account bhi badhao ----
  if (options.toAccount) {
    const target = db.selectOne("accounts", a => a.accNo === options.toAccount);
    if (target) {
      db.update("accounts", target.id, { balance: target.balance + amount });
      result.steps.push({ tag: "Bank",
        text: "Rs. " + money(amount) + " " + options.toAccount + " me jama hua" });

      // paane wale ko bhi alert bhejo
      const targetUser = db.selectOne("users", u => u.id === target.userId);
      if (targetUser) {
        new SMSObserver(targetUser.mobile).update({
          txnId: newTxnId(), accNo: target.accNo, userId: targetUser.id,
          holder: targetUser.name, type: "Transfer In", direction: "credit",
          amount: amount, balance: target.balance + amount,
          mode: "IMPS", status: "APPROVED", approvedBy: "System",
          remark: "Received from " + user.name
        });
      }
    }
  }

  // ---- 8. OBSERVER : sabko khabar do + database me save ----
  const account = session.getAccount();
  const subject = buildSubject(user, account);

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
    toAccount:  options.toAccount || null
  };

  const notified = subject.notify(event);

  result.steps.push({ tag: "Observer",
    text: notified + " observers ko notify kiya: " + subject.getObserverNames().join(", ") });

  // Database Logger ne jo row daali uska id chahiye (undo ke liye)
  const saved = db.select("transactions", t => t.txnId === event.txnId);
  result.txnRowId = saved.length > 0 ? saved[saved.length - 1].id : null;

  // ---- 9. DECORATOR ke faayde : cashback aur reward points ----
  if (options.direction === "debit") {
    const points = decorated.getRewardPoints(amount);
    if (points > 0) {
      const fresh = db.selectOne("accounts", a => a.accNo === details.accNo);
      db.update("accounts", fresh.id, { rewardPoints: (fresh.rewardPoints || 0) + points });
      result.points = points;
      result.steps.push({ tag: "Decorator",
        text: points + " reward points mile" });
    }

    const cashback = decorated.getCashback(options.type, amount);
    if (cashback > 0) {
      newBalance = proxy.credit(cashback);
      result.cashback = cashback;
      result.steps.push({ tag: "Decorator",
        text: "Rs. " + money(cashback) + " cashback wapas jama hua" });

      // cashback ki apni entry bhi banti hai
      subject.notify({
        txnId: newTxnId(), accNo: details.accNo, userId: user.id,
        holder: user.name, type: "Cashback", direction: "credit",
        amount: cashback, fee: 0, balance: newBalance, mode: "Auto Credit",
        status: "APPROVED", approvedBy: "System",
        remark: "Cashback on " + event.txnId
      });
    }
  }

  result.ok         = true;
  result.txnId      = event.txnId;
  result.balance    = newBalance;
  result.approvedBy = event.approvedBy;
  result.observers  = subject.getObserverNames();

  return result;
}


/* ---------------- result dikhane wala common UI ---------------- */

function renderResult(target, result) {
  let html = "";

  if (result.ok) {
    html += '<div class="result ok"><b>Transaction Successful</b><br>' +
            'Reference: ' + result.txnId +
            ' &nbsp;|&nbsp; Approved by: ' + result.approvedBy +
            ' &nbsp;|&nbsp; New Balance: Rs. ' + money(result.balance) +
            (result.cashback ? '<br>Cashback mila: Rs. ' + money(result.cashback) : '') +
            (result.points ? '<br>Reward points mile: ' + result.points : '') +
            '</div>';
  } else {
    html += '<div class="result bad"><b>Transaction Failed</b><br>' +
            result.error + '</div>';
  }

  if (result.payType) {
    html += '<h4>Payment route <span class="hint">(Bridge)</span></h4>' +
            '<p style="font-size:13.5px">Abstraction <b>' + result.payType +
            '</b> + Implementation <b>' + result.gateway +
            '</b> &nbsp;|&nbsp; gateway fee Rs. ' + money(result.fee) + '</p>';
  }

  if (result.trail && result.trail.length > 0) {
    html += '<h4>Approval chain <span class="hint">(Chain of Responsibility)</span></h4><ol class="trail">';
    for (const t of result.trail) {
      html += "<li><b>" + t.by + ":</b> " + t.action + "</li>";
    }
    html += "</ol>";
  }

  if (result.steps && result.steps.length > 0) {
    html += '<h4>Behind the scenes</h4><ul class="steps">';
    for (const s of result.steps) {
      html += '<li><span class="tag">' + s.tag + '</span>' + s.text + "</li>";
    }
    html += "</ul>";
  }

  target.innerHTML = html;
  target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}


/* ---------------- transaction row ka common HTML ---------------- */

function txnRowHtml(t, opts) {
  opts = opts || {};
  const ok   = t.status === "APPROVED";
  const sign = t.direction === "credit" ? "+" : "-";

  let statusPill = '<span class="pill ' + (ok ? "green" : "red") + '">' + t.status + "</span>";
  if (t.reversed) statusPill += ' <span class="pill grey">REVERSED</span>';

  let row = "<tr>" +
    "<td>" + t.txnId + "</td>" +
    (opts.showAccount ? "<td>" + t.accNo + "</td>" : "") +
    "<td>" + t.type + "</td>" +
    "<td>" + t.mode + "</td>" +
    "<td>" + t.approvedBy + "</td>" +
    "<td>" + statusPill + "</td>" +
    '<td class="num">' + sign + " Rs. " + money(t.amount) + "</td>" +
    '<td class="num">Rs. ' + money(t.fee || 0) + "</td>" +
    '<td class="num">Rs. ' + money(t.balance) + "</td>" +
    "<td>" + t.remark + "</td>" +
    "<td>" + t.time + "</td>";

  if (opts.actions) {
    const can = ok && !t.reversed && t.type !== "Reversal";
    row += "<td>" + (can
      ? '<button class="btn small red" onclick="doReverse(' + t.id + ')">Reverse</button>'
      : '<span class="hint">-</span>') + "</td>";
  }

  return row + "</tr>";
}


/* ---------------- statement CSV download ---------------- */

function downloadCSV(rows, filename) {
  const head = ["Ref", "Account", "Type", "Mode", "Approved By", "Status",
                "Direction", "Amount", "Fee", "Balance", "Remark", "Time"];

  const lines = [head.join(",")];
  for (const t of rows) {
    lines.push([t.txnId, t.accNo, t.type, t.mode, t.approvedBy,
                t.reversed ? "REVERSED" : t.status, t.direction,
                t.amount, t.fee || 0, t.balance,
                '"' + String(t.remark).replace(/"/g, "'") + '"', t.time].join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href     = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
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
    const up    = t.direction === "credit";
    const color = up ? "#1c7a3c" : "#b32d2d";

    bars += '<rect x="' + (i * W + W * 0.18).toFixed(2) + '%" y="' + (100 - h) + '%" ' +
            'width="' + (W * 0.64).toFixed(2) + '%" height="' + h + '%" ' +
            'fill="' + color + '" rx="2">' +
            "<title>" + t.txnId + " - " + t.type + " Rs. " + money(t.amount) + "</title>" +
            "</rect>";
  });

  let labels = "";
  data.forEach(function (t, i) {
    labels += '<span style="width:' + W.toFixed(2) + '%;text-align:center;' +
              'font-size:10px;color:var(--muted);overflow:hidden">' +
              (t.direction === "credit" ? "+" : "-") + money(t.amount) + "</span>";
  });

  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" ' +
         'style="width:100%;height:130px;display:block">' + bars + "</svg>" +
         '<div style="display:flex">' + labels + "</div>" +
         '<p class="hint" style="margin-top:6px">Hara = paisa aaya, laal = paisa gaya. ' +
         'Bar par hover karo detail ke liye.</p>';
}
