# SEIDO Landing Multipagina

Flujo mobile-first con paginas separadas:

1. `index.html` -> pantalla de carga.
2. `inicio.html` -> portada basica con botones `Haz tu pedido` y `SEIDO`.
3. `catalogo.html` -> seleccion de productos.
4. `checkin.html` -> datos de envio, mapa interactivo y metodo de pago.
5. `pasarela.html` -> confirmacion de pago para metodos externos.
6. `gracias.html` -> resumen final de compra.
7. `pago-error.html` -> fallback cuando no se confirma pago.
8. `seido.html` -> contenido institucional/cultural.

## Paleta

El color de contraste obligatorio es `#82612d` y se usa en botones primarios, estados activos e indicadores.

## Instalacion

```bash
npm install
npm run dev
```

## Variables de entorno

- `PORT=3000`
- `APP_BASE_URL=http://localhost:3000`
- `ORDER_CURRENCY=COP`
- `FORMSPREE_ENDPOINT=https://formspree.io/f/xykdbqaz`
- `FORMSPREE_TIMEOUT_MS=8000`
- `GOOGLE_MAPS_SERVER_API_KEY=` (opcional)
- `GEOCODER_USER_AGENT=seido-cash-ordering-app/1.0`
- `NEQUI_CHECKOUT_URL=` (opcional)
- `CARD_CHECKOUT_URL=` (opcional)
- `PAYPAL_CHECKOUT_URL=` (opcional)
- `GENERAL_CHECKOUT_URL=` (opcional)
- `DELIVERY_ZONES_JSON=` (opcional)
- `DB_FILE=./server/data/orders.sqlite`
- `CORS_ORIGIN=*`

## Endpoints backend

- `GET /api/health`
- `GET /api/checkout-config`
- `GET /api/reverse-geocode`
- `GET /api/geocode`
- `POST /create-order`
- `POST /api/create-order`
- `POST /api/orders/:reference/payment-result`
- `GET /api/orders/:reference`

## Flujo de pagos

- `cash`: crea orden, envia datos a Formspree desde backend y redirige a `gracias.html`.
- `nequi`, `card`, `paypal`, `general`: crea orden pendiente y redirige a `pasarela.html` con el metodo seleccionado.
- Desde `pasarela.html` se confirma resultado:
  - exito -> `gracias.html`
  - fallo -> `pago-error.html`

El frontend nunca envia formularios directos a Formspree ni expone llaves privadas.
