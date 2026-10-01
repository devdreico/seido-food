(function () {
    const store = window.SeidoStore;

    if (!store) {
        return;
    }

    const SEIDO_CONFIG = {
        backendBaseUrl: "",
        ...(window.SEIDO_CONFIG || {})
    };

    const API_BASE = String(SEIDO_CONFIG.backendBaseUrl || "").replace(/\/$/, "");

    function setText(id, value) {
        const node = document.getElementById(id);
        if (!node) {
            return;
        }

        node.textContent = value;
    }

    function textOrFallback(value, fallback = "-") {
        const clean = String(value || "").trim();
        return clean || fallback;
    }

    function animateCurrency(id, targetValue) {
        const node = document.getElementById(id);
        if (!node) {
            return;
        }

        const target = Number(targetValue) || 0;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (reduceMotion) {
            node.textContent = store.formatCop(target);
            return;
        }

        const duration = 720;
        const startAt = performance.now();

        const step = (now) => {
            const elapsed = now - startAt;
            const progress = Math.min(1, elapsed / duration);
            const eased = 1 - ((1 - progress) ** 3);
            node.textContent = store.formatCop(Math.round(target * eased));

            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };

        window.requestAnimationFrame(step);
    }

    function renderItems(items) {
        const list = document.getElementById("thanksItems");
        if (!list) {
            return;
        }

        if (!Array.isArray(items) || items.length === 0) {
            list.innerHTML = "<li><span>Sin productos</span><strong>-</strong></li>";
            return;
        }

        list.innerHTML = items
            .map((item) => {
                const name = textOrFallback(item.name, "Producto");
                const qty = Number(item.qty) || 0;
                const total = store.formatCop(item.totalPrice || 0);
                return `<li><span>${name} x${qty}</span><strong>${total}</strong></li>`;
            })
            .join("");
    }

    function renderFallback() {
        setText("thanksLead", "No encontramos resumen en esta sesion. Si ya pagaste, tu orden pudo registrarse.");
        setText("thanksNeighborhood", "Sin datos");
        setText("thanksInvoice", "Sin datos");
        setText("thanksInvoiceMessage", "Sin detalle de factura");
        renderItems([]);
    }

    function renderSummary(summary) {
        setText("thanksReference", textOrFallback(summary.reference));
        setText("thanksName", textOrFallback(summary.customerName));
        setText("thanksPhone", textOrFallback(summary.customerPhone));
        setText("thanksNeighborhood", textOrFallback(summary.customerNeighborhood));
        setText("thanksAddress", textOrFallback(summary.customerAddress));
        animateCurrency("thanksSubtotal", summary.subtotalInCents);
        animateCurrency("thanksShipping", summary.shippingInCents);
        animateCurrency("thanksTotal", summary.totalInCents);
        setText("thanksInvoice", summary.invoiceSent ? "Enviada" : "No enviada");
        setText("thanksInvoiceMessage", textOrFallback(summary.invoiceMessage, "Sin detalle"));

        renderItems(summary.items);
    }

    function apiUrl(path) {
        return `${API_BASE}${path}`;
    }

    function normalizeSummary(summary) {
        if (!summary || typeof summary !== "object") {
            return null;
        }

        return {
            reference: textOrFallback(summary.reference),
            status: textOrFallback(summary.status),
            createdAt: textOrFallback(summary.createdAt),
            customerName: textOrFallback(summary.customerName),
            customerPhone: textOrFallback(summary.customerPhone),
            customerNeighborhood: textOrFallback(summary.customerNeighborhood || summary.customerReference),
            customerAddress: textOrFallback(summary.customerAddress),
            zone: textOrFallback(summary.zone),
            subtotalInCents: Number(summary.subtotalInCents) || 0,
            shippingInCents: Number(summary.shippingInCents) || 0,
            totalInCents: Number(summary.totalInCents) || 0,
            items: Array.isArray(summary.items)
                ? summary.items.map((item) => ({
                    name: textOrFallback(item.name || item.id),
                    qty: Number(item.qty) || 0,
                    totalPrice: Number(item.totalPrice) || 0
                }))
                : [],
            location: summary.location || null,
            invoiceSent: Boolean(summary.invoiceSent),
            invoiceMessage: textOrFallback(summary.invoiceMessage, "Sin detalle")
        };
    }

    async function fetchOrderByReference(reference) {
        const cleanReference = String(reference || "").trim();
        if (!cleanReference) {
            return null;
        }

        const response = await fetch(apiUrl(`/api/orders/${encodeURIComponent(cleanReference)}`));
        if (!response.ok) {
            return null;
        }

        const order = await response.json().catch(() => null);
        if (!order || typeof order !== "object") {
            return null;
        }

        return normalizeSummary(order);
    }

    async function init() {
        let summary = null;

        try {
            summary = JSON.parse(sessionStorage.getItem(store.ORDER_SUMMARY_KEY) || "null");
        } catch (_error) {
            summary = null;
        }

        const normalizedLocal = normalizeSummary(summary);
        if (normalizedLocal) {
            renderSummary(normalizedLocal);
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const reference = String(params.get("reference") || "").trim();

        if (reference) {
            const remoteSummary = await fetchOrderByReference(reference);
            if (remoteSummary) {
                renderSummary(remoteSummary);
                return;
            }
        }

        if (!summary || typeof summary !== "object") {
            renderFallback();
            return;
        }
    }

    init().catch(() => {
        renderFallback();
    });
})();
