(function () {
    const store = window.SeidoStore;

    if (!store) {
        return;
    }

    const menuGrid = document.getElementById("menuGrid");
    const filterRow = document.getElementById("filterRow");
    const cartCount = document.getElementById("cartCount");
    const cartTotal = document.getElementById("cartTotal");
    const toCheckinBtn = document.getElementById("toCheckinBtn");
    const catalogStatus = document.getElementById("catalogStatus");
    const catalogDock = document.querySelector(".catalog-dock");

    let activeFilter = "all";
    let lastQty = 0;
    let transientStatusTimer = 0;
    let hasQueryError = false;

    function safeText(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function buildSrcSet(url) {
        let parsed = null;

        try {
            parsed = new URL(url);
        } catch (_error) {
            return "";
        }

        if (!String(parsed.hostname || "").includes("pexels.com")) {
            return "";
        }

        const buildVariant = (width, height, quality) => {
            const variant = new URL(parsed.toString());
            variant.searchParams.set("w", String(width));
            variant.searchParams.set("h", String(height));
            variant.searchParams.set("q", String(quality));
            variant.searchParams.set("fm", "webp");
            return `${variant.toString()} ${width}w`;
        };

        return `${buildVariant(480, 360, 68)}, ${buildVariant(720, 540, 70)}`;
    }

    function getQty(dishId) {
        const cart = store.readCart();
        return Number(cart[dishId] || 0);
    }

    function createCardMarkup(dish, index) {
        const qty = getQty(dish.id);
        const srcset = buildSrcSet(dish.image);
        const loading = index < 2 ? "eager" : "lazy";
        const fetchpriority = index < 2 ? "high" : "low";

        return `
            <article class="product-card" data-id="${safeText(dish.id)}">
                <figure>
                    <img
                        src="${safeText(dish.image)}"
                        ${srcset ? `srcset="${safeText(srcset)}"` : ""}
                        sizes="(max-width: 760px) 100vw, (max-width: 1040px) 50vw, 33vw"
                        alt="${safeText(dish.alt)}"
                        loading="${loading}"
                        decoding="async"
                        fetchpriority="${fetchpriority}"
                        width="720"
                        height="540">
                </figure>
                <div class="product-body">
                    <h3>${safeText(dish.name)}</h3>
                    <p>${safeText(dish.description)}</p>
                    <div class="product-meta">
                        <strong>${store.formatCop(dish.price)}</strong>
                        <div class="qty-control">
                            <button class="qty-btn" type="button" data-action="minus" data-id="${safeText(dish.id)}" aria-label="Quitar una unidad de ${safeText(dish.name)}">-</button>
                            <span class="qty-value" data-id="${safeText(dish.id)}">${qty}</span>
                            <button class="qty-btn" type="button" data-action="plus" data-id="${safeText(dish.id)}" aria-label="Agregar una unidad de ${safeText(dish.name)}">+</button>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    function categoryLabel(filter) {
        switch (String(filter || "").toLowerCase()) {
            case "ramen":
                return "ramen";
            case "roll":
                return "rolls";
            case "snack":
                return "snacks";
            default:
                return "todo el menu";
        }
    }

    function setStatus(message, type, options = {}) {
        if (hasQueryError && !options.force) {
            return;
        }

        catalogStatus.textContent = message || "";
        catalogStatus.className = "status";

        if (type === "error") {
            catalogStatus.classList.add("error");
        } else if (type === "ok") {
            catalogStatus.classList.add("ok");
        }

        if (options.highlight) {
            catalogStatus.classList.add("is-highlight");
        }
    }

    function setTransientStatus(message, type) {
        window.clearTimeout(transientStatusTimer);
        setStatus(message, type, { highlight: true, force: true });

        transientStatusTimer = window.setTimeout(() => {
            if (hasQueryError) {
                setStatus("Selecciona al menos un producto para continuar al check in.", "error", { force: true });
                return;
            }

            setStatus(`Mostrando ${menuGrid.children.length} productos en ${categoryLabel(activeFilter)}.`, "", { force: true });
        }, 1700);
    }

    function animateCatalogEntry() {
        const cards = Array.from(menuGrid.querySelectorAll(".product-card"));
        cards.forEach((card, index) => {
            card.style.setProperty("--card-delay", `${Math.min(index, 8) * 42}ms`);
            window.requestAnimationFrame(() => {
                card.classList.add("is-visible");
            });
        });
    }

    function animateQtyValue(dishId) {
        menuGrid.querySelectorAll(`.qty-value[data-id="${dishId}"]`).forEach((node) => {
            node.classList.remove("is-updated");
            // Restart keyframe without forcing layout on full document.
            void node.offsetWidth;
            node.classList.add("is-updated");
        });
    }

    function pulseDockIfNeeded(qty) {
        if (!catalogDock) {
            return;
        }

        if (qty <= 0) {
            catalogDock.classList.remove("is-ready");
            return;
        }

        if (qty !== lastQty) {
            catalogDock.classList.remove("is-ready");
            void catalogDock.offsetWidth;
        }

        catalogDock.classList.add("is-ready");
    }

    function renderCatalog() {
        const dishes = activeFilter === "all"
            ? store.dishes
            : store.dishes.filter((dish) => dish.category === activeFilter);

        menuGrid.innerHTML = dishes.map((dish, index) => createCardMarkup(dish, index)).join("");
        animateCatalogEntry();

        if (!hasQueryError) {
            setStatus(`Mostrando ${dishes.length} productos en ${categoryLabel(activeFilter)}.`, "", { force: true });
        }
    }

    function renderDock() {
        const qty = store.getTotalQty();
        const subtotal = store.getSubtotal();

        cartCount.textContent = String(qty);
        cartTotal.textContent = store.formatCop(subtotal);
        toCheckinBtn.disabled = qty === 0;
        toCheckinBtn.textContent = qty > 0 ? `Continuar a check in (${qty})` : "Continuar a check in";
        pulseDockIfNeeded(qty);
        lastQty = qty;
    }

    function handleQtyAction(event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const button = target.closest("[data-action]");
        if (!(button instanceof HTMLElement)) {
            return;
        }

        const action = button.getAttribute("data-action");
        const dishId = button.getAttribute("data-id");

        if (!action || !dishId) {
            return;
        }

        const before = getQty(dishId);

        if (action === "plus") {
            store.adjustQuantity(dishId, 1);
        } else if (action === "minus") {
            store.adjustQuantity(dishId, -1);
        }

        const qty = getQty(dishId);
        menuGrid.querySelectorAll(`.qty-value[data-id="${dishId}"]`).forEach((node) => {
            node.textContent = String(qty);
        });
        animateQtyValue(dishId);
        renderDock();

        if (hasQueryError && qty > 0) {
            hasQueryError = false;
        }

        const dish = store.getDishById(dishId);
        const dishName = dish ? dish.name : "producto";

        if (qty > before) {
            setTransientStatus(`Agregaste ${dishName}. Total en carrito: ${store.getTotalQty()}.`, "ok");
        } else if (qty < before) {
            setTransientStatus(`Actualizaste ${dishName}. Total en carrito: ${store.getTotalQty()}.`, "");
        }
    }

    function handleFilterAction(event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const chip = target.closest("[data-filter]");
        if (!(chip instanceof HTMLElement)) {
            return;
        }

        const filter = chip.getAttribute("data-filter");
        if (!filter) {
            return;
        }

        activeFilter = filter;
        document.querySelectorAll(".chip").forEach((chipNode) => {
            chipNode.classList.remove("is-active");
            chipNode.setAttribute("aria-pressed", "false");
        });
        chip.classList.add("is-active");
        chip.setAttribute("aria-pressed", "true");
        renderCatalog();
    }

    function setupStatusFromQuery() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("reason") === "empty") {
            hasQueryError = true;
            setStatus("Selecciona al menos un producto para continuar al check in.", "error", { force: true });
            return;
        }

        hasQueryError = false;
    }

    function setupEvents() {
        menuGrid.addEventListener("click", handleQtyAction);
        filterRow.addEventListener("click", handleFilterAction);
        filterRow.addEventListener("keydown", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.classList.contains("chip")) {
                return;
            }

            const chips = Array.from(filterRow.querySelectorAll(".chip"));
            if (chips.length === 0) {
                return;
            }

            const currentIndex = Math.max(0, chips.indexOf(target));
            const key = event.key;

            if (key === " " || key === "Enter") {
                event.preventDefault();
                target.click();
                return;
            }

            if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(key)) {
                return;
            }

            event.preventDefault();
            let nextIndex = currentIndex;

            if (key === "ArrowRight" || key === "ArrowDown") {
                nextIndex = (currentIndex + 1) % chips.length;
            } else if (key === "ArrowLeft" || key === "ArrowUp") {
                nextIndex = (currentIndex - 1 + chips.length) % chips.length;
            } else if (key === "Home") {
                nextIndex = 0;
            } else if (key === "End") {
                nextIndex = chips.length - 1;
            }

            const nextChip = chips[nextIndex];
            if (!(nextChip instanceof HTMLElement)) {
                return;
            }

            nextChip.focus();
            nextChip.click();
        });

        toCheckinBtn.addEventListener("click", () => {
            if (store.getTotalQty() === 0) {
                hasQueryError = false;
                setStatus("Debes agregar productos antes de continuar.", "error", { highlight: true, force: true });
                return;
            }

            window.location.assign("checkin.html");
        });
    }

    function init() {
        setupStatusFromQuery();
        renderCatalog();
        renderDock();
        setupEvents();
    }

    init();
})();
