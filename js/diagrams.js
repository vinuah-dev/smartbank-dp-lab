/* ==========================================================
   diagrams.js  -  har pattern ka UML class diagram (data)
   uml.js inko SVG me draw karta hai. Class aur method ke naam
   wahi hain jo asli code (js/ folder) me hain.
   ========================================================== */

const PATTERN_DIAGRAMS = {

  /* ---------------- Experiment 1 ---------------- */
  singleton: {
    title: "Singleton - BankConfig, DatabaseConnection, SessionManager",
    cw: 235,
    classes: [
      { id: "cfg", name: "BankConfig", stereo: "singleton", r: 0, c: 0,
        fields: ["- static instance : BankConfig", "- bankName, ifsc", "- clerkLimit, managerLimit"],
        methods: ["- constructor()", "+ static getInstance()"] },
      { id: "db", name: "DatabaseConnection", stereo: "singleton", r: 0, c: 1,
        fields: ["- static instance", "- driver : StorageDriver", "- queryCount"],
        methods: ["+ static getInstance()", "+ insert() / select()", "+ update() / truncate()"] },
      { id: "ses", name: "SessionManager", stereo: "singleton", r: 0, c: 2,
        fields: ["- static instance", "- key"],
        methods: ["+ static getInstance()", "+ login() / logout()", "+ getUser()"] },
      { id: "client", name: "Pages / executeTransaction()", stereo: "client", kind: "client", r: 1, c: 1,
        methods: ["X.getInstance()  // hamesha same object"] }
    ],
    links: [
      { from: "client", to: "cfg", type: "uses" },
      { from: "client", to: "db",  type: "uses", label: "getInstance()" },
      { from: "client", to: "ses", type: "uses" }
    ],
    caption: "Constructor khud check karta hai ki instance pehle se hai ya nahi - hai to wahi lauta deta hai."
  },

  cor: {
    title: "Chain of Responsibility - transaction approval",
    cw: 200,
    classes: [
      { id: "client", name: "requestApproval()", stereo: "client", kind: "client", r: 0, c: 0,
        methods: ["buildApprovalChain()", "chain.handle(request)"] },
      { id: "h", name: "ApprovalHandler", stereo: "abstract", r: 0, c: 2,
        fields: ["- name", "- next : ApprovalHandler"],
        methods: ["+ setNext(h) : ApprovalHandler", "+ handle(request)", "# passOn(request)"] },
      { id: "st", name: "AccountStatusHandler", r: 1, c: 1, methods: ["+ handle(req)"], fields: ["state.canDebit()"] },
      { id: "fr", name: "FraudCheckHandler", r: 1, c: 2, methods: ["+ handle(req)"], fields: ["FD, daily limit, balance"] },
      { id: "lim", name: "LimitApprover", stereo: "abstract", r: 1, c: 3, fields: ["- limit"], methods: ["+ handle(req)"] },
      { id: "cl", name: "ClerkApprover", r: 2, c: 2, fields: ["limit = 10,000"] },
      { id: "mg", name: "ManagerApprover", r: 2, c: 3, fields: ["limit = 1,00,000"] },
      { id: "bh", name: "BranchHeadApprover", r: 2, c: 4, fields: ["limit = 10,00,000"] }
    ],
    links: [
      { from: "client", to: "h", type: "uses" },
      { from: "h", to: "h", type: "self", label: "next" },
      { from: "st", to: "h", type: "extends" },
      { from: "fr", to: "h", type: "extends" },
      { from: "lim", to: "h", type: "extends" },
      { from: "cl", to: "lim", type: "extends" },
      { from: "mg", to: "lim", type: "extends" },
      { from: "bh", to: "lim", type: "extends" }
    ],
    caption: "Chain: Account Status -> Fraud Check -> Clerk -> Manager -> Branch Head. Jo sambhal sake wahi approve karta hai, warna next ko de deta hai."
  },

  /* ---------------- Experiment 2 ---------------- */
  factory: {
    title: "Factory Method - account creation",
    cw: 210,
    classes: [
      { id: "client", name: "BankingFacade.register()", stereo: "client", kind: "client", r: 0, c: 0,
        methods: ["getAccountFactory(type)", "  .openAccount(userId, amt)"] },
      { id: "af", name: "AccountFactory", stereo: "abstract", r: 0, c: 1.5,
        methods: ["+ openAccount(userId, amount)", "+ createAccount()  // factory method"] },
      { id: "sf", name: "SavingsAccountFactory", r: 1, c: 0.5, methods: ["+ createAccount()"] },
      { id: "cf", name: "CurrentAccountFactory", r: 1, c: 1.5, methods: ["+ createAccount()"] },
      { id: "ff", name: "FDAccountFactory", r: 1, c: 2.5, methods: ["+ createAccount()"] },
      { id: "sa", name: "SavingsAccount", r: 2, c: 0.5, fields: ["min 1,000 | 4%"] },
      { id: "ca", name: "CurrentAccount", r: 2, c: 1.5, fields: ["min 10,000 | 0%"] },
      { id: "fa", name: "FixedDepositAccount", r: 2, c: 2.5, fields: ["min 25,000 | 7.5%", "canWithdraw() = false"] },
      { id: "ba", name: "BankAccount", stereo: "abstract", r: 3, c: 1.5,
        fields: ["- accNo, userId, balance"],
        methods: ["+ getType()", "+ getMinBalance()", "+ getDailyLimit()", "+ canWithdraw()"] }
    ],
    links: [
      { from: "client", to: "af", type: "uses" },
      { from: "sf", to: "af", type: "extends" },
      { from: "cf", to: "af", type: "extends" },
      { from: "ff", to: "af", type: "extends" },
      { from: "sf", to: "sa", type: "creates" },
      { from: "cf", to: "ca", type: "creates" },
      { from: "ff", to: "fa", type: "creates" },
      { from: "sa", to: "ba", type: "extends" },
      { from: "ca", to: "ba", type: "extends" },
      { from: "fa", to: "ba", type: "extends" }
    ],
    caption: "openAccount() common kaam karta hai; kaunsa object banega ye subclass ka createAccount() decide karta hai."
  },

  proxy: {
    title: "Proxy - protected, lazy and logged account access",
    cw: 230,
    classes: [
      { id: "client", name: "executeTransaction()", stereo: "client", kind: "client", r: 0, c: 0,
        methods: ["new AccountProxy(accNo, userId)"] },
      { id: "svc", name: "AccountService", stereo: "interface", r: 0, c: 1.5,
        methods: ["+ getBalance()", "+ getDetails()", "+ credit(amt)", "+ debit(amt)"] },
      { id: "px", name: "AccountProxy", stereo: "proxy", r: 1, c: 1,
        fields: ["- real : RealAccountService = null", "- userId"],
        methods: ["- _checkAccess(op)  // owner?", "- _getReal()  // lazy", "+ getBalance() ..."] },
      { id: "real", name: "RealAccountService", r: 1, c: 2,
        fields: ["- accNo", "- row"],
        methods: ["+ getBalance()", "+ credit(amt)", "+ debit(amt)"] },
      { id: "log", name: "access_log", stereo: "table", kind: "table", r: 2, c: 1,
        fields: ["operation, is_allowed, reason"] }
    ],
    links: [
      { from: "client", to: "svc", type: "uses" },
      { from: "px", to: "svc", type: "implements" },
      { from: "real", to: "svc", type: "implements" },
      { from: "px", to: "real", type: "assoc", label: "real" },
      { from: "px", to: "log", type: "uses", label: "INSERT" }
    ],
    caption: "Client ko pata hi nahi ki wo proxy se baat kar raha hai. Proxy owner check karta hai, real object der se banata hai aur har access log karta hai."
  },

  /* ---------------- Experiment 3 ---------------- */
  abstractFactory: {
    title: "Abstract Factory - channel skins",
    cw: 195,
    classes: [
      { id: "af", name: "ChannelFactory", stereo: "abstract", r: 0, c: 1,
        methods: ["+ createTheme()", "+ createLayout()", "+ createWording()"] },
      { id: "client", name: "applyChannel(code)", stereo: "client", kind: "client", r: 0, c: 3,
        methods: ["factory.createTheme().vars()", "factory.createWording()"] },
      { id: "atm", name: "ATMFactory", r: 1, c: 0 },
      { id: "mob", name: "MobileAppFactory", r: 1, c: 1 },
      { id: "web", name: "WebPortalFactory", r: 1, c: 2 },
      { id: "fa", name: "ATM family", stereo: "products", r: 2, c: 0, fields: ["ATMTheme", "ATMLayout", "ATMWording"] },
      { id: "fm", name: "Mobile family", stereo: "products", r: 2, c: 1, fields: ["MobileTheme", "MobileLayout", "MobileWording"] },
      { id: "fw", name: "Web family", stereo: "products", r: 2, c: 2, fields: ["WebTheme", "WebLayout", "WebWording"] },
      { id: "ap", name: "Abstract products", stereo: "abstract", r: 2, c: 3,
        fields: ["ChannelTheme.vars()", "ChannelLayout.vars()", "ChannelWording.payButton()"] }
    ],
    links: [
      { from: "client", to: "af", type: "uses" },
      { from: "client", to: "ap", type: "uses" },
      { from: "atm", to: "af", type: "extends" },
      { from: "mob", to: "af", type: "extends" },
      { from: "web", to: "af", type: "extends" },
      { from: "atm", to: "fa", type: "creates" },
      { from: "mob", to: "fm", type: "creates" },
      { from: "web", to: "fw", type: "creates" }
    ],
    caption: "Client sirf abstract factory aur abstract products ko jaanta hai. Ek factory poori family deti hai, isliye ATM ka theme kabhi Mobile ke wording ke saath nahi lagta."
  },

  bridge: {
    title: "Bridge - payment type x gateway",
    cw: 172,
    classes: [
      { id: "pay", name: "Payment", stereo: "abstraction", r: 0, c: 1,
        fields: ["# gateway : PaymentGateway"], methods: ["+ execute(amt, ctx)", "+ getTotal(amt)"] },
      { id: "gw", name: "PaymentGateway", stereo: "implementor", r: 0, c: 4.5,
        methods: ["+ process(amt, ctx)", "+ getFee(amt)", "+ getMaxLimit()"] },
      { id: "mt", name: "MoneyTransfer", r: 1, c: 0, methods: ["+ execute()"] },
      { id: "bp", name: "BillPayment", r: 1, c: 1, methods: ["+ execute()"] },
      { id: "mr", name: "MobileRecharge", r: 1, c: 2, methods: ["+ execute()"] },
      { id: "upi", name: "UPIGateway", r: 1, c: 3, fields: ["fee 0"] },
      { id: "card", name: "CardGateway", r: 1, c: 4, fields: ["fee 2%"] },
      { id: "nb", name: "NetBankingGateway", r: 1, c: 5, fields: ["fee Rs. 5"] },
      { id: "wal", name: "WalletGatewayAdapter", r: 1, c: 6, fields: ["fee 1.5%"] }
    ],
    links: [
      { from: "pay", to: "gw", type: "has", label: "bridge" },
      { from: "mt", to: "pay", type: "extends" },
      { from: "bp", to: "pay", type: "extends" },
      { from: "mr", to: "pay", type: "extends" },
      { from: "upi", to: "gw", type: "extends" },
      { from: "card", to: "gw", type: "extends" },
      { from: "nb", to: "gw", type: "extends" },
      { from: "wal", to: "gw", type: "extends" }
    ],
    caption: "3 payment types x 4 gateways = 12 combinations, lekin classes sirf 3 + 4 = 7. Naya gateway = sirf 1 nayi class."
  },

  /* ---------------- Experiment 4 ---------------- */
  observer: {
    title: "Observer + Database - transaction alerts",
    cw: 190,
    classes: [
      { id: "client", name: "executeTransaction()", stereo: "client", kind: "client", r: 0, c: 0,
        methods: ["buildSubject(user, acc)", "  .notify(event)"] },
      { id: "sub", name: "TransactionSubject", stereo: "subject", r: 0, c: 1.6,
        fields: ["- observers : TransactionObserver[]"],
        methods: ["+ attach(o)", "+ detach(name)", "+ notify(event)"] },
      { id: "obs", name: "TransactionObserver", stereo: "interface", r: 0, c: 3.4,
        methods: ["+ update(event)", "+ getName()"] },
      { id: "sms", name: "SMSObserver", r: 1, c: 1.4 },
      { id: "em", name: "EmailObserver", r: 1, c: 2.4 },
      { id: "push", name: "AppPushObserver", r: 1, c: 3.4 },
      { id: "low", name: "LowBalanceObserver", r: 1, c: 4.4, fields: ["only if balance < min"] },
      { id: "dbl", name: "DatabaseLoggerObserver", r: 1, c: 5.4, fields: ["never detached"] },
      { id: "nt", name: "notifications", stereo: "table", kind: "table", r: 2, c: 2.9, fields: ["user_id, channel, message"] },
      { id: "tt", name: "transactions", stereo: "table", kind: "table", r: 2, c: 5.4, fields: ["txn_id, amount, balance_after"] }
    ],
    links: [
      { from: "client", to: "sub", type: "uses" },
      { from: "sub", to: "obs", type: "has", label: "observers" },
      { from: "sms", to: "obs", type: "extends" },
      { from: "em", to: "obs", type: "extends" },
      { from: "push", to: "obs", type: "extends" },
      { from: "low", to: "obs", type: "extends" },
      { from: "dbl", to: "obs", type: "extends" },
      { from: "sms", to: "nt", type: "uses" },
      { from: "em", to: "nt", type: "uses" },
      { from: "push", to: "nt", type: "uses", label: "INSERT" },
      { from: "low", to: "nt", type: "uses" },
      { from: "dbl", to: "tt", type: "uses", label: "INSERT" }
    ],
    caption: "Subject ko nahi pata ki observer kya karega. SMS, Email, Push aur Low Balance observers 'notifications' table me likhte hain; Database Logger 'transactions' table me."
  },

  /* ---------------- Extra patterns ---------------- */
  state: {
    title: "State - Active / Frozen / Closed",
    cw: 205,
    classes: [
      { id: "ctx", name: "Account (context)", stereo: "context", r: 0, c: 0,
        fields: ["- status : string"], methods: ["getAccountState(status)"] },
      { id: "st", name: "AccountState", stereo: "abstract", r: 0, c: 2,
        methods: ["+ canDebit()", "+ canCredit()", "+ canClose()"] },
      { id: "user", name: "AccountStatusHandler", stereo: "client", kind: "client", r: 0, c: 3.6,
        methods: ["state.canDebit()"] },
      { id: "a", name: "ActiveState", r: 1, c: 1, fields: ["debit yes | credit yes"] },
      { id: "f", name: "FrozenState", r: 1, c: 2, fields: ["debit no  | credit yes"] },
      { id: "cl", name: "ClosedState", r: 1, c: 3, fields: ["debit no  | credit no"] }
    ],
    links: [
      { from: "ctx", to: "st", type: "assoc", label: "current state" },
      { from: "user", to: "st", type: "uses" },
      { from: "a", to: "st", type: "extends" },
      { from: "f", to: "st", type: "extends" },
      { from: "cl", to: "st", type: "extends" }
    ],
    caption: "Status badalte hi object badal jaata hai, aur uske saath behaviour bhi - code me if (status == 'Frozen') nahi likhna padta."
  },

  strategy: {
    title: "Strategy - interest formula",
    cw: 215,
    classes: [
      { id: "ctx", name: "BankingFacade", stereo: "context", r: 0, c: 0.5,
        methods: ["+ applyInterest(accNo, years)", "getInterestStrategy(type)"] },
      { id: "st", name: "InterestStrategy", stereo: "interface", r: 0, c: 2,
        methods: ["+ calculate(principal, years)", "+ getRate()", "+ getFormula()"] },
      { id: "n", name: "NoInterestStrategy", r: 1, c: 1, fields: ["Current account"] },
      { id: "s", name: "SimpleInterestStrategy", r: 1, c: 2, fields: ["Savings 4%", "P x R x T / 100"] },
      { id: "c", name: "CompoundInterestStrategy", r: 1, c: 3, fields: ["FD 7.5%, quarterly", "P(1 + R/100n)^(nT) - P"] }
    ],
    links: [
      { from: "ctx", to: "st", type: "assoc", label: "strategy" },
      { from: "n", to: "st", type: "implements" },
      { from: "s", to: "st", type: "implements" },
      { from: "c", to: "st", type: "implements" }
    ],
    caption: "Formula account class ke andar nahi hai. Naya scheme = ek nayi strategy class, purana code nahi badalta."
  },

  command: {
    title: "Command - undo and reversal",
    cw: 215,
    classes: [
      { id: "fac", name: "BankingFacade", stereo: "client", kind: "client", r: 0, c: 0,
        methods: ["+ transact(request)", "+ undoLast()"] },
      { id: "inv", name: "CommandInvoker", stereo: "invoker", r: 0, c: 1.5,
        methods: ["+ run(command)", "+ lastUndoable(userId)", "+ undoLast(userId)"] },
      { id: "cmd", name: "Command", stereo: "abstract", r: 0, c: 3,
        methods: ["+ execute()", "+ undo()", "+ canUndo()"] },
      { id: "log", name: "command_log", stereo: "table", kind: "table", r: 1, c: 0.5,
        fields: ["label, txn_row_id, is_undone"] },
      { id: "tc", name: "TransactionCommand", r: 1, c: 3,
        fields: ["- request", "- result"], methods: ["+ execute()", "+ canUndo()"] },
      { id: "rev", name: "reverseTransactionRow()", stereo: "receiver", r: 2, c: 1.5,
        methods: ["balance wapas", "linked cashback / transfer-in bhi", "REVERSED + reversal entry"] },
      { id: "ex", name: "executeTransaction()", stereo: "receiver", r: 2, c: 3,
        methods: ["poora transaction engine"] }
    ],
    links: [
      { from: "fac", to: "inv", type: "uses", label: "run()" },
      { from: "inv", to: "cmd", type: "assoc" },
      { from: "inv", to: "log", type: "uses", label: "INSERT" },
      { from: "tc", to: "cmd", type: "extends" },
      { from: "inv", to: "rev", type: "uses", label: "undo" },
      { from: "tc", to: "ex", type: "uses", label: "execute()" }
    ],
    caption: "Har transaction ek object hai. Invoker history database me rakhta hai, isliye page badalne par bhi undo kaam karta hai."
  },

  decorator: {
    title: "Decorator - account add-ons",
    cw: 190,
    classes: [
      { id: "comp", name: "AccountComponent", stereo: "abstract", r: 0, c: 1.5,
        methods: ["+ getDescription()", "+ getMonthlyFee()", "+ getExtraLimit()", "+ getCashback(type, amt)"] },
      { id: "client", name: "decorateAccount(row)", stereo: "client", kind: "client", r: 0, c: 3.4,
        methods: ["new CashbackFeature(", "  new BasicAccount(row))"] },
      { id: "basic", name: "BasicAccount", r: 1, c: 0.5, fields: ["- row"] },
      { id: "dec", name: "AccountFeature", stereo: "decorator", r: 1, c: 2.5,
        fields: ["- inner : AccountComponent"], methods: ["inner ko pass karta hai"] },
      { id: "cb", name: "CashbackFeature", r: 2, c: 1, fields: ["+1% on bills"] },
      { id: "od", name: "OverdraftFeature", r: 2, c: 2, fields: ["+Rs. 10,000 limit"] },
      { id: "ins", name: "InsuranceFeature", r: 2, c: 3, fields: ["+Rs. 99 / month"] },
      { id: "rp", name: "RewardPointsFeature", r: 2, c: 4, fields: ["+2 pts / Rs. 100"] }
    ],
    links: [
      { from: "client", to: "comp", type: "uses" },
      { from: "basic", to: "comp", type: "extends" },
      { from: "dec", to: "comp", type: "extends", label: "extends + wraps" },
      { from: "cb", to: "dec", type: "extends" },
      { from: "od", to: "dec", type: "extends" },
      { from: "ins", to: "dec", type: "extends" },
      { from: "rp", to: "dec", type: "extends" }
    ],
    caption: "Har feature andar wale account ko wrap karta hai aur apna hissa jodta hai. Kitne bhi feature ek ke upar ek lag sakte hain."
  },

  adapter: {
    title: "Adapter - third party QuickPay wallet",
    cw: 215,
    classes: [
      { id: "client", name: "Payment (Bridge)", stereo: "client", kind: "client", r: 0, c: 0.6,
        methods: ["gateway.process(rupees, ctx)"] },
      { id: "target", name: "PaymentGateway", stereo: "target", r: 0, c: 2,
        methods: ["+ process(amount, ctx)", "+ getFee(amount)", "+ getMaxLimit()"] },
      { id: "others", name: "UPI / Card / NetBanking", r: 1, c: 1 },
      { id: "ad", name: "WalletGatewayAdapter", stereo: "adapter", r: 1, c: 3,
        fields: ["- api : QuickPayWalletAPI"],
        methods: ["+ getFee(rupees)", "+ process(rupees, ctx)"] },
      { id: "ade", name: "QuickPayWalletAPI", stereo: "adaptee (third party)", r: 2, c: 3,
        methods: ["+ walletTransfer(paise, id)", "+ fetchCommission(paise)", "+ maxTransferPaise()"] }
    ],
    links: [
      { from: "client", to: "target", type: "uses" },
      { from: "others", to: "target", type: "extends" },
      { from: "ad", to: "target", type: "extends" },
      { from: "ad", to: "ade", type: "assoc", label: "rupees -> paise" }
    ],
    caption: "QuickPay ka interface alag hai (paise, alag method names, statusCode). Adapter usse PaymentGateway jaisa bana deta hai."
  },

  facade: {
    title: "Facade - BankingFacade",
    cw: 190,
    classes: [
      { id: "pages", name: "HTML pages", stereo: "client", kind: "client", r: 0, c: 2,
        methods: ["banking, transfer, admin ..."] },
      { id: "f", name: "BankingFacade", stereo: "facade, singleton", r: 1, c: 2,
        methods: ["+ login() / register()", "+ transact(request)", "+ undoLast() / reverse(id)",
                  "+ setStatus() / setFeatures()", "+ applyInterest() / statement()"] },
      { id: "s1", name: "CommandInvoker", r: 2, c: 0 },
      { id: "s2", name: "AccountProxy", r: 2, c: 1 },
      { id: "s3", name: "AccountFactory", r: 2, c: 2 },
      { id: "s4", name: "decorateAccount()", r: 2, c: 3 },
      { id: "s5", name: "InterestStrategy", r: 2, c: 4 }
    ],
    links: [
      { from: "pages", to: "f", type: "uses" },
      { from: "f", to: "s1", type: "uses" },
      { from: "f", to: "s2", type: "uses" },
      { from: "f", to: "s3", type: "uses" },
      { from: "f", to: "s4", type: "uses" },
      { from: "f", to: "s5", type: "uses" }
    ],
    caption: "Pages ko andar ke 10 hisson se alag alag baat nahi karni padti - sirf BankingFacade se."
  },

  builder: {
    title: "Builder - transaction request",
    cw: 230,
    classes: [
      { id: "client", name: "transfer.html script", stereo: "client", kind: "client", r: 0, c: 0,
        methods: ["TransactionBuilder.create()", "  .debit().amount(5000)", "  .via('transfer','upi')", "  .to(acc).build()"] },
      { id: "b", name: "TransactionBuilder", stereo: "builder", r: 0, c: 1.25,
        fields: ["- req"],
        methods: ["+ static create()", "+ debit() / credit()", "+ type(t) / amount(a)", "+ via(type, gateway)", "+ to(accNo) / remark(r)", "+ build() : request"] },
      { id: "p", name: "request", stereo: "product", r: 0, c: 2.5,
        fields: ["direction, type, amount", "mode, gatewayCode", "toAccount, ctx, remark"] },
      { id: "f", name: "BankingFacade.transact()", r: 1, c: 2.5 }
    ],
    links: [
      { from: "client", to: "b", type: "uses" },
      { from: "b", to: "p", type: "creates" },
      { from: "p", to: "f", type: "uses" }
    ],
    caption: "build() check karta hai ki amount sahi hai aur payment ke saath gateway diya hai - galat request bante hi pakdi jaati hai."
  }
};


