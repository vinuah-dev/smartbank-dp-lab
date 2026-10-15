/* ==========================================================
   approval.js  -  SmartBank approval layer
   Pattern used here : CHAIN OF RESPONSIBILITY  (Experiment 1)

   Har paisa nikalne wali request is chain se guzarti hai.
   Jo handler use sambhal sakta hai wahi approve karta hai,
   warna request agle handler ke paas chali jaati hai.

   FraudCheck -> Clerk -> Manager -> Branch Head -> Rejected
   ========================================================== */

class ApprovalHandler {

  constructor(name) {
    this.name = name;
    this.next = null;
  }

  setNext(handler) {
    this.next = handler;
    return handler;               // chaining ke liye
  }

  // subclass isko override karti hai
  handle(request) {
    return this.passOn(request);
  }

  passOn(request) {
    if (this.next !== null) {
      return this.next.handle(request);
    }
    // chain khatam - koi approve nahi kar paya
    request.status     = "REJECTED";
    request.approvedBy = "-";
    request.trail.push({
      by: "System",
      action: "Rejected - amount bank ki approval limit se bahar hai"
    });
    return request;
  }
}


/* ---------- 0. Account ki halat check karo (STATE pattern) ----------
   Chain me ek naya handler jodna kitna aasan hai ye isse pata chalta
   hai - baaki kisi class ko haath nahi lagana pada. */
class AccountStatusHandler extends ApprovalHandler {

  constructor() { super("Account Status"); }

  handle(request) {
    const state   = getAccountState(request.accountStatus);
    const allowed = state.canDebit();

    if (!allowed.ok) {
      request.status     = "REJECTED";
      request.approvedBy = "-";
      request.trail.push({ by: this.name, action: "Rejected - " + allowed.reason });
      return request;
    }

    request.trail.push({ by: this.name, action: "Passed - account " + state.getName() + " hai" });
    return this.passOn(request);
  }
}


/* ---------- 1. Fraud / rule check ---------- */
class FraudCheckHandler extends ApprovalHandler {

  constructor() { super("Fraud Check"); }

  handle(request) {
    // FD account se withdrawal allowed nahi
    if (request.accountType === "Fixed Deposit") {
      request.status     = "REJECTED";
      request.approvedBy = "-";
      request.trail.push({
        by: this.name,
        action: "Rejected - Fixed Deposit account se paisa nahi nikal sakte"
      });
      return request;
    }

    // daily limit check - aaj jitna nikal chuke usko bhi jodo
    // (bank ki apni fee jaisi system debit par limit nahi lagti)
    if (!request.systemDebit && request.usedToday + request.amount > request.dailyLimit) {
      const left = Math.max(0, request.dailyLimit - request.usedToday);
      request.status     = "REJECTED";
      request.approvedBy = "-";
      request.trail.push({
        by: this.name,
        action: "Rejected - daily limit Rs. " + money(request.dailyLimit) +
                (request.usedToday > 0
                  ? " me se aaj Rs. " + money(request.usedToday) + " use ho chuka hai, sirf Rs. " +
                    money(left) + " baaki hai"
                  : " cross ho rahi hai")
      });
      return request;
    }

    // balance check - overdraft feature ho to utna extra chalega (DECORATOR)
    const usable = request.balance + request.extraLimit;

    if (request.amount > usable) {
      request.status     = "REJECTED";
      request.approvedBy = "-";
      request.trail.push({
        by: this.name,
        action: request.extraLimit > 0
          ? "Rejected - balance Rs. " + money(request.balance) + " + overdraft Rs. " +
            money(request.extraLimit) + " se bhi zyada amount hai"
          : "Rejected - account me itna balance nahi hai"
      });
      return request;
    }

    if (request.extraLimit > 0 && request.amount > request.balance) {
      request.trail.push({
        by: this.name,
        action: "Passed - overdraft feature se Rs. " +
                money(request.amount - request.balance) + " extra allow kiya"
      });
    } else {
      request.trail.push({ by: this.name, action: "Passed - koi problem nahi mili" });
    }
    return this.passOn(request);
  }
}


/* ---------- 2. Amount ke hisaab se approve karne wale ---------- */
class LimitApprover extends ApprovalHandler {

  constructor(name, limit) {
    super(name);
    this.limit = limit;
  }

  handle(request) {
    if (request.amount <= this.limit) {
      request.status     = "APPROVED";
      request.approvedBy = this.name;
      request.trail.push({
        by: this.name,
        action: "Approved (limit Rs. " + money(this.limit) + ")"
      });
      return request;
    }

    request.trail.push({
      by: this.name,
      action: "Limit Rs. " + money(this.limit) + " se zyada - upar bheja"
    });
    return this.passOn(request);
  }
}

class ClerkApprover extends LimitApprover {
  constructor() { super("Clerk", BankConfig.getInstance().clerkLimit); }
}

class ManagerApprover extends LimitApprover {
  constructor() { super("Manager", BankConfig.getInstance().managerLimit); }
}

class BranchHeadApprover extends LimitApprover {
  constructor() { super("Branch Head", BankConfig.getInstance().headLimit); }
}


/* ----------------------------------------------------------
   Chain ek jagah banayi hai taaki poore app me same rahe
   ---------------------------------------------------------- */
function buildApprovalChain() {
  const status  = new AccountStatusHandler();
  const fraud   = new FraudCheckHandler();
  const clerk   = new ClerkApprover();
  const manager = new ManagerApprover();
  const head    = new BranchHeadApprover();

  status.setNext(fraud).setNext(clerk).setNext(manager).setNext(head);
  return status;                // chain ka pehla handler
}

/* Kisi bhi debit request ko approval ke liye bhejo.
   Wapas milta hai: status, approvedBy aur poora trail. */
function requestApproval(details) {
  const request = {
    amount:        details.amount,
    balance:       details.balance,
    dailyLimit:    details.dailyLimit,
    accountType:   details.accountType,
    accountStatus: details.accountStatus || "Active",
    extraLimit:    details.extraLimit || 0,
    usedToday:     details.usedToday || 0,
    systemDebit:   details.systemDebit === true,
    purpose:       details.purpose,
    status:        "PENDING",
    approvedBy:    "",
    trail:         []
  };

  return buildApprovalChain().handle(request);
}
