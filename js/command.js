/* ==========================================================
   command.js  -  SmartBank transaction commands
   Pattern used here : COMMAND  (Advanced)

   Har transaction ko ek object bana diya gaya hai jisme
   execute() aur undo() dono hain. Isse do fayde hue:

     1. Customer apni last transaction undo kar sakta hai
     2. Bank staff kisi bhi purani transaction ko reverse
        kar sakta hai (admin page se)

   Command history database ke command_log table me rehti hai,
   isliye page badalne par bhi undo kaam karta hai.
   ========================================================== */


/* ---------- Command interface ---------- */
class Command {
  execute() {}
  undo()    {}
  canUndo() { return false; }
  getLabel(){ return "Command"; }
}


/* ---------- Concrete Command ---------- */
class TransactionCommand extends Command {

  constructor(request) {
    super();
    this.request = request;
    this.result  = null;
  }

  getLabel() {
    return this.request.type + " of Rs. " + money(this.request.amount);
  }

  execute() {
    // asli kaam engine karta hai (app.js)
    this.result = executeTransaction(this.request);
    return this.result;
  }

  canUndo() {
    return this.result !== null && this.result.ok === true;
  }
}


/* ----------------------------------------------------------
   Transaction ko ulta karne wala kaam.
   Isko invoker (customer ka undo) aur admin (reverse) dono use
   karte hain.

   Ek transaction ke saath judi hui "child" entries bhi hoti hain
   (parentTxnId se) - jaise cashback, ya transfer me samne wale ke
   account ki "Transfer In" entry. Parent reverse ho to children
   bhi reverse hone chahiye, warna hisaab galat ho jaayega.
   ---------------------------------------------------------- */
const NON_REVERSIBLE_TYPES = ["Reversal", "Account Opening", "Closure Payout"];

function canReverseRow(t) {
  return t.status === "APPROVED" && !t.reversed &&
         NON_REVERSIBLE_TYPES.indexOf(t.type) === -1 && !t.parentTxnId;
}

function reverseTransactionRow(txnRow) {
  const db = DatabaseConnection.getInstance();

  if (txnRow.status !== "APPROVED") {
    return { ok: false, error: "Sirf approved transaction hi reverse ho sakti hai." };
  }
  if (txnRow.reversed) {
    return { ok: false, error: "Ye transaction pehle hi reverse ho chuki hai." };
  }
  if (txnRow.type === "Reversal") {
    return { ok: false, error: "Reversal ko dobara reverse nahi kar sakte." };
  }
  if (NON_REVERSIBLE_TYPES.indexOf(txnRow.type) !== -1) {
    return { ok: false, error: txnRow.type + " entry reverse nahi hoti." };
  }
  if (txnRow.parentTxnId) {
    return { ok: false, error: "Ye entry " + txnRow.parentTxnId +
                               " ka hissa hai - us transaction ko reverse karo." };
  }

  // parent + uske saare children (jo abhi reverse nahi hue)
  const rows = [txnRow].concat(
    db.select("transactions", t => t.parentTxnId === txnRow.txnId &&
                                   t.type !== "Reversal" && !t.reversed));

  // ---- pehle check karo ki sab ho sakta hai (aadha kaam karke rukna nahi) ----
  const balances = {};
  for (const r of rows) {
    const acc = db.selectOne("accounts", a => a.accNo === r.accNo);
    if (acc === null) return { ok: false, error: "Account " + r.accNo + " nahi mila." };
    if (!(r.accNo in balances)) balances[r.accNo] = acc.balance;

    balances[r.accNo] += (r.direction === "debit") ? r.amount + (r.fee || 0) : -r.amount;

    const floor = -decorateAccount(acc).getExtraLimit();      // overdraft ho to minus tak chalega
    if (balances[r.accNo] < floor) {
      return { ok: false,
               error: "Account " + r.accNo + " me itna balance nahi hai ki " + r.txnId +
                      " (" + r.type + ") wapas ho sake." };
    }
  }

  // ---- ab asli kaam ----
  let mainResult = null;
  for (const r of rows) {
    const res = undoRowEffect(db, r);
    if (mainResult === null) mainResult = res;
  }

  return { ok: true, refId: mainResult.refId, balance: mainResult.balance,
           reversedCount: rows.length };
}

