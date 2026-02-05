/* =========================================================
   QUIRGROUP Pedidos - Carrito con cantidades correctas
   ========================================================= */

(() => {
  "use strict";

  const LS_KEY = "quirgroup_pedidos_carrito_v1";
  let carrito = JSON.parse(localStorage.getItem(LS_KEY) || "{}");

  function guardar() {
    localStorage.setItem(LS_KEY, JSON.stringify(carrito));
  }

  function money(n) {
    return Number(n || 0).toLocaleString("es-AR");
  }

  function agregarAlCarrito(id) {
    const input = document.querySelector(`.qty-input[data-id="${id}"]`);
    if (!input) return;

    const cantidad = parseInt(input.value, 10);
    if (!cantidad || cantidad <= 0) return;

    const btn = document.querySelector(`[data-action="add"][data-id="${id}"]`);
    const nombre = btn?.dataset.nombre || id;
    const precio = Number(btn?.dataset.precio || 0);

    if (carrito[id]) {
      carrito[id].cantidad += cantidad;
    } else {
      carrito[id] = { nombre, precio, cantidad };
    }

    input.value = 0;
    guardar();
    renderCarrito();
  }

  function renderCarrito() {
    const cont = document.getElementById("cartItems");
    const totalEl = document.getElementById("cartTotal");
    if (!cont || !totalEl) return;

    cont.innerHTML = "";
    let total = 0;

    Object.keys(carrito).forEach(id => {
      const it = carrito[id];
      const sub = it.precio * it.cantidad;
      total += sub;

      cont.innerHTML += `
        <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px">
          <b>${it.nombre}</b>
          <span>${it.cantidad} × $${money(it.precio)}</span>
          <button onclick="window.__del('${id}')">✕</button>
        </div>
      `;
    });

    totalEl.textContent = "$ " + money(total);
  }

  window.__del = id => {
    delete carrito[id];
    guardar();
    renderCarrito();
  };

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const id = el.dataset.id;

    if (el.dataset.action === "add") {
      agregarAlCarrito(id);
    }

    if (el.dataset.action === "qty-plus") {
      const i = document.querySelector(`.qty-input[data-id="${id}"]`);
      i.value = parseInt(i.value || 0) + 1;
    }

    if (el.dataset.action === "qty-minus") {
      const i = document.querySelector(`.qty-input[data-id="${id}"]`);
      i.value = Math.max(0, parseInt(i.value || 0) - 1);
    }
  });

  renderCarrito();
})();
