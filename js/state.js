/* ==========================================================
   state.js  -  SmartBank account status layer
   Pattern used here : STATE  (Advanced)

   Ek account teen halat me ho sakta hai - Active, Frozen ya
   Closed. Har halat me account alag behave karta hai.

   Bina State pattern ke har jagah "if (status == 'frozen')"
   likhna padta. Yahan har status ki apni class hai jo khud
   batati hai kya allowed hai aur kya nahi.
   ========================================================== */


/* ---------- State interface ---------- */
class AccountState {

  getName()  { return "Unknown"; }
  getColor() { return "grey"; }
  getNote()  { return ""; }

  canDebit()  { return { ok: true, reason: "" }; }
  canCredit() { return { ok: true, reason: "" }; }
  canClose()  { return { ok: true, reason: "" }; }
}


/* ---------- Concrete States ---------- */

class ActiveState extends AccountState {
  getName()  { return "Active"; }
  getColor() { return "green"; }
  getNote()  { return "Account normal chal raha hai, sab kuch allowed hai."; }
}

class FrozenState extends AccountState {
  getName()  { return "Frozen"; }
  getColor() { return "red"; }
  getNote()  { return "Bank ne account freeze kiya hai. Paisa aa sakta hai, ja nahi sakta."; }

  canDebit() {
    return { ok: false, reason: "Account frozen hai, isse paisa nahi nikal sakte" };
  }
  // credit allowed hai - purana wala rule
  canClose() {
    return { ok: false, reason: "Frozen account band nahi kiya ja sakta" };
  }
}

class ClosedState extends AccountState {
  getName()  { return "Closed"; }
  getColor() { return "grey"; }
  getNote()  { return "Ye account band ho chuka hai."; }

  canDebit()  { return { ok: false, reason: "Account band ho chuka hai" }; }
  canCredit() { return { ok: false, reason: "Band account me paisa jama nahi ho sakta" }; }
  canClose()  { return { ok: false, reason: "Account pehle se band hai" }; }
}


/* account row ke status se sahi state object banao */
function getAccountState(statusName) {
  if (statusName === "Frozen") return new FrozenState();
  if (statusName === "Closed") return new ClosedState();
  return new ActiveState();
}

const ALL_STATES = ["Active", "Frozen", "Closed"];