/* ER diagram database schema se apne aap banta hai */
function erDiagramSpec() {
  const short = t => t.split(" ")[0];
  const pos = {
    users:         { r: 0, c: 0.6 },
    accounts:      { r: 0, c: 2.2 },
    notifications: { r: 1, c: 0 },
    access_log:    { r: 1, c: 1.1 },
    transactions:  { r: 1, c: 2.35 },
    command_log:   { r: 1, c: 3.5 }
  };
  const classes = [], links = [];

  for (const name in DB_SCHEMA.tables) {
    const t = DB_SCHEMA.tables[name];
    const fks = t.foreign.map(f => f[0]);
    classes.push({
      id: name, name: name, stereo: "table", kind: "table",
      r: pos[name].r, c: pos[name].c,
      fields: ["PK id INTEGER"].concat(t.columns.map(col =>
        (fks.indexOf(col[1]) !== -1 ? "FK " : "   ") + col[1] + " " + short(col[2])))
    });
  }

  const wanted = [["accounts", "users"], ["notifications", "users"], ["access_log", "accounts"],
                  ["transactions", "accounts"], ["command_log", "transactions"]];
  for (const [from, to] of wanted) links.push({ from: from, to: to, type: "assoc" });

  return { title: "SmartBank database (ER diagram)", cw: 230, classes: classes, links: links,
           caption: "Har table ka ek 'extra' column bhi hai jisme schema ke bahar wali keys JSON me jaati hain." };
}
