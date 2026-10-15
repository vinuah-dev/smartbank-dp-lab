/* ==========================================================
   channels.js  -  SmartBank channel (skin) layer
   Pattern used here : ABSTRACT FACTORY  (Experiment 3)

   SmartBank teen channel par chalta hai - ATM, Mobile App aur
   Web Portal. Har channel ke liye teen cheezein chahiye:
        Theme   (colours + font)
        Layout  (corners, spacing, shadow)
        Wording (screen par kya likha jaayega)

   Ye teeno ek family hai - inhe mix nahi karna chahiye.
   Abstract Factory poori family ek saath deta hai, isliye
   ATM ka theme kabhi mobile ke wording ke saath nahi lagega.

   Header me channel badalte hi poori website ka look badal
   jaata hai - ye pattern sach me kaam kar raha hai.
   ========================================================== */


/* ---------- Abstract Products ---------- */
class ChannelTheme  { vars() { return {}; } }
class ChannelLayout { vars() { return {}; } }
class ChannelWording {
  greeting(name) { return "Hello " + name; }
  payButton()    { return "Pay"; }
  balanceLabel() { return "Balance"; }
  tagline()      { return ""; }
}


/* ---------- ATM family ---------- */
class ATMTheme extends ChannelTheme {
  vars() {
    return {
      "--brand":      "#0f7b34",
      "--brand-dark": "#0a5a25",
      "--bg":         "#0d1b0d",
      "--card":       "#122612",
      "--text":       "#c9f7c9",
      "--muted":      "#7fbf7f",
      "--border":     "#2c552c",
      "--font":       "'Consolas', 'Courier New', monospace"
    };
  }
}
class ATMLayout extends ChannelLayout {
  vars() {
    return { "--radius": "0px", "--btn-radius": "0px",
             "--shadow": "none", "--pad": "14px" };
  }
}
class ATMWording extends ChannelWording {
  greeting(name) { return "WELCOME, " + name.toUpperCase(); }
  payButton()    { return "CONFIRM"; }
  balanceLabel() { return "AVAILABLE BALANCE"; }
  tagline()      { return "ATM MODE - PLEASE SELECT AN OPTION"; }
}


/* ---------- Mobile App family ---------- */
class MobileTheme extends ChannelTheme {
  vars() {
    return {
      "--brand":      "#6a3de8",
      "--brand-dark": "#5228c9",
      "--bg":         "#f3f0ff",
      "--card":       "#ffffff",
      "--text":       "#1f1235",
      "--muted":      "#7a6f96",
      "--border":     "#e0d8fb",
      "--font":       "'Segoe UI', Roboto, Arial, sans-serif"
    };
  }
}
class MobileLayout extends ChannelLayout {
  vars() {
    return { "--radius": "18px", "--btn-radius": "22px",
             "--shadow": "0 2px 10px rgba(106,61,232,0.12)", "--pad": "18px" };
  }
}
class MobileWording extends ChannelWording {
  greeting(name) { return "Hi " + name.split(" ")[0] + "!"; }
  payButton()    { return "Pay Now"; }
  balanceLabel() { return "Available Balance"; }
  tagline()      { return "Mobile App mode"; }
}


/* ---------- Web Portal family ---------- */
class WebTheme extends ChannelTheme {
  vars() {
    return {
      "--brand":      "#1a4d8f",
      "--brand-dark": "#143c6f",
      "--bg":         "#f2f4f7",
      "--card":       "#ffffff",
      "--text":       "#222222",
      "--muted":      "#6b7280",
      "--border":     "#d5d9e0",
      "--font":       "Arial, Helvetica, sans-serif"
    };
  }
}
class WebLayout extends ChannelLayout {
  vars() {
    return { "--radius": "6px", "--btn-radius": "4px",
             "--shadow": "0 1px 3px rgba(0,0,0,0.06)", "--pad": "18px" };
  }
}
class WebWording extends ChannelWording {
  greeting(name) { return "Welcome back, " + name; }
  payButton()    { return "Submit Payment"; }
  balanceLabel() { return "Account Balance"; }
  tagline()      { return "Net Banking Portal"; }
}


/* ---------- Abstract Factory ---------- */
class ChannelFactory {
  createTheme()   {}
  createLayout()  {}
  createWording() {}
  getName()       { return "Channel"; }
}

/* ---------- Concrete Factories ---------- */
class ATMFactory extends ChannelFactory {
  createTheme()   { return new ATMTheme();   }
  createLayout()  { return new ATMLayout();  }
  createWording() { return new ATMWording(); }
  getName()       { return "ATM Machine";    }
}

class MobileAppFactory extends ChannelFactory {
  createTheme()   { return new MobileTheme();   }
  createLayout()  { return new MobileLayout();  }
  createWording() { return new MobileWording(); }
  getName()       { return "Mobile App";        }
}

class WebPortalFactory extends ChannelFactory {
  createTheme()   { return new WebTheme();   }
  createLayout()  { return new WebLayout();  }
  createWording() { return new WebWording(); }
  getName()       { return "Web Portal";     }
}

function getChannelFactory(code) {
  if (code === "atm")    return new ATMFactory();
  if (code === "mobile") return new MobileAppFactory();
  return new WebPortalFactory();
}


/* ----------------------------------------------------------
   Client code.
   Dhyaan do: is function ko nahi pata konsa channel chal raha
   hai. Wo sirf factory se teen product maangta hai aur laga
   deta hai. Isliye kabhi galat family mix nahi ho sakti.
   ---------------------------------------------------------- */
let CURRENT_WORDING = new WebWording();

function applyChannel(code) {
  const factory = getChannelFactory(code);

  const theme   = factory.createTheme();
  const layout  = factory.createLayout();
  const wording = factory.createWording();

  const root = document.documentElement;
  const all  = Object.assign({}, theme.vars(), layout.vars());

  for (const key in all) {
    root.style.setProperty(key, all[key]);
  }

  CURRENT_WORDING = wording;
  return { factory: factory, wording: wording };
}
