const CATALOG = {
    "ramen-shoyu": { name: "Ramen Shoyu Control", price: 36000 },
    "ramen-miso": { name: "Ramen Miso 2.0", price: 39000 },
    "roll-salmon": { name: "Salmon Precision Roll", price: 34000 },
    "roll-crunch": { name: "Crunch Tempura Roll", price: 37000 },
    "gyoza-yuzu": { name: "Gyoza Yuzu Set", price: 22000 },
    "karaage-kit": { name: "Karaage Crispy Kit", price: 26000 }
};

const SHIPPING_BY_ZONE = {
    auto: 5000,
    norte: 6000,
    centro: 4500,
    sur: 5500,
    empresarial: 5000
};

module.exports = {
    CATALOG,
    SHIPPING_BY_ZONE
};
