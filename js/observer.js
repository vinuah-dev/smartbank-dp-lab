/* ==========================================================
   observer.js  -  SmartBank alert layer
   Pattern used here : OBSERVER + DATABASE  (Experiment 4)

   Jab bhi account ka balance badalta hai, bahut saare logon ko
   khabar deni padti hai - customer ko SMS, email, app push, aur
   bank ke database me entry.

   Subject (TransactionSubject) ko ye nahi pata ki observer
   karega kya. Wo bas sabko update() bhej deta hai.

   Settings page se user apne alerts on/off kar sakta hai -
   observers attach/detach runtime par hote hain.
   ========================================================== */


/* ---------- Observer interface ---------- */
class TransactionObserver {
  update(event) {}
  getName() { return "Observer"; }
}


/* ---------- Concrete Observers ---------- */

class SMSObserver extends TransactionObserver {

  constructor(mobile) { super(); this.mobile = mobile; }
  getName() { return "SMS Alert"; }

  update(event) {
    const word = (event.direction === "credit") ? "credited to" : "debited from";
    const msg  = "Rs. " + money(event.amount) + " " + word + " a/c " +
                 maskAcc(event.accNo) + ". Avl Bal Rs. " + money(event.balance) +
                 ". Ref " + event.txnId + ". -SmartBank";

    DatabaseConnection.getInstance().insert("notifications", {
      userId:  event.userId,
      channel: "SMS",
      target:  this.mobile,
      title:   "SMS to " + this.mobile,
      message: msg,
      read:    false,
      time:    new Date().toLocaleString()
    });
  }
}


class EmailObserver extends TransactionObserver {

  constructor(email) { super(); this.email = email; }
  getName() { return "Email Alert"; }

  update(event) {
    const msg = "Dear " + event.holder + ",\n" +
                "A " + event.type + " of Rs. " + money(event.amount) +
                " was made on your account " + event.accNo + " via " + event.mode + ".\n" +
                "Updated balance: Rs. " + money(event.balance) + "\n" +
                "Reference: " + event.txnId;

    DatabaseConnection.getInstance().insert("notifications", {
      userId:  event.userId,
      channel: "Email",
      target:  this.email,
      title:   "Transaction Alert " + event.txnId,
      message: msg,
      read:    false,
      time:    new Date().toLocaleString()
    });
  }
}


class AppPushObserver extends TransactionObserver {

  getName() { return "App Push"; }

  update(event) {
    const sign = (event.direction === "credit") ? "+" : "-";
    DatabaseConnection.getInstance().insert("notifications", {
      userId:  event.userId,
      channel: "Push",
      target:  "SmartBank App",
      title:   event.type + " " + sign + " Rs. " + money(event.amount),
      message: event.remark + " | Balance Rs. " + money(event.balance),
      read:    false,
      time:    new Date().toLocaleString()
    });
  }
}


/* Ye observer sirf tab bolta hai jab balance minimum se neeche
   chala jaaye - dikhata hai ki har observer ka apna logic hota hai. */
class LowBalanceObserver extends TransactionObserver {

  constructor(minBalance) { super(); this.minBalance = minBalance; }
  getName() { return "Low Balance Warning"; }

  update(event) {
    if (event.balance >= this.minBalance) return;      // kuch mat karo

    DatabaseConnection.getInstance().insert("notifications", {
      userId:  event.userId,
      channel: "Alert",
      target:  "SmartBank App",
      title:   "Low balance warning",
      message: "Aapka balance Rs. " + money(event.balance) +
               " hai jo minimum Rs. " + money(this.minBalance) +
               " se kam hai. Kripya paisa jama karein.",
      read:    false,
      time:    new Date().toLocaleString()
    });
  }
}


/* Ye observer transaction ko database me save karta hai.
   Isko kabhi band nahi kiya jaata - bank record zaroori hai. */
class DatabaseLoggerObserver extends TransactionObserver {

  getName() { return "Database Logger"; }

  update(event) {
    DatabaseConnection.getInstance().insert("transactions", {
      txnId:      event.txnId,
      accNo:      event.accNo,
      userId:     event.userId,
      type:       event.type,
      direction:  event.direction,
      amount:     event.amount,
      fee:        event.fee || 0,
      balance:    event.balance,
      mode:       event.mode,
      status:     event.status,
      approvedBy: event.approvedBy,
      remark:     event.remark,
      toAccount:  event.toAccount || null,     // reversal ke liye zaroori
      parentTxnId: event.parentTxnId || null,  // cashback / transfer-in kis txn se juda hai
      points:     event.points || 0,
      reversed:   false,
      time:       new Date().toLocaleString(),
      ts:         new Date().toISOString()     // daily limit ke hisaab ke liye
    });
  }
}


/* ---------- Subject (Observable) ---------- */
class TransactionSubject {

  constructor() {
    this.observers = [];
  }

  attach(observer) {
    this.observers.push(observer);
    return this;
  }

  detach(name) {
    this.observers = this.observers.filter(o => o.getName() !== name);
    return this;
  }

  getObserverNames() {
    return this.observers.map(o => o.getName());
  }

  // sabhi observers ko khabar do
  notify(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
    return this.observers.length;
  }
}


/* ----------------------------------------------------------
   User ki settings ke hisaab se subject taiyaar karo.
   Alerts on/off karne par yahi attach/detach hota hai.
   Settings har user ki apni hoti hain (users table me save).
   ---------------------------------------------------------- */
const DEFAULT_ALERT_PREFS = { sms: true, email: true, push: true, lowBalance: true };

function getAlertPrefs(user) {
  const saved = user && user.alertPrefs ? user.alertPrefs : {};
  return Object.assign({}, DEFAULT_ALERT_PREFS, saved);
}

function saveAlertPrefs(userId, prefs) {
  const clean = {
    sms:        !!prefs.sms,
    email:      !!prefs.email,
    push:       !!prefs.push,
    lowBalance: !!prefs.lowBalance
  };
  DatabaseConnection.getInstance().update("users", userId, { alertPrefs: clean });
  return clean;
}

function buildSubject(user, account) {
  const prefs   = getAlertPrefs(user);
  const subject = new TransactionSubject();

  if (prefs.sms)        subject.attach(new SMSObserver(user.mobile));
  if (prefs.email)      subject.attach(new EmailObserver(user.email));
  if (prefs.push)       subject.attach(new AppPushObserver());
  if (prefs.lowBalance) subject.attach(new LowBalanceObserver(account.minBalance));

  // ye hamesha lagta hai - bank ka record kabhi band nahi hota
  subject.attach(new DatabaseLoggerObserver());

  return subject;
}
