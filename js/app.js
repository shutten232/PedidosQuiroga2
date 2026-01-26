/* QUIRGROUP · Pedidos (LOCAL, sin Firebase)
   Base: pedidos_pwa_completo_v6 (estable)
   - Catálogo: window.EMBEDDED_PRODUCTS (js/products.js)
   - Pedidos + carrito: localStorage
*/

(() => {
  "use strict";

  // ===== CONFIG =====
  const WHATSAPP_DESTINO = ""; // opcional: 549351XXXXXXXX

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
    if (qty === 0) delete cart[id];
    else cart[id].qty = qty;
    saveCart(cart);
    renderAll();
  }
  function addToCart(p, delta) {
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
    products.forEach(p => { const c = (p.cat || "").trim(); if (c) set.add(c); });
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
    let arr = products;
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
              <div class="qnum">${inCart}</div>
              <button class="qbtn" data-act="p">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCatalog() {
    const arr = filterProducts();
    meta.textContent = `${products.length} productos · mostrando ${arr.length}`;
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
            <div class="qnum">${it.qty}</div>
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
        const cur = cart[id]?.qty || 0;
        if (act === "p") setQty(id, cur + 1);
        if (act === "m") setQty(id, cur - 1);
        if (act === "d") setQty(id, 0);
      });
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
    const phone = normalizePhone(WHATSAPP_DESTINO);
    const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;

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

  function bindEvents() {
    document.getElementById("btnCart")?.addEventListener("click", openCart);
    document.getElementById("btnCloseCart")?.addEventListener("click", closeCart);
    drawerBack?.addEventListener("click", closeCart);
    document.getElementById("btnCheckout")?.addEventListener("click", checkoutWhatsapp);
    document.getElementById("btnCopy")?.addEventListener("click", copySummary);

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
    setView("catalogo");
    renderAll();
    initMobileSearch();
    initPwaInstall();
  }

  // run after DOM is ready (scripts are deferred, but keep safe)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bindEvents(); init(); });
  else { bindEvents(); init(); }
})();
