/* ==========================================================
   uml.js  -  chhota sa UML class diagram renderer (SVG)

   Koi library nahi - diagram ek simple object se banta hai:

     {
       cw: 200,                                   // ek column ki chaudai
       classes: [
         { id: "A", name: "BankConfig", stereo: "singleton",
           r: 0, c: 1,                            // row, column
           fields: ["- instance"], methods: ["+ getInstance()"] }
       ],
       links: [ { from: "B", to: "A", type: "extends" } ]
     }

   Link types:
     extends     -> seedhi line, khaali triangle  (inheritance)
     implements  -> dashed line, khaali triangle
     assoc       -> seedhi line, khula arrow      (has a reference)
     uses        -> dashed line, khula arrow      (dependency)
     creates     -> dashed line, khula arrow, label «create»
     has         -> seedhi line, khaali diamond   (aggregation)
     self        -> apne aap par loop (jaise CoR ka "next")
   ========================================================== */

const UML = (function () {

  const PAD = 8, LINE = 15, NAME_H = 20, STEREO_H = 13, GAP_Y = 46, MARGIN = 14;
  const FONT_NAME   = "bold 13px Arial, Helvetica, sans-serif";
  const FONT_MEMBER = "11px Consolas, 'Courier New', monospace";
  const FONT_STEREO = "italic 10.5px Arial, Helvetica, sans-serif";

  let canvasCtx = null;
  function measure(text, font) {
    if (typeof document !== "undefined" && document.createElement) {
      if (!canvasCtx) canvasCtx = document.createElement("canvas").getContext("2d");
      if (canvasCtx) { canvasCtx.font = font; return canvasCtx.measureText(text).width; }
    }
    return text.length * (font.indexOf("13px") !== -1 ? 7.4 : 6.6);
  }

  function x(s) { return esc(s); }

  function boxSize(k) {
    const stereo = k.stereo ? "«" + k.stereo + "»" : "";
    let w = Math.max(measure(k.name, FONT_NAME), stereo ? measure(stereo, FONT_STEREO) : 0);
    for (const m of (k.fields || []).concat(k.methods || [])) w = Math.max(w, measure(m, FONT_MEMBER));
    // canvas aur SVG ki font rendering me thoda farak hota hai - thoda extra jagah
    w = Math.max(k.minW || 110, Math.ceil(w * 1.07 + PAD * 2 + 4));

    let h = NAME_H + (stereo ? STEREO_H : 0) + 6;
    if (k.fields  && k.fields.length)  h += k.fields.length * LINE + 6;
    if (k.methods && k.methods.length) h += k.methods.length * LINE + 6;
    if (!k.fields && !k.methods) h += 4;
    return { w: w, h: h };
  }

  function layout(spec) {
    const cw = spec.cw || 190;
    const boxes = {};
    const rowH = [];

    const loops = (spec.links || []).filter(l => l.type === "self").map(l => l.from);

    for (const k of spec.classes) {
      const s = boxSize(k);
      boxes[k.id] = Object.assign({}, k, s, { selfLoop: loops.indexOf(k.id) !== -1 });
      rowH[k.r] = Math.max(rowH[k.r] || 0, s.h);
    }

    const rowTop = [];
    let y = MARGIN + 10;
    for (let r = 0; r < rowH.length; r++) {
      rowTop[r] = y;
      y += (rowH[r] || 0) + GAP_Y;
    }

    let minX = Infinity, maxX = -Infinity;
    for (const id in boxes) {
      const b = boxes[id];
      b.cx = (b.c + 0.5) * cw;
      b.x = b.cx - b.w / 2;
      b.y = rowTop[b.r];
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.w + (b.selfLoop ? 34 : 0));
    }
    // sab ko left margin par shift karo
    const shift = MARGIN - minX;
    for (const id in boxes) { boxes[id].x += shift; boxes[id].cx += shift; }

    return { boxes: boxes, rowTop: rowTop, rowH: rowH,
             width: Math.ceil(maxX - minX + MARGIN * 2), height: Math.ceil(y - GAP_Y + MARGIN + 10) };
  }

  function boxSvg(b) {
    const cls = "uml-box" + (b.kind ? " uml-" + b.kind : "");
    let s = '<g class="' + cls + '">';
    s += '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="3" class="uml-frame"/>';

    let y = b.y;
    const headH = NAME_H + (b.stereo ? STEREO_H : 0) + 6;
    s += '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + headH + '" rx="3" class="uml-head"/>';
    if (b.stereo) {
      y += STEREO_H + 2;
      s += '<text x="' + b.cx + '" y="' + y + '" class="uml-stereo" text-anchor="middle">«' + x(b.stereo) + '»</text>';
    }
    y += NAME_H - 3;
    s += '<text x="' + b.cx + '" y="' + y + '" class="uml-name' + (b.stereo === "abstract" || b.stereo === "interface" ? " uml-italic" : "") +
         '" text-anchor="middle">' + x(b.name) + "</text>";
    y = b.y + headH;

    const section = function (items) {
      if (!items || !items.length) return;
      s += '<line x1="' + b.x + '" y1="' + y + '" x2="' + (b.x + b.w) + '" y2="' + y + '" class="uml-sep"/>';
      y += 3;
      for (const m of items) {
        y += LINE;
        s += '<text x="' + (b.x + PAD) + '" y="' + (y - 3) + '" class="uml-member">' + x(m) + "</text>";
      }
      y += 3;
    };
    section(b.fields);
    section(b.methods);
    return s + "</g>";
  }

  function linkSvg(link, L) {
    const A = L.boxes[link.from], B = L.boxes[link.to];
    if (!A || !B) return "";

    const dashed = ["implements", "uses", "creates"].indexOf(link.type) !== -1;
    const endMarker = { extends: "tri", implements: "tri", assoc: "arrow", uses: "arrow",
                        creates: "arrow", has: "", self: "arrow" }[link.type];
    const startMarker = link.type === "has" ? "diamond" : "";
    let pts;

    if (link.type === "self") {
      const y1 = A.y + 14, y2 = A.y + Math.min(A.h - 8, 40);
      const xr = A.x + A.w;
      pts = [[xr, y1], [xr + 24, y1], [xr + 24, y2], [xr, y2]];
    } else if (B.r < A.r) {                         // upar wala box
      const ymid = L.rowTop[A.r] - GAP_Y / 2;
      pts = Math.abs(A.cx - B.cx) < 1 ? [[A.cx, A.y], [B.cx, B.y + B.h]]
          : [[A.cx, A.y], [A.cx, ymid], [B.cx, ymid], [B.cx, B.y + B.h]];
    } else if (B.r > A.r) {                         // neeche wala box
      const ymid = L.rowTop[B.r] - GAP_Y / 2;
      pts = Math.abs(A.cx - B.cx) < 1 ? [[A.cx, A.y + A.h], [B.cx, B.y]]
          : [[A.cx, A.y + A.h], [A.cx, ymid], [B.cx, ymid], [B.cx, B.y]];
    } else {                                        // same row
      const y = A.y + Math.min(A.h, B.h, 70) / 2;
      pts = A.cx < B.cx ? [[A.x + A.w, y], [B.x, y]] : [[A.x, y], [B.x + B.w, y]];
    }

    const d = "M" + pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L");
    let s = '<path d="' + d + '" class="uml-link' + (dashed ? " uml-dashed" : "") + '"' +
            (endMarker ? ' marker-end="url(#uml-' + endMarker + ')"' : "") +
            (startMarker ? ' marker-start="url(#uml-' + startMarker + ')"' : "") + "/>";

    const label = link.label || (link.type === "creates" ? "«create»" : "");
    if (label) {
      // sabse lambe hisse ke beech me label
      let best = 0, bi = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
        if (len > best) { best = len; bi = i; }
      }
      const mx = (pts[bi][0] + pts[bi + 1][0]) / 2, my = (pts[bi][1] + pts[bi + 1][1]) / 2;
      const vertical = Math.abs(pts[bi][0] - pts[bi + 1][0]) < 1;
      s += '<text x="' + (mx + (vertical ? 6 : 0)) + '" y="' + (my - (vertical ? 0 : 5)) + '" class="uml-label"' +
           (vertical ? "" : ' text-anchor="middle"') + ">" + x(label) + "</text>";
    }
    return s;
  }

  function svg(spec) {
    const L = layout(spec);
    let s = '<svg class="uml" viewBox="0 0 ' + L.width + " " + L.height + '" width="' + L.width +
            '" style="max-width:100%;height:auto" role="img" aria-label="' + x(spec.title || "UML class diagram") + '">';
    s += "<defs>" +
      '<marker id="uml-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto">' +
        '<path d="M1,1 L11,6 L1,11 Z" class="uml-hollow"/></marker>' +
      '<marker id="uml-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto">' +
        '<path d="M1,1 L11,6 L1,11" class="uml-open"/></marker>' +
      '<marker id="uml-diamond" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="14" markerHeight="10" orient="auto-start-reverse">' +
        '<path d="M1,5 L8,1 L15,5 L8,9 Z" class="uml-hollow"/></marker>' +
      "</defs>";
    for (const link of spec.links || []) s += linkSvg(link, L);
    for (const id in L.boxes) s += boxSvg(L.boxes[id]);
    return s + "</svg>";
  }

  function draw(container, spec) {
    container.innerHTML = svg(spec) +
      (spec.caption ? '<p class="uml-caption">' + x(spec.caption) + "</p>" : "");
  }

  return { svg: svg, draw: draw, layout: layout };
})();
