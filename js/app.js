/* QUIRGROUP · Pedidos (LOCAL, sin Firebase)
   Base: pedidos_pwa_completo_v6 (estable)
   - Catálogo: window.EMBEDDED_PRODUCTS (js/products.js)
   - Pedidos + carrito: localStorage
*/

(() => {
  "use strict";

  // ===== CONFIG =====
  const WHATSAPP_NUMBER = "5493515144679"; // FIXED – NO TOCAR

  // ===== STORAGE KEYS =====
  const LS_PRODUCTS_CACHE = "qg_products_cache_v2";
  const LS_CART = "qg_cart_v3";
  const LS_ORDERS = "qg_orders_v3";
  const LS_LAST_T = "qg_last_taller_v3";

  // ===== HELPERS =====
  const fmtMoney = (n) => {
    const v = Number.isFinite(n) ? n : 0;
    return "$ " + v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  };
  const norm = (s) => (s || "").toString().trim().toLowerCase();
  const inStock = (p) => (Number(p?.price) || 0) > 0;
  const safeParse = (j, fb) => { try { return JSON.parse(j); } catch { return fb; } };
  const escapeHTML = (s) => (s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
  const cryptoId = () => "p_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const normalizePhone = (s) => (s || "").toString().replace(/\D/g, "");

  // ===== STORAGE =====
  const loadProductsCache = () => {
    const arr = safeParse(localStorage.getItem(LS_PRODUCTS_CACHE) || "[]", []);
    return Array.isArray(arr) ? arr : [];
  };
  const saveProductsCache = (arr) => localStorage.setItem(LS_PRODUCTS_CACHE, JSON.stringify(arr || []));
  const loadCart = () => safeParse(localStorage.getItem(LS_CART) || "{}", {});
  const saveCart = (c) => localStorage.setItem(LS_CART, JSON.stringify(c || {}));

  const isCustomCartId = (id) => String(id || "").startsWith("kit_") || String(id || "").startsWith("custom_");

  const sanitizeCartAgainstStock = () => {
    try {
      let changed = false;
      Object.keys(cart).forEach((id) => {
        if (isCustomCartId(id)) return;
        const p = products.find(x => String(x.id) === String(id));
        if (!p || !inStock(p)) { delete cart[id]; changed = true; return; }
        // ensure updated price/name
        cart[id].price = Number(p.price) || 0;
        cart[id].name = p.name || cart[id].name;
        cart[id].code = p.code || cart[id].code;
      });
      if (changed) saveCart(cart);
    } catch {}
  };
  const loadOrders = () => safeParse(localStorage.getItem(LS_ORDERS) || "[]", []);
  const saveOrders = (o) => localStorage.setItem(LS_ORDERS, JSON.stringify(o || []));

  // ===== STATE =====
  let products = [];
  let cart = loadCart();

  // ===== REFS =====
  const q = document.getElementById("q");
  const cat = document.getElementById("cat");
  const grid = document.getElementById("grid");
  const meta = document.getElementById("meta");

  const drawerBack = document.getElementById("drawerBack");
  const drawer = document.getElementById("drawer");
  const cartList = document.getElementById("cartList");
  const cartTotal = document.getElementById("cartTotal");
  const cartBadge = document.getElementById("cartBadge");

  const taller = document.getElementById("taller");
  const obs = document.getElementById("obs");
  const errTaller = document.getElementById("errTaller");

  const viewCatalogo = document.getElementById("viewCatalogo");
  const viewPedidos = document.getElementById("viewPedidos");
  const viewKits = document.getElementById("viewKits");

  const metaOrders = document.getElementById("metaOrders");
  const ordersBox = document.getElementById("orders");

  // optional (mobile search slot exists in v6)
  const mobileSearchSlot = document.getElementById("mobileSearchSlot");

  // ===== VIEW =====
  function setView(which) {
    document.querySelectorAll(".navbtn").forEach(b => b.classList.remove("active"));
    const map = { catalogo: "navCatalogo", pedidos: "navPedidos", kits: "navKits" };
    const btn = document.getElementById(map[which]);
    if (btn) btn.classList.add("active");

    viewCatalogo.style.display = which === "catalogo" ? "block" : "none";
    viewPedidos.style.display = which === "pedidos" ? "block" : "none";
    viewKits.style.display = which === "kits" ? "block" : "none";
    if (which === "kits") initKits();
  }

  // ===== CART =====
  function computeCart() {
    const items = Object.values(cart);
    const count = items.reduce((a, it) => a + (it.qty || 0), 0);
    const total = items.reduce((a, it) => a + (Number(it.price) || 0) * (it.qty || 0), 0);
    return { items, count, total };
  }
  function setQty(id, qty) {
    qty = Math.max(0, Number(qty) || 0);

    // Si no existe en carrito y qty > 0, lo creamos (caso: primera vez, el usuario tipea 10 y luego agrega)
    if (qty > 0 && !cart[id]) {
      const p = products.find(x => String(x.id) === String(id));
      if (!p || !inStock(p)) return;
      cart[id] = { id: p.id, code: p.code || "", name: p.name, price: Number(p.price) || 0, qty };
      saveCart(cart);
      renderAll();
      return;
    }

    if (qty === 0) delete cart[id];
    else cart[id].qty = qty;

    saveCart(cart);
    renderAll();
  }
  function addToCart(p, delta) {
    if (!inStock(p)) return;
    const id = p.id;
    const prev = cart[id]?.qty || 0;
    const next = Math.max(0, prev + delta);
    if (next === 0) delete cart[id];
    else cart[id] = { id, code: p.code || "", name: p.name, price: Number(p.price) || 0, qty: next };
    saveCart(cart);
    renderAll();
  }

  // ===== FILTER/CATS =====
  function buildCategories() {
    const set = new Set();
    products.filter(inStock).forEach(p => { const c = (p.cat || "").trim(); if (c) set.add(c); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }
  function renderCatSelect() {
    const current = cat.value;
    const cats = buildCategories();
    cat.innerHTML = `<option value="">Todos</option>` + cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
    if (cats.includes(current)) cat.value = current;
  }
  function filterProducts() {
    const qq = norm(q.value);
    const cc = (cat.value || "").trim();
    let arr = products.filter(inStock);
    if (cc) arr = arr.filter(p => (p.cat || "").trim() === cc);
    if (qq) {
      const terms = qq.split(/\s+/).filter(Boolean);
      arr = arr.filter(p => {
        const hay = norm(p.search || `${p.name || ""} ${p.code || ""} ${p.cat || ""}`);
        return terms.every(t => hay.includes(t));
      });
    }
    return arr;
  }

  // ===== CATALOG =====
  function resolveImg(p) {
    // prioridad: img explícita
    if (p.img && String(p.img).trim()) return String(p.img).trim();
    // si hay code, buscá imagen por code (recomendado)
    const code = (p.code || "").trim();
    if (code) return `img/products/${code.toLowerCase().replace(/\s+/g, "-")}.jpg`;
    // fallback
    return "img/placeholder.svg";
  }

  function productCard(p) {
    const inCart = cart[p.id]?.qty || 0;
    const imgSrc = resolveImg(p);
    const img = `<img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(p.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='img/placeholder.svg'">`;

    const codeShown = (p.code || p.id);
    return `
      <div class="pCard" data-id="${escapeHTML(p.id)}">
        <div class="pImg">${img}</div>
        <div class="pInfo">
          <p class="pName">${escapeHTML(p.name)}</p>
          <div class="pMeta">
            <span class="chip">Cod: <span class="mono">${escapeHTML(codeShown)}</span></span>
            ${p.cat ? `<span class="chip">${escapeHTML(p.cat)}</span>` : ``}
          </div>
          <div class="pPrice locked">${fmtMoney(Number(p.price) || 0)}</div>
          <div class="pActions">
            <button class="btn primary" data-act="add">Agregar al Carrito</button>
            <div class="qty">
              <button class="qbtn" data-act="m">−</button>
              <input class="qinput" type="number" inputmode="numeric" min="0" step="1" value="${inCart}" aria-label="Cantidad" />
              <button class="qbtn" data-act="p">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCatalog() {
    const arr = filterProducts();
    meta.textContent = `${products.filter(inStock).length} productos · mostrando ${arr.length}`;
    grid.innerHTML = arr.length ? arr.map(productCard).join("") : `<div class="empty">Sin resultados.</div>`;

    grid.querySelectorAll(".pCard").forEach(node => {
      const id = node.getAttribute("data-id");
      const p = products.find(x => String(x.id) === String(id));
      if (!p) return;

      node.addEventListener("click", (e) => {
        const actEl = (e.target && e.target.closest) ? e.target.closest("[data-act]") : null;
        const act = actEl ? actEl.getAttribute("data-act") : null;
        if (!act) return;
        if (act === "add" || act === "p") { addToCart(p, +1); return; }
        if (act === "m") { addToCart(p, -1); return; }
      });

      // Permite escribir cantidad
      const qinput = node.querySelector(".qinput");
      if (qinput) {
        const apply = () => setQty(p.id, qinput.value);
        qinput.addEventListener("change", apply);
        qinput.addEventListener("blur", apply);
        qinput.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); qinput.blur(); }
          if (["e","E","+","-"].includes(ev.key)) ev.preventDefault();
        });
      }
    });
  }

  // ===== CART RENDER =====
  function renderCart() {
    const { items, count, total } = computeCart();
    if (count > 0) { cartBadge.style.display = "flex"; cartBadge.textContent = String(count); }
    else cartBadge.style.display = "none";

    cartTotal.textContent = fmtMoney(total);

    if (!items.length) { cartList.innerHTML = `<div class="empty">Carrito vacío.</div>`; return; }

    const sorted = items.sort((a, b) => a.name.localeCompare(b.name, "es"));
    cartList.innerHTML = sorted.map(it => {
      const sub = (Number(it.price) || 0) * (it.qty || 0);
      return `
        <div class="cRow" data-id="${escapeHTML(it.id)}">
          <div>
            <div class="cNm">${escapeHTML(it.name)}</div>
            <div class="cSm">Cod: <span class="mono">${escapeHTML(it.code || it.id)}</span> · ${fmtMoney(Number(it.price) || 0)} · Sub: <span class="mono">${fmtMoney(sub)}</span></div>
          </div>
          <div class="cCtrl">
            <button class="qbtn" data-act="m">−</button>
            <input class="qinput" type="number" inputmode="numeric" min="0" step="1" value="${it.qty}" aria-label="Cantidad" data-act="set" />
            <button class="qbtn" data-act="p">+</button>
            <button class="cDel" data-act="d">X</button>
          </div>
        </div>
      `;
    }).join("");

    cartList.querySelectorAll(".cRow").forEach(row => {
      const id = row.getAttribute("data-id");
      row.addEventListener("click", (e) => {
        const act = e.target?.getAttribute?.("data-act");
        if (!act) return;

        // input cantidad
        if (act === "set") {
          const v = Number(e.target.value);
          setQty(id, v);
          return;
        }

        const cur = cart[id]?.qty || 0;
        if (act === "p") setQty(id, cur + 1);
        if (act === "m") setQty(id, cur - 1);
        if (act === "d") setQty(id, 0);
      });

      // Permite escribir cantidad (sin depender del click)
      const qinput = row.querySelector(".qinput");
      if (qinput) {
        const apply = () => setQty(id, qinput.value);
        qinput.addEventListener("change", apply);
        qinput.addEventListener("blur", apply);
        qinput.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); qinput.blur(); }
          if (["e","E","+","-"].includes(ev.key)) ev.preventDefault();
        });
      }
    });
  }

  function openCart() {
    const last = safeParse(localStorage.getItem(LS_LAST_T) || "{}", {});
    if (last?.taller && !taller.value.trim()) taller.value = last.taller;
    drawerBack.style.display = "block";
    drawer.classList.add("show");
    errTaller.style.display = "none";
  }
  function closeCart() {
    drawerBack.style.display = "none";
    drawer.classList.remove("show");
    errTaller.style.display = "none";
  }

  // ===== ORDERS =====
  function orderId() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const rnd = Math.floor(Math.random() * 9000) + 1000;
    return `Q-${y}${m}${day}-${rnd}`;
  }
  function buildOrderSummary(o) {
    const lines = [];
    const sep = "------------------------------";
    lines.push("QUIRGROUP · PEDIDO");
    lines.push(sep);
    lines.push(`Taller: ${o.taller}`);
    lines.push(`Pedido: ${o.id}`);
    lines.push(`Fecha: ${new Date(o.createdAt).toLocaleString("es-AR")}`);
    if (o.obs) lines.push(`Obs: ${o.obs}`);
    lines.push(sep);
    lines.push("ITEMS");
    lines.push("");
    (o.items || []).forEach((it, idx) => {
      const unit = Number(it.price) || 0;
      const qty = Number(it.qty) || 0;
      const sub = unit * qty;
      lines.push(`${idx + 1}. ${it.name}`);
      lines.push(`   Cant: ${qty}`);
      lines.push(`   Unit: ${fmtMoney(unit)}`);
      lines.push(`   Sub:  ${fmtMoney(sub)}`);
      lines.push("");
    });
    lines.push(sep);
    lines.push(`TOTAL: ${fmtMoney(Number(o.total) || 0)}`);
    return lines.join("\n");
  }

  function checkoutWhatsapp() {
    const { items, count, total } = computeCart();
    if (count <= 0) return;

    const t = (taller.value || "").trim();
    if (!t) { errTaller.style.display = "block"; taller.focus(); return; }
    errTaller.style.display = "none";

    const oobs = (obs.value || "").trim();
    localStorage.setItem(LS_LAST_T, JSON.stringify({ taller: t }));

    const order = {
      id: orderId(),
      createdAt: new Date().toISOString(),
      taller: t,
      obs: oobs,
      items: items.map(it => ({ id: it.id, code: it.code, name: it.name, price: Number(it.price) || 0, qty: it.qty || 0 })),
      total
    };

    const orders = loadOrders();
    orders.unshift(order);
    saveOrders(orders.slice(0, 300));

    const msg = buildOrderSummary(order);
    const encoded = encodeURIComponent(msg);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
cart = {};
    saveCart(cart);
    closeCart();
    setView("pedidos");
    renderAll();

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copySummary() {
    const { items, count, total } = computeCart();
    if (count <= 0) return;
    const t = (taller.value || "").trim() || "Taller sin nombre";
    const oobs = (obs.value || "").trim();
    const temp = { id: "Borrador", createdAt: new Date().toISOString(), taller: t, obs: oobs, items, total };
    try { await navigator.clipboard.writeText(buildOrderSummary(temp)); } catch {}
  }

  function renderOrders() {
    const orders = loadOrders();
    metaOrders.textContent = `${orders.length} pedidos`;
    if (!orders.length) { ordersBox.innerHTML = `<div class="empty">Sin pedidos todavía.</div>`; return; }

    ordersBox.innerHTML = orders.slice(0, 80).map(o => {
      const dt = new Date(o.createdAt).toLocaleString("es-AR");
      const items = (o.items || []).slice(0, 4).map(it => `${it.name} x${it.qty}`).join(" · ");
      return `
        <div class="oRow" data-id="${escapeHTML(o.id)}">
          <div class="oLeft">
            <div class="oId">${escapeHTML(o.id)} · <span class="mono">${fmtMoney(o.total)}</span></div>
            <div class="oSm">${escapeHTML(o.taller)} · ${escapeHTML(dt)}</div>
            <div class="oSm">${escapeHTML(items)}${(o.items || []).length > 4 ? " · ..." : ""}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="oBtn" data-act="rep">Repetir</button>
            <button class="oBtn primary" data-act="copy">Copiar</button>
          </div>
        </div>
      `;
    }).join("");

    ordersBox.querySelectorAll(".oRow").forEach(row => {
      const id = row.getAttribute("data-id");
      row.addEventListener("click", async (e) => {
        const act = e.target?.getAttribute?.("data-act");
        if (!act) return;
        const all = loadOrders();
        const o = all.find(x => x.id === id);
        if (!o) return;
        if (act === "rep") {
          cart = {};
          (o.items || []).forEach(it => { cart[it.id] = { id: it.id, code: it.code || "", name: it.name, price: Number(it.price) || 0, qty: it.qty || 0 }; });
          saveCart(cart);
          setView("catalogo");
          renderAll();
          openCart();
        }
        if (act === "copy") {
          try { await navigator.clipboard.writeText(buildOrderSummary(o)); } catch {}
        }
      });
    });
  }

  // ===== RENDER ALL =====
  function renderAll() {
    renderCatSelect();
    renderCatalog();
    renderCart();
    renderOrders();
  }

  // ===== MOBILE UX: move search below banner =====
  function initMobileSearch() {
    const header = document.querySelector("header.topbar");
    const searchWrap = document.querySelector(".searchWrap");
    if (!header || !searchWrap || !mobileSearchSlot) return;

    const marker = document.createComment("search-home");
    if (!searchWrap.__marker) {
      searchWrap.__marker = marker;
      searchWrap.parentNode.insertBefore(marker, searchWrap);
    }

    function place() {
      const isMobile = window.matchMedia("(max-width: 600px)").matches;
      if (isMobile) {
        if (!mobileSearchSlot.contains(searchWrap)) mobileSearchSlot.appendChild(searchWrap);
      } else {
        if (marker.parentNode) marker.parentNode.insertBefore(searchWrap, marker.nextSibling);
        else header.insertBefore(searchWrap, header.querySelector(".topRight"));
      }
    }
    window.addEventListener("resize", place);
    place();
  }

  // ===== PWA Install button =====
  function initPwaInstall() {
    const btnInstall = document.getElementById("btnInstall");
    if (!btnInstall) return;

    let deferredPrompt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      btnInstall.style.display = "inline-flex";
    });

    btnInstall.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      btnInstall.style.display = "none";
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
    });
  }

  // ===== INIT =====
  function initProducts() {
    // 1) cache local
    const cache = loadProductsCache();
    if (cache.length) products = cache;

    // 2) si no hay cache, usar embebido
    if (!products.length) {
      const emb = window.EMBEDDED_PRODUCTS;
      if (Array.isArray(emb) && emb.length) products = JSON.parse(JSON.stringify(emb));
    }

    // 3) normalizar (y asegurar search)
    products = (products || []).map(p => ({
      id: p.id || p.code || cryptoId(),
      code: (p.code || "").trim(),
      name: (p.name || "").trim(),
      price: Number(p.price) || 0,
      cat: (p.cat || "").trim(),
      img: (p.img || "").trim(),
      search: p.search || norm(`${p.name || ""} ${p.code || ""} ${p.cat || ""}`)
    }));

    saveProductsCache(products);
  }

  
  // ===== CACHE RESET =====
  async function resetAppCache() {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}

    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}

    // Recarga dura
    location.reload();
  }


// ===== KITS DE INSTALACIÓN =====
const KIT_BASE_PRICE = {
  inyeccion: 550000,
  carburado: 585000,
  quinta_aeb: 670000,
  quinta_axis: 570000,
};

const KIT_NAMES = {
  inyeccion: "Inyección",
  carburado: "Carburado",
  quinta_aeb: "5ta AEB",
  quinta_axis: "5ta AXIS",
};

const KITS_EXTRA_PRICES = {
  valvula_extra_2do_cil: 65000,
  diferencia_cuna_2cil: 40000, // CORRECCIÓN (no 90k)
  emulador_4cil: 31000,        // SOLO inyección
};

const CYLINDERS = [
  { id:"244-30-780",  label:"Ø244 · 30L · 780mm",  price:330000 },
  { id:"244-60-1500", label:"Ø244 · 60L · 1500mm", price:535000 },

  { id:"273-30-690",  label:"Ø273 · 30L · 690mm",  price:330000 },
  { id:"273-40-880",  label:"Ø273 · 40L · 880mm",  price:350000 },
  { id:"273-50-1070", label:"Ø273 · 50L · 1070mm", price:485000 },
  { id:"273-60-1250", label:"Ø273 · 60L · 1250mm", price:535000 },

  { id:"323-58-900",  label:"Ø323 · 58L · 900mm",  price:550000 },

  { id:"340-58-850",  label:"Ø340 · 58L · 850mm",  price:550000 },
  { id:"340-64-930",  label:"Ø340 · 64L · 930mm",  price:598000 },

  { id:"355-65-855",  label:"Ø355 · 65L · 855mm",  price:610000 },
  { id:"355-70-910",  label:"Ø355 · 70L · 910mm",  price:650000 },
  { id:"355-80-1020", label:"Ø355 · 80L · 1020mm", price:755000 },

  { id:"406-90-960",   label:"Ø406 · 90L · 960mm",   price:1000000 },
  { id:"406-120-1170", label:"Ø406 · 120L · 1170mm", price:1228000 },
];

const kitState = {
  kit: null,
  cylindersCount: 1,
  cyl1: CYLINDERS[0]?.id || "",
  cyl2: CYLINDERS[0]?.id || "",
};

const getCyl = (id) => CYLINDERS.find(c => c.id === id) || null;

function fillCylSelect(sel){
  if (!sel) return;
  sel.innerHTML = "";
  for (const c of CYLINDERS){
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.label} (${fmtMoney(c.price)})`;
    sel.appendChild(opt);
  }
}

function setKitsStatus(text, mode){
  const dot = document.getElementById("kitStatusDot");
  const txt = document.getElementById("kitStatusTxt");
  if (txt) txt.textContent = text || "Pendiente";
  if (dot){
    dot.classList.remove("on","warn");
    if (mode === "ok") dot.classList.add("on");
    else dot.classList.add("warn");
  }
}

function isInyeccionSelected(){
  return kitState.kit === "inyeccion";
}

function syncEmuladorVisibility(){
  const emuRow = document.getElementById("emuRow");
  const chkEmu = document.getElementById("kitEmulador4");
  const ok = isInyeccionSelected();

  if (emuRow) emuRow.style.display = ok ? "" : "none";
  if (chkEmu){
    chkEmu.disabled = !ok;
    if (!ok) chkEmu.checked = false;
  }
}

function getEmuladorCost(){
  const chkEmu = document.getElementById("kitEmulador4");
  return (isInyeccionSelected() && chkEmu && chkEmu.checked) ? KITS_EXTRA_PRICES.emulador_4cil : 0;
}

function setActiveKitButton(){
  document.querySelectorAll("#kitPills .kitsPillBtn").forEach(btn=>{
    btn.classList.toggle("on", btn.dataset.kit === kitState.kit);
  });
}

function setToggle(n){
  kitState.cylindersCount = n;
  document.querySelectorAll("#cylToggle button").forEach(b=>{
    b.classList.toggle("on", Number(b.dataset.n) === n);
  });

  const wrap = document.getElementById("cyl2Wrap");
  if (wrap) wrap.style.display = (n === 2) ? "" : "none";

  const auto = document.getElementById("autoRules");
  if (auto){
    if (n === 2){
      auto.innerHTML = `<b>2 cilindros:</b> +1 válvula (${fmtMoney(KITS_EXTRA_PRICES.valvula_extra_2do_cil)}) y diferencia de cuna (${fmtMoney(KITS_EXTRA_PRICES.diferencia_cuna_2cil)}). <span class="warn">AUTO</span>`;
    } else {
      auto.innerHTML = `<b>1 cilindro:</b> sin válvula extra. Cuna normal. <span class="ok">OK</span>`;
    }
  }

  renderKitsResumen();
}

function computeKits(){
  const base = kitState.kit ? (KIT_BASE_PRICE[kitState.kit] || 0) : 0;
  const c1 = getCyl(kitState.cyl1);
  const c2 = getCyl(kitState.cyl2);

  let cylCost = 0;
  if (c1) cylCost += c1.price;
  if (kitState.cylindersCount === 2 && c2) cylCost += c2.price;

  let extra = 0;
  if (kitState.cylindersCount === 2){
    extra += KITS_EXTRA_PRICES.valvula_extra_2do_cil;
    extra += KITS_EXTRA_PRICES.diferencia_cuna_2cil;
  }
  extra += getEmuladorCost();

  const total = base + cylCost + extra;
  return { base, cylCost, extra, total, c1, c2 };
}

function renderKitsResumen(){
  const { base, cylCost, extra, total } = computeKits();

  const sumKit = document.getElementById("sumKit");
  const sumBase = document.getElementById("sumBase");
  const sumCyl = document.getElementById("sumCyl");
  const sumExtra = document.getElementById("sumExtra");
  const sumTotal = document.getElementById("sumTotal");
  const sumBadge = document.getElementById("sumBadge");
  const hint = document.getElementById("kitStatusHint");
  const btnAdd = document.getElementById("btnAddKit");

  if (!kitState.kit){
    if (sumKit) sumKit.textContent = "—";
    if (sumBadge) sumBadge.textContent = "—";
    if (hint) hint.textContent = "Seleccioná un kit para comenzar.";
    setKitsStatus("Pendiente", "warn");
    if (btnAdd) btnAdd.disabled = true;
  } else {
    if (sumKit) sumKit.textContent = KIT_NAMES[kitState.kit] || kitState.kit;
    if (sumBadge) sumBadge.textContent = kitState.cylindersCount === 2 ? "2 cilindros" : "1 cilindro";
    if (hint) hint.textContent = "Listo para agregar al pedido.";
    setKitsStatus("Listo", "ok");
    if (btnAdd) btnAdd.disabled = false;
  }

  if (sumBase) sumBase.textContent = fmtMoney(base);
  if (sumCyl) sumCyl.textContent = fmtMoney(cylCost);
  if (sumExtra) sumExtra.textContent = fmtMoney(extra);
  if (sumTotal) sumTotal.textContent = fmtMoney(total);

  syncEmuladorVisibility();
}

function kitsAddToCart(){
  if (!kitState.kit) return;

  const { base, c1, c2 } = computeKits();
  // IDs custom: no se sanitizan por stock
  const addCustom = (id, name, price, qty=1, code="KIT") => {
    const pid = String(id);
    const p = { id: pid, code, name, price: Number(price) || 0 };
    addToCart(p, qty); // usa el mismo carrito
  };

  // Kit base
  addCustom(`kit_base_${kitState.kit}`, `KIT ${KIT_NAMES[kitState.kit] || kitState.kit}`, base, 1, "KIT");

  // Cilindros
  if (c1) addCustom(`kit_cyl_${c1.id}`, `Cilindro ${c1.label}`, c1.price, 1, "CIL");
  if (kitState.cylindersCount === 2 && c2) addCustom(`kit_cyl_${c2.id}`, `Cilindro ${c2.label}`, c2.price, 1, "CIL");

  // Extras automáticos 2 cil
  if (kitState.cylindersCount === 2){
    addCustom(`kit_extra_valvula`, `Extra: Válvula (2º cilindro)`, KITS_EXTRA_PRICES.valvula_extra_2do_cil, 1, "EXT");
    addCustom(`kit_extra_cuna`, `Extra: Diferencia de cuna (2 cil)`, KITS_EXTRA_PRICES.diferencia_cuna_2cil, 1, "EXT");
  }

  // Emulador (solo inyección)
  if (getEmuladorCost() > 0){
    addCustom(`kit_extra_emulador`, `Adicional: Emulador 4 cilindros`, KITS_EXTRA_PRICES.emulador_4cil, 1, "EXT");
  }

  openCart();
}

let kitsBound = false;
function initKits(){
  if (kitsBound) return;
  const pills = document.getElementById("kitPills");
  const sel1 = document.getElementById("cyl1");
  const sel2 = document.getElementById("cyl2");
  const btnAdd = document.getElementById("btnAddKit");
  const toggle = document.getElementById("cylToggle");
  const chkEmu = document.getElementById("kitEmulador4");

  fillCylSelect(sel1);
  fillCylSelect(sel2);
  if (sel1) sel1.value = kitState.cyl1;
  if (sel2) sel2.value = kitState.cyl2;

  pills?.addEventListener("click", (e)=>{
    const btn = e.target?.closest?.("button[data-kit]");
    if (!btn) return;
    kitState.kit = btn.dataset.kit;
    setActiveKitButton();
    renderKitsResumen();
  });

  toggle?.addEventListener("click", (e)=>{
    const b = e.target?.closest?.("button[data-n]");
    if (!b) return;
    setToggle(Number(b.dataset.n) || 1);
  });

  sel1?.addEventListener("change", ()=>{ kitState.cyl1 = sel1.value; renderKitsResumen(); });
  sel2?.addEventListener("change", ()=>{ kitState.cyl2 = sel2.value; renderKitsResumen(); });
  chkEmu?.addEventListener("change", ()=>{ renderKitsResumen(); });

  btnAdd?.addEventListener("click", kitsAddToCart);

  // defaults
  setToggle(1);
  setActiveKitButton();
  renderKitsResumen();

  kitsBound = true;
}

  function bindEvents() {
    document.getElementById("btnCart")?.addEventListener("click", openCart);
    document.getElementById("btnCloseCart")?.addEventListener("click", closeCart);
    drawerBack?.addEventListener("click", closeCart);
    document.getElementById("btnCheckout")?.addEventListener("click", checkoutWhatsapp);
    document.getElementById("btnCopy")?.addEventListener("click", copySummary);
    document.getElementById("btnResetCache")?.addEventListener("click", resetAppCache);

    document.getElementById("btnClearOrders")?.addEventListener("click", () => {
      if (!confirm("Borrar historial de pedidos?")) return;
      localStorage.removeItem(LS_ORDERS);
      renderOrders();
    });

    document.getElementById("btnRepeatLast")?.addEventListener("click", () => {
      const orders = loadOrders();
      if (!orders.length) return;
      const o = orders[0];
      cart = {};
      (o.items || []).forEach(it => { cart[it.id] = { id: it.id, code: it.code || "", name: it.name, price: Number(it.price) || 0, qty: it.qty || 0 }; });
      saveCart(cart);
      setView("catalogo");
      renderAll();
      openCart();
    });

    document.querySelectorAll(".navbtn").forEach(b => b.addEventListener("click", () => setView(b.getAttribute("data-view"))));
    q?.addEventListener("input", renderCatalog);
    cat?.addEventListener("change", renderCatalog);

    // mobile menu drawer (exists)
    const btnMenu = document.getElementById("btnMenu");
    const menuBack = document.getElementById("menuBack");
    const menuDrawer = document.getElementById("menuDrawer");
    const btnCloseMenu = document.getElementById("btnCloseMenu");

    const openMenu = () => { if (!menuBack || !menuDrawer) return; menuBack.style.display = "block"; menuDrawer.classList.add("show"); };
    const closeMenu = () => { if (!menuBack || !menuDrawer) return; menuBack.style.display = "none"; menuDrawer.classList.remove("show"); };

    btnMenu?.addEventListener("click", openMenu);
    btnCloseMenu?.addEventListener("click", closeMenu);
    menuBack?.addEventListener("click", closeMenu);
    document.getElementById("mCatalogo")?.addEventListener("click", () => { setView("catalogo"); closeMenu(); });
    document.getElementById("mPedidos")?.addEventListener("click", () => { setView("pedidos"); closeMenu(); renderOrders(); });
    document.getElementById("mKits")?.addEventListener("click", () => { setView("kits"); closeMenu(); });

    // ensure FAB listener exists (if present)
    document.getElementById("fabCart")?.addEventListener("click", openCart);
  }

  function init() {
    initProducts();
    sanitizeCartAgainstStock();
    setView("catalogo");
    renderAll();
    initMobileSearch();
    initPwaInstall();
  }

  // run after DOM is ready (scripts are deferred, but keep safe)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bindEvents(); init(); });
  else { bindEvents(); init(); }
})();
