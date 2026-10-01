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

    const gatewayReference = document.getElementById("gatewayReference");
    const gatewayMethod = document.getElementById("gatewayMethod");
    const gatewayStatus = document.getElementById("gatewayStatus");
    const gatewayExternal = document.getElementById("gatewayExternal");
    const gatewayMessage = document.getElementById("gatewayMessage");
    const openGatewayBtn = document.getElementById("openGatewayBtn");
    const confirmSuccessBtn = document.getElementById("confirmSuccessBtn");
    const confirmFailBtn = document.getElementById("confirmFailBtn");

    const params = new URLSearchParams(window.location.search);
    const reference = String(params.get("reference") || "").trim();
    const method = String(params.get("method") || "").trim() || "pasarela";
    const externalUrl = String(params.get("external") || "").trim();

    function apiUrl(path) {
        return `${API_BASE}${path}`;
    }

    function setMessage(text, type, options = {}) {
        gatewayMessage.textContent = text || "";
        gatewayMessage.className = "status";

        if (type === "ok") {
            gatewayMessage.classList.add("ok");
        }

        if (type === "error") {
            gatewayMessage.classList.add("error");
        }

        if (options.confirmed) {
            gatewayMessage.classList.add("is-confirmed");
        }

        if (options.highlight !== false && text) {
            gatewayMessage.classList.add("is-highlight");
        }
    }

    function setButtonsLoading(active, label) {
        [openGatewayBtn, confirmSuccessBtn, confirmFailBtn].forEach((button) => {
            if (!button) {
                return;
            }

            if (!button.dataset.defaultText) {
                button.dataset.defaultText = button.textContent;
            }

            button.disabled = active;
            button.textContent = button.dataset.defaultText;
            button.classList.toggle("is-loading", active && button === confirmSuccessBtn);
        });

        if (active && label) {
            confirmSuccessBtn.textContent = label;
        }
    }

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data && data.error ? data.error : "No fue posible confirmar el resultado de pago.");
        }

        return data;
    }

    function mapMethodLabel(value) {
        const key = String(value || "").toLowerCase();

        switch (key) {
            case "nequi":
                return "Nequi";
            case "card":
                return "Tarjeta";
            case "paypal":
                return "PayPal";
            case "general":
                return "Pasarela general";
            default:
                return "Pasarela";
        }
    }

    function normalizeSummary(order) {
        return {
            reference: order.reference,
            status: order.status,
            createdAt: order.createdAt,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            customerAddress: order.customerAddress,
            zone: order.zone,
            subtotalInCents: Number(order.subtotalInCents) || 0,
            shippingInCents: Number(order.shippingInCents) || 0,
            totalInCents: Number(order.totalInCents) || 0,
            items: Array.isArray(order.items)
                ? order.items.map((item) => ({
                    name: item.name || item.id,
                    qty: Number(item.qty) || 0,
                    totalPrice: Number(item.totalPrice) || 0
                }))
                : [],
            location: order.location || null,
            invoiceSent: Boolean(order.invoiceSent),
            invoiceMessage: String(order.invoiceMessage || "")
        };
    }

    async function confirmPayment(result) {
        if (!reference) {
            setMessage("No se encontro referencia de pago.", "error");
            return;
        }

        try {
            setButtonsLoading(true, "Confirmando...");
            setMessage("Actualizando estado de pago...", "");

            const order = await postJson(apiUrl(`/api/orders/${encodeURIComponent(reference)}/payment-result`), {
                result
            });

            const summary = normalizeSummary(order);
            sessionStorage.setItem(store.ORDER_SUMMARY_KEY, JSON.stringify(summary));

            if (result === "success") {
                store.clearCart();
                setMessage("Pago confirmado. Redirigiendo...", "ok", { confirmed: true });
            }

            const nextUrl = String(order.nextUrl || "").trim();
            if (nextUrl) {
                window.location.assign(nextUrl);
                return;
            }

            window.location.assign(result === "success" ? "gracias.html" : "pago-error.html");
        } catch (error) {
            setMessage(error.message || "No fue posible actualizar el pago.", "error");
            setButtonsLoading(false);
        }
    }

    function initView() {
        if (!reference) {
            setMessage("No hay referencia de orden. Regresa al check in e intenta de nuevo.", "error");
            confirmSuccessBtn.disabled = true;
            confirmFailBtn.disabled = true;
        }

        gatewayReference.textContent = reference || "-";
        gatewayMethod.textContent = mapMethodLabel(method);
        openGatewayBtn.textContent = `Ir a ${mapMethodLabel(method)}`;

        if (externalUrl) {
            gatewayExternal.textContent = "Configurada";
            openGatewayBtn.disabled = false;
        } else {
            gatewayExternal.textContent = "No configurada";
            openGatewayBtn.disabled = true;
            setMessage("No hay URL externa configurada. Usa los botones de confirmacion para simular el resultado.", "error");
        }
    }

    function setupEvents() {
        openGatewayBtn.addEventListener("click", () => {
            if (!externalUrl) {
                setMessage("No existe URL externa configurada para este metodo.", "error");
                return;
            }

            window.open(externalUrl, "_blank", "noopener,noreferrer");
            setMessage("Pasarela externa abierta en nueva pestana. Luego confirma el resultado aqui.", "ok");
        });

        confirmSuccessBtn.addEventListener("click", () => {
            gatewayStatus.textContent = "Pago exitoso";
            confirmPayment("success");
        });

        confirmFailBtn.addEventListener("click", () => {
            gatewayStatus.textContent = "Pago fallido";
            confirmPayment("failed");
        });
    }

    initView();
    setupEvents();
})();
