(function () {
    const STORAGE_KEY = "seido_cart_state_v1";
    const ORDER_SUMMARY_KEY = "seido_order_summary_v2";

    const dishes = [
        {
            id: "ramen-shoyu",
            name: "Ramen Shoyu Control",
            category: "ramen",
            description: "Caldo concentrado, tare shoyu y huevo marinado.",
            price: 36000,
            image: "https://images.pexels.com/photos/723198/pexels-photo-723198.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=540&w=720&fm=webp&q=70",
            alt: "Ramen servido en bowl negro"
        },
        {
            id: "ramen-miso",
            name: "Ramen Miso 2.0",
            category: "ramen",
            description: "Miso rojo, maiz dorado y cerdo glaseado.",
            price: 39000,
            image: "https://images.pexels.com/photos/884596/pexels-photo-884596.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=540&w=720&fm=webp&q=70",
            alt: "Ramen de miso con toppings"
        },
        {
            id: "roll-salmon",
            name: "Salmon Precision Roll",
            category: "roll",
            description: "Salmon, queso crema, pepino y sesamo tostado.",
            price: 34000,
            image: "https://images.pexels.com/photos/2098085/pexels-photo-2098085.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=540&w=720&fm=webp&q=70",
            alt: "Rolls de salmon en emplatado premium"
        },
        {
            id: "roll-crunch",
            name: "Crunch Tempura Roll",
            category: "roll",
            description: "Camaron tempura, aguacate y salsa de la casa.",
            price: 37000,
            image: "https://images.pexels.com/photos/2323398/pexels-photo-2323398.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=540&w=720&fm=webp&q=70",
            alt: "Roll tempura con textura crujiente"
        },
        {
            id: "gyoza-yuzu",
            name: "Gyoza Yuzu Set",
            category: "snack",
            description: "Seis piezas con dip citrico y vegetales.",
            price: 22000,
            image: "https://images.pexels.com/photos/4518843/pexels-photo-4518843.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=540&w=720&fm=webp&q=70",
            alt: "Gyozas sobre plato claro"
        },
        {
            id: "karaage-kit",
            name: "Karaage Crispy Kit",
            category: "snack",
            description: "Pollo marinado, mayo suave y pickles rapidos.",
            price: 26000,
            image: "https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=540&w=720&fm=webp&q=70",
            alt: "Pollo karaage dorado"
        }
    ];

    function formatCop(value) {
        return new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            maximumFractionDigits: 0
        }).format(Number(value) || 0);
    }

    function sanitizeQty(value) {
        const qty = Number(value);
        if (!Number.isFinite(qty) || qty < 0) {
            return 0;
        }

        return Math.floor(qty);
    }

    function readCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            const normalized = {};

            Object.keys(parsed).forEach((dishId) => {
                const qty = sanitizeQty(parsed[dishId]);
                if (qty > 0 && dishes.some((dish) => dish.id === dishId)) {
                    normalized[dishId] = qty;
                }
            });

            return normalized;
        } catch (_error) {
            return {};
        }
    }

    function writeCart(cartState) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cartState || {}));
    }

    function setQuantity(dishId, qty) {
        const cartState = readCart();
        const cleanQty = sanitizeQty(qty);

        if (!dishes.some((dish) => dish.id === dishId)) {
            return cartState;
        }

        if (cleanQty <= 0) {
            delete cartState[dishId];
        } else {
            cartState[dishId] = cleanQty;
        }

        writeCart(cartState);
        return cartState;
    }

    function adjustQuantity(dishId, delta) {
        const cartState = readCart();
        const current = sanitizeQty(cartState[dishId] || 0);
        const next = current + Number(delta || 0);
        return setQuantity(dishId, next);
    }

    function clearCart() {
        writeCart({});
        return {};
    }

    function getDishById(dishId) {
        return dishes.find((dish) => dish.id === dishId) || null;
    }

    function getCartLines() {
        const cartState = readCart();
        const lines = [];

        Object.keys(cartState).forEach((dishId) => {
            const dish = getDishById(dishId);
            const qty = sanitizeQty(cartState[dishId]);

            if (!dish || qty <= 0) {
                return;
            }

            lines.push({
                id: dish.id,
                name: dish.name,
                qty,
                unitPrice: dish.price,
                totalPrice: dish.price * qty,
                category: dish.category,
                description: dish.description,
                image: dish.image,
                alt: dish.alt
            });
        });

        return lines;
    }

    function getSubtotal() {
        return getCartLines().reduce((acc, line) => acc + line.totalPrice, 0);
    }

    function getTotalQty() {
        return getCartLines().reduce((acc, line) => acc + line.qty, 0);
    }

    window.SeidoStore = {
        STORAGE_KEY,
        ORDER_SUMMARY_KEY,
        dishes,
        formatCop,
        readCart,
        writeCart,
        setQuantity,
        adjustQuantity,
        clearCart,
        getDishById,
        getCartLines,
        getSubtotal,
        getTotalQty
    };
})();
