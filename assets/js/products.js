(function () {
    const productGrid = document.querySelector("[data-products-grid]");
    const selectionGrid = document.querySelector("[data-selection-grid]");
    const productDetail = document.querySelector("[data-product-detail]");
    if (!productGrid && !selectionGrid && !productDetail) return;

    const CART_STORAGE_KEY = "laGoutteDeMerCart";
    const LAST_ORDER_STORAGE_KEY = "laGoutteDeMerLastOrder";
    const PAYPAL_PENDING_STORAGE_KEY = "laGoutteDeMerPendingPayPalOrder";
    const STRIPE_PENDING_STORAGE_KEY = "laGoutteDeMerPendingStripeSession";
    const DEFAULT_IMAGE_FALLBACK = "";
    const status = document.querySelector("[data-products-status]");
    const sourceUrl = window.PRODUCTS_SOURCE_URL || "https://docs.google.com/spreadsheets/d/1yZVWg-Ypzd2VtFE4tVf0XmVVvTqzgFu8TTq4KAyvsb0/export?format=csv&gid=1348794459";
    const cacheSafeSourceUrl = sourceUrl.includes("docs.google.com")
        ? `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}_=${Date.now()}`
        : sourceUrl;

    const shopConfig = resolveCheckoutConfig(window.SHOP_CHECKOUT_CONFIG || {});

    let currentOrder = null;
    let cartElements = null;
    let checkoutElements = null;

    function resolveCheckoutConfig(customConfig) {
        const seller = customConfig.seller || {};
        const backend = customConfig.backend || {};
        const paymentMethods = customConfig.paymentMethods || {};
        const documents = customConfig.documents || {};
        const emailDelivery = customConfig.emailDelivery || {};

        return {
            backend: {
                baseUrl: clean(backend.baseUrl)
            },
            seller: {
                brandName: seller.brandName || "La Goutte de Mer Shop",
                email: seller.email || "lagouttedemer@gmail.com",
                phone: seller.phone || "+33 7 66 88 42 22",
                addressLine1: seller.addressLine1 || "Seysses",
                city: seller.city || "Seysses",
                postalCode: seller.postalCode || "",
                country: seller.country || "France",
                vatNumber: seller.vatNumber || "",
                siret: seller.siret || ""
            },
            documents: {
                invoicePrefix: documents.invoicePrefix || "FAC"
            },
            paymentMethods: {
                stripe: {
                    id: "stripe",
                    enabled: paymentMethods.stripe?.enabled !== false,
                    label: paymentMethods.stripe?.label || "Stripe",
                    description: paymentMethods.stripe?.description || "Paiement par carte bancaire via Stripe.",
                    checkoutUrl: clean(paymentMethods.stripe?.checkoutUrl),
                    logo: "assets/images/stripe-badge.svg"
                },
                paypal: {
                    id: "paypal",
                    enabled: paymentMethods.paypal?.enabled !== false,
                    label: paymentMethods.paypal?.label || "PayPal",
                    description: paymentMethods.paypal?.description || "Paiement sécurisé via PayPal.",
                    checkoutUrl: clean(paymentMethods.paypal?.checkoutUrl),
                    logo: "assets/images/paypal-badge.svg"
                }
            },
            emailDelivery: {
                provider: clean(emailDelivery.provider || "emailjs").toLowerCase(),
                publicKey: clean(emailDelivery.publicKey),
                serviceId: clean(emailDelivery.serviceId),
                templates: {
                    clientSummary: clean(emailDelivery.templates?.clientSummary),
                    clientInvoice: clean(emailDelivery.templates?.clientInvoice),
                    sellerInvoice: clean(emailDelivery.templates?.sellerInvoice)
                }
            }
        };
    }

    function clean(value) {
        return String(value || "").trim();
    }

    function normalizeCategory(value) {
        const normalized = clean(value)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z]/g, "");

        if (normalized.startsWith("homme")) return "hommes";
        if (normalized.startsWith("femme")) return "femmes";
        if (normalized.startsWith("accessoire")) return "accessoires";
        return clean(value).toLowerCase();
    }

    function categoryPage(product) {
        const category = normalizeCategory(product.categorie);
        return ["hommes", "femmes", "accessoires"].includes(category) ? `${category}.html` : "index.html";
    }

    function productPage(product) {
        return `article.html?id=${encodeURIComponent(clean(product.id))}`;
    }

    function normalizeStatus(value) {
        return clean(value)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function isUnavailable(product) {
        return normalizeStatus(product.statut) === "indisponible";
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = clean(value);
        return div.innerHTML;
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/"/g, "&quot;");
    }

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let cell = "";
        let quoted = false;

        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            const next = text[i + 1];

            if (char === '"' && quoted && next === '"') {
                cell += '"';
                i += 1;
            } else if (char === '"') {
                quoted = !quoted;
            } else if (char === "," && !quoted) {
                row.push(cell);
                cell = "";
            } else if ((char === "\n" || char === "\r") && !quoted) {
                if (char === "\r" && next === "\n") i += 1;
                row.push(cell);
                if (row.some(Boolean)) rows.push(row);
                row = [];
                cell = "";
            } else {
                cell += char;
            }
        }

        row.push(cell);
        if (row.some(Boolean)) rows.push(row);

        const headers = rows.shift().map((header) => header.trim());
        if (!headers.includes("id") || !headers.includes("categorie") || !headers.includes("nom")) {
            throw new Error("Format CSV invalide");
        }

        return rows
            .map((cells) => {
                const item = {};
                headers.forEach((header, index) => {
                    item[header] = (cells[index] || "").trim();
                });
                return item;
            })
            .filter((item) => item.id || item.categorie || item.nom || item.prix || item.promo || item.description || item.photos || item.statut);
    }

    function isSelected(value) {
        return ["oui", "yes", "true", "1", "x", "selection", "sÃ©lection", "sélection"].includes(clean(value).toLowerCase());
    }

    function parsePrice(value) {
        const normalized = clean(value)
            .replace(/\s/g, "")
            .replace("EUR", "")
            .replace(/\u20ac/g, "")
            .replace(/\u00e2\u201a\u00ac/g, "")
            .replace(",", ".");
        const number = Number.parseFloat(normalized);
        return Number.isFinite(number) ? number : 0;
    }

    function formatPrice(value) {
        return value.toLocaleString("fr-FR", {
            style: "currency",
            currency: "EUR"
        });
    }

    function displayPrice(value) {
        const parsed = parsePrice(value);
        return parsed > 0 ? formatPrice(parsed) : clean(value);
    }

    function driveImageUrl(fileId) {
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
    }

    function extractDriveId(url) {
        const value = clean(url);
        if (!value) return "";

        const byQuery = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (byQuery) return byQuery[1];

        const byPath = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (byPath) return byPath[1];

        return "";
    }

    function normalizePhotoUrl(photo) {
        const value = clean(photo);
        if (!value) return "";

        if (value.includes("drive.google.com") || value.includes("googleusercontent.com")) {
            const fileId = extractDriveId(value);
            return fileId ? driveImageUrl(fileId) : value;
        }

        return value;
    }

    function photosOf(product) {
        const remotePhotos = (product.photos || "")
            .split(/[|;]/)
            .map((photo) => normalizePhotoUrl(photo))
            .filter(Boolean);

        return remotePhotos.filter((photo, index, list) => list.indexOf(photo) === index);
    }

    function productPrice(product) {
        return product.promo || product.prix || "";
    }

    function loadCart() {
        try {
            const saved = localStorage.getItem(CART_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            return [];
        }
    }

    function saveCart(items) {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }

    function saveLastOrder(order) {
        localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify(order));
    }

    function priceMarkup(product, className) {
        const price = product.prix || "";
        const promo = product.promo || "";

        if (promo) {
            return `
                <p class="${className} price price--promo">
                    <span class="price__old">${price}</span>
                    <span class="price__new">${promo}</span>
                </p>
            `;
        }

        return `<p class="${className} price"><span>${price}</span></p>`;
    }

    function sizeMarkup(product, className) {
        const size = clean(product.taille);
        if (!size) return "";
        return `<p class="${className}">Taille : <span>${escapeHtml(size)}</span></p>`;
    }

    function cartButtonMarkup(product, className) {
        const unavailable = isUnavailable(product);
        const label = unavailable ? "Article indisponible" : "Ajouter au panier";
        const photos = photosOf(product);
        const mainPhoto = photos[0] || DEFAULT_IMAGE_FALLBACK;

        return `
            <button
                class="button button--small ${className}"
                type="button"
                data-add-to-cart
                data-id="${escapeAttribute(product.id)}"
                data-name="${escapeAttribute(product.nom)}"
                data-price="${escapeAttribute(productPrice(product))}"
                data-category="${escapeAttribute(product.categorie)}"
                data-image="${escapeAttribute(mainPhoto)}"
                data-size="${escapeAttribute(product.taille)}"
                data-unavailable="${unavailable ? "true" : "false"}"
                ${unavailable ? "disabled aria-disabled=\"true\"" : ""}
            >${label}</button>
        `;
    }

    function catalogCard(product) {
        const photos = photosOf(product);
        const mainPhoto = photos[0] || DEFAULT_IMAGE_FALLBACK;
        const fallbackPhoto = photos[1] || DEFAULT_IMAGE_FALLBACK;
        const thumbnails = photos.map((photo, index) => `
            <button class="catalog-card__thumb${index === 0 ? " is-active" : ""}" type="button" data-photo="${photo}" aria-label="Voir la photo ${index + 1}">
                <img src="${photo}" alt="" data-fallback-photo="${escapeAttribute(index === 0 ? fallbackPhoto : DEFAULT_IMAGE_FALLBACK)}">
            </button>
        `).join("");

        return `
            <article class="catalog-card">
                <div class="catalog-card__media">
                    <a href="${productPage(product)}" class="catalog-card__link" aria-label="Voir ${escapeAttribute(product.nom)}">
                        <img class="catalog-card__image" src="${mainPhoto}" alt="" data-fallback-photo="${escapeAttribute(fallbackPhoto)}">
                    </a>
                </div>
                ${photos.length > 1 ? `<div class="catalog-card__thumbs">${thumbnails}</div>` : ""}
                <div class="catalog-card__content">
                    <p class="catalog-card__status">${product.statut || "disponible"}</p>
                    <h2><a href="${productPage(product)}" class="catalog-card__title-link">${product.nom}</a></h2>
                    ${sizeMarkup(product, "catalog-card__size")}
                    <p>${product.description}</p>
                    ${priceMarkup(product, "catalog-card__price")}
                    <div class="catalog-card__actions">
                        <a href="${productPage(product)}" class="button button--small">Voir l'article</a>
                        ${cartButtonMarkup(product, "catalog-card__cart")}
                    </div>
                </div>
            </article>
        `;
    }

    function miniCard(product) {
        const photos = photosOf(product);
        const mainPhoto = photos[0] || DEFAULT_IMAGE_FALLBACK;
        const fallbackPhoto = photos[1] || DEFAULT_IMAGE_FALLBACK;

        return `
            <article class="mini-product">
                <a href="${productPage(product)}" aria-label="Voir l'article">
                    <img src="${mainPhoto}" alt="" data-fallback-photo="${escapeAttribute(fallbackPhoto)}">
                    <h3>${product.nom}</h3>
                    ${sizeMarkup(product, "mini-product__size")}
                    ${priceMarkup(product, "mini-product__price")}
                </a>
                ${cartButtonMarkup(product, "mini-product__cart")}
            </article>
        `;
    }

    function detailView(product) {
        const photos = photosOf(product);
        const mainPhoto = photos[0] || DEFAULT_IMAGE_FALLBACK;
        const fallbackPhoto = photos[1] || DEFAULT_IMAGE_FALLBACK;
        const thumbnails = photos.map((photo, index) => `
            <button class="product-detail__thumb${index === 0 ? " is-active" : ""}" type="button" data-photo="${photo}" aria-label="Voir la photo ${index + 1}">
                <img src="${photo}" alt="" data-fallback-photo="${escapeAttribute(index === 0 ? fallbackPhoto : DEFAULT_IMAGE_FALLBACK)}">
            </button>
        `).join("");

        return `
            <article class="product-detail-card">
                <div class="product-detail__media">
                    <img class="product-detail__image" src="${mainPhoto}" alt="" data-fallback-photo="${escapeAttribute(fallbackPhoto)}">
                    ${photos.length > 1 ? `<div class="product-detail__thumbs">${thumbnails}</div>` : ""}
                </div>
                <div class="product-detail__content">
                    <p class="catalog-card__status">${product.statut || "disponible"}</p>
                    <h1>${product.nom}</h1>
                    ${sizeMarkup(product, "product-detail__size")}
                    <p class="product-detail__description">${product.description || ""}</p>
                    ${priceMarkup(product, "product-detail__price")}
                    <div class="product-detail__actions">
                        ${cartButtonMarkup(product, "product-detail__cart")}
                        <a href="${categoryPage(product)}" class="button button--small">Retour categorie</a>
                    </div>
                </div>
            </article>
        `;
    }

    function renderCatalog(products) {
        if (!productGrid) return;

        const category = normalizeCategory(productGrid.dataset.category);
        const filtered = products.filter((product) => normalizeCategory(product.categorie) === category);
        if (!filtered.length) {
            productGrid.innerHTML = `<p class="catalog-empty">Aucun article disponible pour le moment.</p>`;
            if (status) status.textContent = "0 article";
            return;
        }

        productGrid.innerHTML = filtered.map(catalogCard).join("");
        if (status) status.textContent = `${filtered.length} article${filtered.length > 1 ? "s" : ""}`;
    }

    function renderSelection(products) {
        if (!selectionGrid) return;

        const hasSelectionColumn = products.some((product) => Object.prototype.hasOwnProperty.call(product, "selection_moment"));
        let selected = (hasSelectionColumn ? products.filter((product) => isSelected(product.selection_moment)) : products).slice(0, 6);

        if (!selected.length) {
            selected = products.slice(0, 6);
        }

        if (!selected.length) {
            selectionGrid.innerHTML = `<p class="catalog-empty">La sélection du moment arrive bientôt.</p>`;
            return;
        }

        selectionGrid.innerHTML = selected.map(miniCard).join("");
    }

    function renderProductDetail(products) {
        if (!productDetail) return;

        const params = new URLSearchParams(window.location.search);
        const productId = clean(params.get("id"));
        if (!productId) {
            productDetail.innerHTML = `<p class="catalog-empty">Aucun article selectionne.</p>`;
            return;
        }

        const product = products.find((item) => clean(item.id) === productId);
        if (!product) {
            productDetail.innerHTML = `<p class="catalog-empty">Cet article est introuvable ou n'est plus disponible.</p>`;
            return;
        }

        productDetail.innerHTML = detailView(product);
        document.title = `${product.nom} - La Goutte de Mer Shop`;
    }

    function enableGallery() {
        document.addEventListener("click", (event) => {
            const thumb = event.target.closest("[data-photo]");
            if (!thumb) return;

            const card = thumb.closest(".catalog-card, .product-detail-card");
            if (!card) return;
            const image = card.querySelector(".catalog-card__image, .product-detail__image");
            image.src = thumb.dataset.photo;
            card.querySelectorAll(".catalog-card__thumb, .product-detail__thumb").forEach((button) => button.classList.remove("is-active"));
            thumb.classList.add("is-active");
        });
    }

    function enableImageFallbacks() {
        document.addEventListener("error", (event) => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement)) return;

            const fallbackPhoto = image.dataset.fallbackPhoto;
            if (!fallbackPhoto || image.dataset.fallbackApplied === "true") return;

            image.dataset.fallbackApplied = "true";
            image.src = fallbackPhoto;
        }, true);
    }

    function setupCart() {
        const headerCart = document.querySelector(".header-actions a[aria-label='Panier']");
        const cartButton = document.createElement("button");
        const backdrop = document.createElement("div");
        const panel = document.createElement("aside");

        cartButton.className = "cart-floating-button";
        cartButton.type = "button";
        cartButton.setAttribute("aria-label", "Ouvrir le panier");
        cartButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 13H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2"/></svg>
            <span data-cart-count>0</span>
        `;

        backdrop.className = "cart-backdrop";
        panel.className = "cart-panel";
        panel.setAttribute("aria-label", "Panier");
        panel.innerHTML = `
            <div class="cart-panel__head">
                <h2>Panier</h2>
                <button type="button" data-cart-close aria-label="Fermer le panier">&times;</button>
            </div>
            <div class="cart-panel__items" data-cart-items></div>
            <div class="cart-panel__footer">
                <div class="cart-panel__total">
                    <span>Total</span>
                    <strong data-cart-total>0,00 EUR</strong>
                </div>
                <div class="cart-panel__actions cart-panel__actions--double">
                    <button type="button" data-cart-clear>Vider</button>
                    <button type="button" data-cart-checkout class="cart-panel__primary">Valider le panier</button>
                </div>
            </div>
        `;

        document.body.appendChild(cartButton);
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        if (headerCart) {
            headerCart.classList.add("header-cart-link");
            headerCart.insertAdjacentHTML("beforeend", `<span class="header-cart-count" data-cart-count>0</span>`);
            headerCart.addEventListener("click", (event) => {
                event.preventDefault();
                openCart();
            });
        }

        cartElements = {
            cartButton,
            backdrop,
            panel,
            items: panel.querySelector("[data-cart-items]"),
            total: panel.querySelector("[data-cart-total]"),
            clearButton: panel.querySelector("[data-cart-clear]"),
            checkoutButton: panel.querySelector("[data-cart-checkout]")
        };

        cartButton.addEventListener("click", openCart);
        backdrop.addEventListener("click", closeCart);
        panel.querySelector("[data-cart-close]").addEventListener("click", closeCart);
        cartElements.clearButton.addEventListener("click", () => {
            saveCart([]);
            renderCart();
        });
        cartElements.checkoutButton.addEventListener("click", openCheckout);

        cartElements.items.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-remove-cart-item]");
            if (!removeButton) return;
            const items = loadCart().filter((item) => item.id !== removeButton.dataset.removeCartItem);
            saveCart(items);
            renderCart();
        });

        document.addEventListener("click", (event) => {
            const addButton = event.target.closest("[data-add-to-cart]");
            if (!addButton) return;
            if (addButton.disabled || addButton.dataset.unavailable === "true") return;

            addToCart({
                id: addButton.dataset.id,
                name: addButton.dataset.name,
                price: addButton.dataset.price,
                category: addButton.dataset.category,
                image: addButton.dataset.image,
                size: addButton.dataset.size
            });

            addButton.textContent = "Dans le panier";
            window.setTimeout(() => {
                addButton.textContent = "Ajouter au panier";
            }, 1200);
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeCheckout();
                closeCart();
            }
        });

        renderCart();
    }

    function setupCheckout() {
        const backdrop = document.createElement("div");
        const panel = document.createElement("aside");

        backdrop.className = "checkout-backdrop";
        panel.className = "checkout-panel";
        panel.setAttribute("aria-label", "Validation de commande");
        panel.innerHTML = `
            <div class="checkout-panel__head">
                <div>
                    <p class="checkout-panel__eyebrow">Paiement et emails</p>
                    <h2>Finaliser la commande</h2>
                </div>
                <button type="button" data-checkout-close aria-label="Fermer">&times;</button>
            </div>
            <div class="checkout-panel__body">
                <form class="checkout-form" data-checkout-form>
                    <div class="checkout-form__grid">
                        <label>
                            <span>Prénom</span>
                            <input type="text" name="firstName" required>
                        </label>
                        <label>
                            <span>Nom</span>
                            <input type="text" name="lastName" required>
                        </label>
                        <label>
                            <span>Email</span>
                            <input type="email" name="email" required>
                        </label>
                        <label>
                            <span>Téléphone</span>
                            <input type="tel" name="phone" required>
                        </label>
                        <label class="checkout-form__full">
                            <span>Adresse</span>
                            <input type="text" name="addressLine1" required>
                        </label>
                        <label>
                            <span>Code postal</span>
                            <input type="text" name="postalCode" required>
                        </label>
                        <label>
                            <span>Ville</span>
                            <input type="text" name="city" required>
                        </label>
                        <label class="checkout-form__full">
                            <span>Message vendeur</span>
                            <textarea name="customerNote" rows="3" placeholder="Précision de livraison, demande particulière, créneau..."></textarea>
                        </label>
                    </div>
                    <div class="checkout-methods">
                        <h3>Mode de paiement</h3>
                        <div class="checkout-methods__list" data-payment-methods></div>
                    </div>
                    <div class="checkout-summary">
                        <h3>Récapitulatif</h3>
                        <div class="checkout-summary__items" data-checkout-items></div>
                        <div class="checkout-summary__total">
                            <span>Total</span>
                            <strong data-checkout-total>0,00 EUR</strong>
                        </div>
                    </div>
                    <p class="checkout-feedback" data-checkout-feedback></p>
                    <div class="checkout-actions">
                        <button type="button" class="checkout-actions__secondary" data-checkout-cancel>Retour au panier</button>
                        <button type="submit" class="checkout-actions__primary">Valider et payer</button>
                    </div>
                </form>
                <section class="checkout-success" data-checkout-success hidden>
                    <p class="checkout-panel__eyebrow">Commande prête</p>
                    <h3>Emails et facture</h3>
                    <p data-checkout-success-text></p>
                    <div class="checkout-success__meta" data-checkout-success-meta></div>
                    <div class="checkout-success__actions">
                        <button type="button" class="checkout-actions__secondary" data-close-success>Fermer</button>
                        <a href="#" target="_blank" rel="noopener" data-pay-now aria-disabled="true">Payer maintenant</a>
                    </div>
                </section>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        checkoutElements = {
            backdrop,
            panel,
            form: panel.querySelector("[data-checkout-form]"),
            paymentMethods: panel.querySelector("[data-payment-methods]"),
            items: panel.querySelector("[data-checkout-items]"),
            total: panel.querySelector("[data-checkout-total]"),
            feedback: panel.querySelector("[data-checkout-feedback]"),
            success: panel.querySelector("[data-checkout-success]"),
            successText: panel.querySelector("[data-checkout-success-text]"),
            successMeta: panel.querySelector("[data-checkout-success-meta]"),
            payNow: panel.querySelector("[data-pay-now]")
        };

        renderPaymentMethods();

        backdrop.addEventListener("click", closeCheckout);
        panel.querySelector("[data-checkout-close]").addEventListener("click", closeCheckout);
        panel.querySelector("[data-checkout-cancel]").addEventListener("click", closeCheckout);
        panel.querySelector("[data-close-success]").addEventListener("click", closeCheckout);
        checkoutElements.form.addEventListener("submit", handleCheckoutSubmit);

    }

    function paymentLogoMarkup(method) {
        return `<img class="payment-method__logo" src="${escapeAttribute(method.logo)}" alt="${escapeAttribute(method.label)}">`;
    }

    function renderPaymentMethods() {
        const methods = getAvailablePaymentMethods();
        checkoutElements.paymentMethods.innerHTML = methods.map((method, index) => `
            <label class="payment-method${isPaymentMethodReady(method) ? "" : " payment-method--pending"} payment-method--${escapeAttribute(method.id)}">
                <input type="radio" name="paymentMethod" value="${escapeAttribute(method.id)}" ${index === 0 ? "checked" : ""}>
                <span class="payment-method__content">
                    <span class="payment-method__brand">
                        ${paymentLogoMarkup(method)}
                    </span>
                    <strong class="payment-method__title">${escapeHtml(method.label)}</strong>
                    ${isPaymentMethodReady(method) ? "" : `<em>Méthode de paiement à configurer dans assets/js/checkout-config.js</em>`}
                </span>
            </label>
        `).join("");
    }

    function getAvailablePaymentMethods() {
        return Object.values(shopConfig.paymentMethods).filter((method) => method.enabled);
    }

    function isPaymentMethodReady(method) {
        if (method.id === "paypal" || method.id === "stripe") {
            return Boolean(shopConfig.backend.baseUrl);
        }

        return Boolean(method.checkoutUrl);
    }

    function addToCart(product) {
        const items = loadCart();
        if (!items.some((item) => item.id === product.id)) {
            items.push(product);
            saveCart(items);
        }
        renderCart();
        openCart();
    }

    function renderCart() {
        const items = loadCart();
        const count = items.length;
        const total = items.reduce((sum, item) => sum + parsePrice(item.price), 0);

        document.querySelectorAll("[data-cart-count]").forEach((counter) => {
            counter.textContent = count;
            counter.hidden = count === 0;
        });

        cartElements.total.textContent = formatPrice(total);

        if (!items.length) {
            cartElements.items.innerHTML = `<p class="cart-empty">Votre panier est vide.</p>`;
        } else {
            cartElements.items.innerHTML = items.map((item) => `
                <article class="cart-item">
                    ${item.image ? `<img src="${escapeAttribute(item.image)}" alt="">` : `<div class="cart-item__placeholder"></div>`}
                    <div>
                        <h3>${escapeHtml(item.name)}</h3>
                        ${item.category ? `<p>${escapeHtml(item.category)}</p>` : ""}
                        ${item.size ? `<p class="cart-item__size">Taille : ${escapeHtml(item.size)}</p>` : ""}
                        <strong>${escapeHtml(displayPrice(item.price))}</strong>
                    </div>
                    <button type="button" data-remove-cart-item="${escapeAttribute(item.id)}" aria-label="Retirer ${escapeAttribute(item.name)}">&times;</button>
                </article>
            `).join("");
        }

        cartElements.clearButton.disabled = count === 0;
        cartElements.checkoutButton.disabled = count === 0;
    }

    function renderCheckoutSummary(items) {
        const total = items.reduce((sum, item) => sum + parsePrice(item.price), 0);
        checkoutElements.items.innerHTML = items.map((item) => `
            <article class="checkout-summary__item">
                <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    ${item.category ? `<small>${escapeHtml(item.category)}</small>` : ""}
                    ${item.size ? `<small>Taille : ${escapeHtml(item.size)}</small>` : ""}
                </div>
                <span>${escapeHtml(displayPrice(item.price))}</span>
            </article>
        `).join("");
        checkoutElements.total.textContent = formatPrice(total);
    }

    function openCart() {
        document.body.classList.add("cart-is-open");
    }

    function closeCart() {
        document.body.classList.remove("cart-is-open");
    }

    function openCheckout() {
        const items = loadCart();
        if (!items.length) return;

        currentOrder = null;
        checkoutElements.feedback.textContent = "";
        checkoutElements.success.hidden = true;
        checkoutElements.form.hidden = false;
        checkoutElements.payNow.href = "#";
        checkoutElements.payNow.setAttribute("aria-disabled", "true");
        renderCheckoutSummary(items);
        document.body.classList.add("checkout-is-open");
    }

    function closeCheckout() {
        document.body.classList.remove("checkout-is-open");
    }

    async function handleCheckoutSubmit(event) {
        event.preventDefault();
        const items = loadCart();
        if (!items.length) {
            checkoutElements.feedback.textContent = "Ajoutez au moins un article au panier.";
            return;
        }

        const formData = new FormData(checkoutElements.form);
        const paymentMethod = getAvailablePaymentMethods().find((method) => method.id === formData.get("paymentMethod"));
        if (!paymentMethod) {
            checkoutElements.feedback.textContent = "Choisissez un mode de paiement.";
            return;
        }

        const customer = {
            firstName: clean(formData.get("firstName")),
            lastName: clean(formData.get("lastName")),
            email: clean(formData.get("email")),
            phone: clean(formData.get("phone")),
            addressLine1: clean(formData.get("addressLine1")),
            postalCode: clean(formData.get("postalCode")),
            city: clean(formData.get("city")),
            customerNote: clean(formData.get("customerNote"))
        };

        if (!customer.firstName || !customer.lastName || !customer.email || !customer.phone || !customer.addressLine1 || !customer.postalCode || !customer.city) {
            checkoutElements.feedback.textContent = "Merci de compléter toutes les informations client.";
            return;
        }

        if (paymentMethod.id === "paypal" && shopConfig.backend.baseUrl) {
            const submitButton = checkoutElements.form.querySelector("[type='submit']");
            checkoutElements.feedback.textContent = "Création de la commande PayPal...";
            submitButton.disabled = true;

            try {
                const remoteOrder = await createPayPalBackendOrder(items, customer);
                const pendingOrder = {
                    orderNumber: remoteOrder.orderNumber,
                    invoiceNumber: remoteOrder.invoiceNumber,
                    paypalOrderId: remoteOrder.paypalOrderId,
                    customer
                };

                currentOrder = pendingOrder;
                saveLastOrder(pendingOrder);
                savePendingPayPalOrder(pendingOrder);
                window.location.href = remoteOrder.approvalUrl;
                return;
            } catch (error) {
                checkoutElements.feedback.textContent = error.message || "La création du paiement PayPal a échoué.";
            } finally {
                submitButton.disabled = false;
            }

            return;
        }

        if (paymentMethod.id === "stripe" && shopConfig.backend.baseUrl) {
            const submitButton = checkoutElements.form.querySelector("[type='submit']");
            checkoutElements.feedback.textContent = "Création de la session Stripe...";
            submitButton.disabled = true;

            try {
                const remoteSession = await createStripeBackendSession(items, customer);
                const pendingSession = {
                    orderNumber: remoteSession.orderNumber,
                    invoiceNumber: remoteSession.invoiceNumber,
                    stripeSessionId: remoteSession.stripeSessionId,
                    customer
                };

                currentOrder = pendingSession;
                saveLastOrder(pendingSession);
                savePendingStripeSession(pendingSession);
                window.location.href = remoteSession.checkoutUrl;
                return;
            } catch (error) {
                checkoutElements.feedback.textContent = error.message || "La création du paiement Stripe a échoué.";
            } finally {
                submitButton.disabled = false;
            }

            return;
        }

        checkoutElements.feedback.textContent = "Préparation de la commande et des emails...";

        const order = createOrder(items, customer, paymentMethod);
        currentOrder = order;
        saveLastOrder(order);

        let emailResult = { automated: false };
        try {
            emailResult = await sendOrderEmails(order);
        } catch (error) {
            emailResult = { automated: false, error: true };
        }

        checkoutElements.form.hidden = true;
        checkoutElements.success.hidden = false;
        checkoutElements.feedback.textContent = "";
        checkoutElements.successText.textContent = emailResult.automated
            ? "Les emails client/vendeur ont été envoyés automatiquement et la facture a été générée."
            : emailResult.error
                ? "La facture a été générée, mais l'envoi automatique des emails a échoué. Vérifiez la configuration EmailJS."
                : "La facture a été générée. Pour l'envoi automatique des emails client/vendeur, renseignez EmailJS dans assets/js/checkout-config.js.";

        checkoutElements.successMeta.innerHTML = `
            <div><span>Commande</span><strong>${escapeHtml(order.orderNumber)}</strong></div>
            <div><span>Facture</span><strong>${escapeHtml(order.invoiceNumber)}</strong></div>
            <div><span>Total</span><strong>${escapeHtml(formatPrice(order.totalAmount))}</strong></div>
            <div><span>Paiement</span><strong>${escapeHtml(order.paymentMethod.label)}</strong></div>
        `;

        const paymentUrl = buildPaymentUrl(order);
        if (paymentUrl) {
            checkoutElements.payNow.href = paymentUrl;
            checkoutElements.payNow.setAttribute("aria-disabled", "false");
        } else {
            checkoutElements.payNow.href = "#";
            checkoutElements.payNow.setAttribute("aria-disabled", "true");
        }

        saveCart([]);
        renderCart();
        closeCart();
    }

    async function createPayPalBackendOrder(items, customer) {
        const response = await fetch(`${shopConfig.backend.baseUrl}/api/checkout/paypal/order`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                cart: items.map((item) => ({
                    id: item.id,
                    quantity: 1,
                    name: item.name,
                    category: item.category,
                    image: item.image,
                    size: item.size,
                    price: item.price,
                    unitAmount: parsePrice(item.price)
                })),
                customer
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.approvalUrl || !payload.paypalOrderId) {
            throw new Error(payload?.error?.message || "Impossible de lancer PayPal.");
        }

        return payload;
    }

    async function createStripeBackendSession(items, customer) {
        const response = await fetch(`${shopConfig.backend.baseUrl}/api/checkout/stripe/session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                cart: items.map((item) => ({
                    id: item.id,
                    quantity: 1,
                    name: item.name,
                    category: item.category,
                    image: item.image,
                    size: item.size,
                    price: item.price,
                    unitAmount: parsePrice(item.price)
                })),
                customer
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.checkoutUrl || !payload.stripeSessionId) {
            throw new Error(payload?.error?.message || "Impossible de lancer Stripe.");
        }

        return payload;
    }

    function savePendingPayPalOrder(order) {
        localStorage.setItem(PAYPAL_PENDING_STORAGE_KEY, JSON.stringify(order));
    }

    function loadPendingPayPalOrder() {
        try {
            const saved = localStorage.getItem(PAYPAL_PENDING_STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            return null;
        }
    }

    function clearPendingPayPalOrder() {
        localStorage.removeItem(PAYPAL_PENDING_STORAGE_KEY);
    }

    function savePendingStripeSession(session) {
        localStorage.setItem(STRIPE_PENDING_STORAGE_KEY, JSON.stringify(session));
    }

    function loadPendingStripeSession() {
        try {
            const saved = localStorage.getItem(STRIPE_PENDING_STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            return null;
        }
    }

    function clearPendingStripeSession() {
        localStorage.removeItem(STRIPE_PENDING_STORAGE_KEY);
    }

    function createOrder(items, customer, paymentMethod) {
        const now = new Date();
        const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
        const orderNumber = `CMD-${stamp}`;
        const invoiceNumber = `${shopConfig.documents.invoicePrefix}-${stamp}`;
        const normalizedItems = items.map((item) => ({
            ...item,
            unitAmount: parsePrice(item.price)
        }));
        const totalAmount = normalizedItems.reduce((sum, item) => sum + item.unitAmount, 0);

        return {
            createdAt: now.toISOString(),
            createdAtLabel: now.toLocaleString("fr-FR"),
            orderNumber,
            invoiceNumber,
            seller: shopConfig.seller,
            customer,
            items: normalizedItems,
            totalAmount,
            paymentMethod
        };
    }

    function buildPaymentUrl(order) {
        const method = order.paymentMethod;
        if (!method.checkoutUrl) return "";

        if (method.id === "paypal" && /paypal\.me/i.test(method.checkoutUrl)) {
            const baseUrl = method.checkoutUrl.replace(/\/+$/, "");
            return `${baseUrl}/${order.totalAmount.toFixed(2)}EUR`;
        }

        return appendPaymentMetadata(method.checkoutUrl, order);
    }

    function appendPaymentMetadata(url, order) {
        try {
            const paymentUrl = new URL(url);
            paymentUrl.searchParams.set("order_number", order.orderNumber);
            paymentUrl.searchParams.set("invoice_number", order.invoiceNumber);
            paymentUrl.searchParams.set("amount", order.totalAmount.toFixed(2));
            paymentUrl.searchParams.set("currency", "EUR");
            paymentUrl.searchParams.set("customer_email", order.customer.email);
            paymentUrl.searchParams.set("customer_name", `${order.customer.firstName} ${order.customer.lastName}`.trim());
            return paymentUrl.toString();
        } catch (error) {
            return url;
        }
    }

    function hasAutomatedEmailDelivery() {
        return shopConfig.emailDelivery.provider === "emailjs"
            && shopConfig.emailDelivery.publicKey
            && shopConfig.emailDelivery.serviceId
            && shopConfig.emailDelivery.templates.clientSummary
            && shopConfig.emailDelivery.templates.clientInvoice
            && shopConfig.emailDelivery.templates.sellerInvoice;
    }

    async function sendOrderEmails(order) {
        if (!hasAutomatedEmailDelivery()) {
            return { automated: false };
        }

        const invoiceHtml = buildInvoiceDocument(order);
        const summaryText = buildClientSummaryText(order);
        const invoiceText = buildClientInvoiceText(order);
        const sellerText = buildSellerInvoiceText(order);

        await Promise.all([
            sendEmailViaEmailJs(shopConfig.emailDelivery.templates.clientSummary, {
                to_email: order.customer.email,
                to_name: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
                subject: `${order.orderNumber} - Récapitulatif de commande`,
                message: summaryText,
                order_number: order.orderNumber,
                invoice_number: order.invoiceNumber,
                payment_method: order.paymentMethod.label,
                total_amount: formatPrice(order.totalAmount),
                invoice_html: invoiceHtml
            }),
            sendEmailViaEmailJs(shopConfig.emailDelivery.templates.clientInvoice, {
                to_email: order.customer.email,
                to_name: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
                subject: `${order.invoiceNumber} - Votre facture`,
                message: invoiceText,
                order_number: order.orderNumber,
                invoice_number: order.invoiceNumber,
                total_amount: formatPrice(order.totalAmount),
                invoice_html: invoiceHtml
            }),
            sendEmailViaEmailJs(shopConfig.emailDelivery.templates.sellerInvoice, {
                to_email: order.seller.email,
                to_name: order.seller.brandName,
                subject: `${order.invoiceNumber} - Facture vendeur`,
                message: sellerText,
                order_number: order.orderNumber,
                invoice_number: order.invoiceNumber,
                total_amount: formatPrice(order.totalAmount),
                payment_method: order.paymentMethod.label,
                invoice_html: invoiceHtml
            })
        ]);

        return { automated: true };
    }

    async function sendSingleEmail(kind, order) {
        if (!order) return;
        if (!hasAutomatedEmailDelivery()) {
            checkoutElements.successText.textContent = "EmailJS n'est pas encore configuré. Les boutons de renvoi nécessitent les identifiants dans assets/js/checkout-config.js.";
            return;
        }

        const invoiceHtml = buildInvoiceDocument(order);

        try {
            if (kind === "clientSummary") {
                await sendEmailViaEmailJs(shopConfig.emailDelivery.templates.clientSummary, {
                    to_email: order.customer.email,
                    to_name: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
                    subject: `${order.orderNumber} - Récapitulatif de commande`,
                    message: buildClientSummaryText(order),
                    order_number: order.orderNumber,
                    invoice_number: order.invoiceNumber,
                    total_amount: formatPrice(order.totalAmount),
                    payment_method: order.paymentMethod.label,
                    invoice_html: invoiceHtml
                });
                checkoutElements.successText.textContent = "Récapitulatif client renvoyé.";
                return;
            }

            if (kind === "clientInvoice") {
                await sendEmailViaEmailJs(shopConfig.emailDelivery.templates.clientInvoice, {
                    to_email: order.customer.email,
                    to_name: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
                    subject: `${order.invoiceNumber} - Votre facture`,
                    message: buildClientInvoiceText(order),
                    order_number: order.orderNumber,
                    invoice_number: order.invoiceNumber,
                    total_amount: formatPrice(order.totalAmount),
                    invoice_html: invoiceHtml
                });
                checkoutElements.successText.textContent = "Facture client renvoyée.";
                return;
            }

            if (kind === "sellerInvoice") {
                await sendEmailViaEmailJs(shopConfig.emailDelivery.templates.sellerInvoice, {
                    to_email: order.seller.email,
                    to_name: order.seller.brandName,
                    subject: `${order.invoiceNumber} - Facture vendeur`,
                    message: buildSellerInvoiceText(order),
                    order_number: order.orderNumber,
                    invoice_number: order.invoiceNumber,
                    total_amount: formatPrice(order.totalAmount),
                    payment_method: order.paymentMethod.label,
                    invoice_html: invoiceHtml
                });
                checkoutElements.successText.textContent = "Facture vendeur renvoyée.";
            }
        } catch (error) {
            checkoutElements.successText.textContent = "Le renvoi de l'email a échoué. Vérifiez la configuration EmailJS.";
        }
    }

    async function sendEmailViaEmailJs(templateId, templateParams) {
        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                service_id: shopConfig.emailDelivery.serviceId,
                template_id: templateId,
                user_id: shopConfig.emailDelivery.publicKey,
                template_params: templateParams
            })
        });

        if (!response.ok) {
            throw new Error("Envoi EmailJS impossible");
        }
    }

    function buildClientSummaryText(order) {
        const lines = [
            `Bonjour ${order.customer.firstName},`,
            "",
            `Merci pour votre commande chez ${order.seller.brandName}.`,
            `Référence commande : ${order.orderNumber}`,
            `Mode de paiement choisi : ${order.paymentMethod.label}`,
            "",
            "Articles :"
        ];

        order.items.forEach((item) => {
            lines.push(`- ${item.name}${item.size ? ` (taille ${item.size})` : ""} : ${formatPrice(item.unitAmount)}`);
        });

        lines.push("");
        lines.push(`Total : ${formatPrice(order.totalAmount)}`);
        lines.push("");
        lines.push("Votre facture est envoyée séparément.");
        return lines.join("\n");
    }

    function buildClientInvoiceText(order) {
        return [
            `Bonjour ${order.customer.firstName},`,
            "",
            `Veuillez trouver votre facture ${order.invoiceNumber} pour la commande ${order.orderNumber}.`,
            `Montant total : ${formatPrice(order.totalAmount)}`,
            `Paiement : ${order.paymentMethod.label}`,
            "",
            "Le détail de la facture est inclus dans le template email."
        ].join("\n");
    }

    function buildSellerInvoiceText(order) {
        const lines = [
            `Bonjour,`,
            "",
            `Nouvelle commande : ${order.orderNumber}`,
            `Facture : ${order.invoiceNumber}`,
            `Date : ${order.createdAtLabel}`,
            `Paiement : ${order.paymentMethod.label}`,
            "",
            `Client : ${order.customer.firstName} ${order.customer.lastName}`,
            `Email : ${order.customer.email}`,
            `Téléphone : ${order.customer.phone}`,
            `Adresse : ${order.customer.addressLine1}, ${order.customer.postalCode} ${order.customer.city}`,
            "",
            "Articles :"
        ];

        order.items.forEach((item) => {
            lines.push(`- ${item.name}${item.size ? ` - taille ${item.size}` : ""} (${item.category || "collection"}) : ${formatPrice(item.unitAmount)}`);
        });

        lines.push("");
        lines.push(`Total : ${formatPrice(order.totalAmount)}`);
        return lines.join("\n");
    }

    function buildDocumentShell(title, bodyMarkup) {
        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        body { margin: 0; background: #f7f3eb; color: #1b1711; font-family: Georgia, "Times New Roman", serif; }
        .document { max-width: 960px; margin: 0 auto; padding: 48px 28px 60px; background: #fffdf8; }
        .document__header, .document__meta, .document__footer { display: flex; justify-content: space-between; gap: 24px; }
        .document__header { padding-bottom: 24px; border-bottom: 2px solid #d7bd8b; }
        .document h1, .document h2, .document h3 { margin: 0 0 12px; font-family: "Times New Roman", Georgia, serif; letter-spacing: 0.04em; text-transform: uppercase; }
        .document p, .document td, .document th { font-size: 15px; line-height: 1.5; }
        .document__meta, .document__sections { margin-top: 28px; }
        .document__box { flex: 1; padding: 18px; border: 1px solid #e3d4b7; background: #fff; }
        table { width: 100%; border-collapse: collapse; margin-top: 22px; }
        th, td { padding: 12px 10px; border-bottom: 1px solid #eadfcb; text-align: left; }
        th:last-child, td:last-child { text-align: right; }
        .document__totals { width: min(360px, 100%); margin-left: auto; margin-top: 18px; }
        .document__totals div { display: flex; justify-content: space-between; padding: 8px 0; }
        .document__totals strong { font-size: 18px; }
        .document__footer { margin-top: 40px; padding-top: 22px; border-top: 1px solid #e3d4b7; color: #6f5f43; font-size: 13px; }
    </style>
</head>
<body>
    ${bodyMarkup}
</body>
</html>`;
    }

    function buildInvoiceDocument(order) {
        const itemsMarkup = order.items.map((item) => `
            <tr>
                <td>${escapeHtml(item.name)}${item.size ? `<br><small>Taille : ${escapeHtml(item.size)}</small>` : ""}</td>
                <td>1</td>
                <td>${escapeHtml(formatPrice(item.unitAmount))}</td>
                <td>${escapeHtml(formatPrice(item.unitAmount))}</td>
            </tr>
        `).join("");

        return buildDocumentShell(
            `${order.invoiceNumber} - Facture`,
            `
            <main class="document">
                <header class="document__header">
                    <div>
                        <h1>Facture</h1>
                        <p><strong>${escapeHtml(order.seller.brandName)}</strong></p>
                        <p>${escapeHtml(order.seller.addressLine1)}</p>
                        <p>${escapeHtml(`${order.seller.postalCode} ${order.seller.city}`.trim())}</p>
                        <p>${escapeHtml(order.seller.country)}</p>
                    </div>
                    <div>
                        <p><strong>Facture n°</strong> ${escapeHtml(order.invoiceNumber)}</p>
                        <p><strong>Commande</strong> ${escapeHtml(order.orderNumber)}</p>
                        <p><strong>Date</strong> ${escapeHtml(order.createdAtLabel)}</p>
                    </div>
                </header>
                <section class="document__meta">
                    <div class="document__box">
                        <h2>Facturé à</h2>
                        <p>${escapeHtml(`${order.customer.firstName} ${order.customer.lastName}`)}</p>
                        <p>${escapeHtml(order.customer.addressLine1)}</p>
                        <p>${escapeHtml(`${order.customer.postalCode} ${order.customer.city}`)}</p>
                        <p>${escapeHtml(order.customer.email)}</p>
                    </div>
                    <div class="document__box">
                        <h2>Informations vendeur</h2>
                        <p>Email : ${escapeHtml(order.seller.email)}</p>
                        <p>Téléphone : ${escapeHtml(order.seller.phone)}</p>
                        ${order.seller.siret ? `<p>SIRET : ${escapeHtml(order.seller.siret)}</p>` : ""}
                        ${order.seller.vatNumber ? `<p>TVA : ${escapeHtml(order.seller.vatNumber)}</p>` : ""}
                    </div>
                </section>
                <section class="document__sections">
                    <table>
                        <thead>
                            <tr>
                                <th>Désignation</th>
                                <th>Qté</th>
                                <th>Prix unitaire</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>${itemsMarkup}</tbody>
                    </table>
                    <div class="document__totals">
                        <div><span>Sous-total</span><span>${escapeHtml(formatPrice(order.totalAmount))}</span></div>
                        <div><span>Total</span><strong>${escapeHtml(formatPrice(order.totalAmount))}</strong></div>
                    </div>
                </section>
                <footer class="document__footer">
                    <p>Méthode de paiement sélectionnée : ${escapeHtml(order.paymentMethod.label)}</p>
                    <p>Facture générée automatiquement depuis le panier du site.</p>
                </footer>
            </main>
            `
        );
    }

    function downloadDocument(filename, content) {
        const blob = new Blob([content], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function showCheckoutReturnBanner(type, message) {
        const existing = document.querySelector("[data-checkout-return-banner]");
        if (existing) existing.remove();

        const banner = document.createElement("div");
        banner.dataset.checkoutReturnBanner = "true";
        banner.style.position = "fixed";
        banner.style.left = "16px";
        banner.style.right = "16px";
        banner.style.bottom = "16px";
        banner.style.zIndex = "9999";
        banner.style.padding = "16px 18px";
        banner.style.borderRadius = "16px";
        banner.style.boxShadow = "0 18px 40px rgba(0,0,0,0.18)";
        banner.style.background = type === "success" ? "#173f35" : "#6c1f1f";
        banner.style.color = "#fff";
        banner.style.fontSize = "15px";
        banner.style.lineHeight = "1.5";
        banner.style.opacity = "1";
        banner.style.transition = "opacity 260ms ease, transform 260ms ease";
        banner.innerHTML = `
            <strong style="display:block;margin-bottom:4px;">${type === "success" ? "Paiement confirmé" : "Paiement annulé"}</strong>
            <span>${escapeHtml(message)}</span>
        `;

        document.body.appendChild(banner);

        window.setTimeout(() => {
            banner.style.opacity = "0";
            banner.style.transform = "translateY(10px)";

            window.setTimeout(() => {
                banner.remove();
            }, 260);
        }, 4500);
    }

    async function handlePaymentReturn() {
        const url = new URL(window.location.href);
        const payment = clean(url.searchParams.get("payment"));
        const provider = clean(url.searchParams.get("provider"));
        if (!payment) return;

        const orderNumber = clean(url.searchParams.get("order"));
        const paypalOrderId = clean(url.searchParams.get("token"));
        const pendingOrder = provider === "stripe" ? loadPendingStripeSession() : loadPendingPayPalOrder();

        if (payment === "cancel") {
            showCheckoutReturnBanner("error", `Le paiement ${provider === "stripe" ? "Stripe" : "PayPal"} a été annulé. Ton panier est resté intact.`);
            cleanupPaymentUrl(url);
            return;
        }

        if (provider === "stripe") {
            await handleStripeReturn(url, pendingOrder);
            return;
        }

        if (payment !== "success" || !paypalOrderId) {
            cleanupPaymentUrl(url);
            return;
        }

        if (pendingOrder?.paypalOrderId && pendingOrder.paypalOrderId !== paypalOrderId) {
            showCheckoutReturnBanner("error", "Le paiement retourné ne correspond pas à la commande en attente.");
            cleanupPaymentUrl(url);
            return;
        }

        try {
            const response = await fetch(`${shopConfig.backend.baseUrl}/api/checkout/paypal/order/${encodeURIComponent(paypalOrderId)}/capture`, {
                method: "POST"
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(payload?.error?.message || "La capture du paiement a échoué.");
            }

            clearPendingPayPalOrder();
            saveCart([]);
            renderCart();
            showCheckoutReturnBanner("success", `Commande ${payload.orderNumber || orderNumber} confirmée.`);
        } catch (error) {
            showCheckoutReturnBanner("error", error.message || "La confirmation du paiement PayPal a échoué.");
        } finally {
            cleanupPaymentUrl(url);
        }
    }

    async function handleStripeReturn(url, pendingSession) {
        const sessionId = clean(url.searchParams.get("session_id"));
        const orderNumber = clean(url.searchParams.get("order"));

        if (!sessionId) {
            cleanupPaymentUrl(url);
            return;
        }

        if (pendingSession?.stripeSessionId && pendingSession.stripeSessionId !== sessionId) {
            showCheckoutReturnBanner("error", "La session Stripe retournée ne correspond pas à la commande en attente.");
            cleanupPaymentUrl(url);
            return;
        }

        try {
            const response = await fetch(`${shopConfig.backend.baseUrl}/api/checkout/stripe/session/${encodeURIComponent(sessionId)}`);
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(payload?.error?.message || "Impossible de verifier le paiement Stripe.");
            }

            if (payload.paymentStatus === "paid") {
                clearPendingStripeSession();
                saveCart([]);
                renderCart();
                showCheckoutReturnBanner("success", `Commande ${payload.orderNumber || orderNumber} confirmée via Stripe.`);
            } else {
                showCheckoutReturnBanner("success", `La session Stripe ${payload.orderNumber || orderNumber} est revenue avec le statut ${payload.paymentStatus || payload.status}. Le webhook finalisera la commande dès confirmation.`);
            }
        } catch (error) {
            showCheckoutReturnBanner("error", error.message || "La vérification du paiement Stripe a échoué.");
        } finally {
            cleanupPaymentUrl(url);
        }
    }

    function cleanupPaymentUrl(url) {
        url.searchParams.delete("payment");
        url.searchParams.delete("order");
        url.searchParams.delete("provider");
        url.searchParams.delete("session_id");
        url.searchParams.delete("token");
        url.searchParams.delete("PayerID");
        window.history.replaceState({}, "", url.toString());
    }

    setupCart();
    setupCheckout();
    enableImageFallbacks();
    handlePaymentReturn();

    fetch(cacheSafeSourceUrl)
        .then((response) => {
            if (!response.ok) throw new Error("Source produits indisponible");
            return response.text();
        })
        .then((text) => {
            const products = parseCsv(text);
            if (!products.length) throw new Error("Aucun produit dans la source");
            renderCatalog(products);
            renderSelection(products);
            renderProductDetail(products);
        })
        .catch(() => {
            renderCatalog([]);
            renderSelection([]);
            renderProductDetail([]);
        })
        .finally(enableGallery);
})();