/* ek row ka asar ulta karo: balance, points, REVERSED nishaan,
   reversal ki nayi entry, aur customer ko alert (Observer) */
function undoRowEffect(db, row) {
  const account = db.selectOne("accounts", a => a.accNo === row.accNo);
  const total   = row.amount + (row.fee || 0);

  const newBalance = (row.direction === "debit") ? account.balance + total
                                                 : account.balance - row.amount;
  const changes = { balance: newBalance };
  if (row.points) {
    changes.rewardPoints = Math.max(0, (account.rewardPoints || 0) - row.points);
  }
  db.update("accounts", account.id, changes);
  db.update("transactions", row.id, { reversed: true });

  const user  = db.selectOne("users", u => u.id === account.userId);
  const event = {
    txnId:       "REV" + String(row.txnId).replace(/^TXN/, ""),
    accNo:       account.accNo,
    userId:      account.userId,
    holder:      user ? user.name : "Customer",
    type:        "Reversal",
    direction:   row.direction === "debit" ? "credit" : "debit",
    amount:      row.direction === "debit" ? total : row.amount,
    fee:         0,
    balance:     newBalance,
    mode:        "System Reversal",
    status:      "APPROVED",
    approvedBy:  "System",
    remark:      row.txnId + " (" + row.type + ") reverse ki gayi",
    parentTxnId: row.txnId
  };

  const fresh = db.selectOne("accounts", a => a.id === account.id);
  if (user) buildSubject(user, fresh).notify(event);
  else      new DatabaseLoggerObserver().update(event);

  return { refId: event.txnId, balance: newBalance };
}


/* ----------------------------------------------------------
   INVOKER : commands chalata hai aur history rakhta hai
   ---------------------------------------------------------- */
class CommandInvoker {

  constructor() {
    if (CommandInvoker.instance) return CommandInvoker.instance;
    this.db = DatabaseConnection.getInstance();
    CommandInvoker.instance = this;
  }

  static getInstance() {
    if (!CommandInvoker.instance) CommandInvoker.instance = new CommandInvoker();
    return CommandInvoker.instance;
  }

  run(command) {
    const result = command.execute();

    // sirf successful command hi history me jaati hai
    if (command.canUndo()) {
      this.db.insert("command_log", {
        label:    command.getLabel(),
        accNo:    result.accNo,
        userId:   result.userId,
        txnRowId: result.txnRowId,
        undone:   false,
        time:     new Date().toLocaleString()
      });
    }

    return result;
  }

  /* us user ki sabse aakhri command jo abhi undo ho sakti hai.
     Agar bank staff ne beech me use reverse kar diya tha to us
     command ko "undone" maan kar uske pehle wali dekhte hain. */
  lastUndoable(userId) {
    const rows = this.db.select("command_log", c => c.userId === userId && !c.undone);

    for (let i = rows.length - 1; i >= 0; i--) {
      const txn = this.db.selectOne("transactions", t => t.id === rows[i].txnRowId);
      if (txn !== null && canReverseRow(txn)) return rows[i];
      this.db.update("command_log", rows[i].id, { undone: true });
    }
    return null;
  }

  undoLast(userId) {
    const entry = this.lastUndoable(userId);
    if (entry === null) {
      return { ok: false, error: "Undo karne ke liye koi transaction nahi hai." };
    }

    const txnRow = this.db.selectOne("transactions", t => t.id === entry.txnRowId);
    const res    = reverseTransactionRow(txnRow);
    if (res.ok) {
      this.db.update("command_log", entry.id, { undone: true });
      res.label = entry.label;
    }
    return res;
  }

  history(userId) {
    return this.db.select("command_log", c => c.userId === userId).reverse();
  }
}
