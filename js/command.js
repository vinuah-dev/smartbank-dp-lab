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
   Ek transaction row ko ulta karne wala kaam.
   Isko invoker (undo) aur admin (reverse) dono use karte hain.
   ---------------------------------------------------------- */
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

  const account = db.selectOne("accounts", a => a.accNo === txnRow.accNo);
  if (account === null) {
    return { ok: false, error: "Account nahi mila." };
  }

  const total = txnRow.amount + (txnRow.fee || 0);

  // agar transfer thi to samne wale ka paisa wapas lena hoga
  let target = null;
  if (txnRow.toAccount) {
    target = db.selectOne("accounts", a => a.accNo === txnRow.toAccount);
    if (target && txnRow.direction === "debit" && target.balance < txnRow.amount) {
      return { ok: false,
               error: "Beneficiary " + target.accNo + " ke paas paisa wapas lene ke liye balance nahi hai." };
    }
  }

  let newBalance;

  if (txnRow.direction === "debit") {
    // paisa nikla tha -> wapas daalo
    newBalance = account.balance + total;
    db.update("accounts", account.id, { balance: newBalance });
    if (target) {
      db.update("accounts", target.id, { balance: target.balance - txnRow.amount });
    }
  } else {
    // paisa aaya tha -> wapas nikaalo
    if (account.balance < txnRow.amount) {
      return { ok: false, error: "Account me itna balance nahi ki reversal ho sake." };
    }
    newBalance = account.balance - txnRow.amount;
    db.update("accounts", account.id, { balance: newBalance });
  }

  // original row par nishaan laga do
  db.update("transactions", txnRow.id, { reversed: true });

  // reversal ki apni entry banao aur sabko batao (Observer)
  const user = db.selectOne("users", u => u.id === account.userId);

  const event = {
    txnId:      "REV" + txnRow.txnId.replace("TXN", ""),
    accNo:      account.accNo,
    userId:     account.userId,
    holder:     user ? user.name : "Customer",
    type:       "Reversal",
    direction:  txnRow.direction === "debit" ? "credit" : "debit",
    amount:     total,
    fee:        0,
    balance:    newBalance,
    mode:       "System Reversal",
    status:     "APPROVED",
    approvedBy: "System",
    remark:     txnRow.txnId + " reverse ki gayi"
  };

  if (user) {
    buildSubject(user, account).notify(event);
  } else {
    new DatabaseLoggerObserver().update(event);
  }

  return { ok: true, refId: event.txnId, balance: newBalance };
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

  // us user ki sabse aakhri command jo abhi undo nahi hui
  lastUndoable(userId) {
    const rows = this.db.select("command_log", c => c.userId === userId && !c.undone);
    return rows.length === 0 ? null : rows[rows.length - 1];
  }

  undoLast(userId) {
    const entry = this.lastUndoable(userId);
    if (entry === null) {
      return { ok: false, error: "Undo karne ke liye koi transaction nahi hai." };
    }

    const txnRow = this.db.selectOne("transactions", t => t.id === entry.txnRowId);
    if (txnRow === null) {
      return { ok: false, error: "Transaction record nahi mila." };
    }

    const res = reverseTransactionRow(txnRow);
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
