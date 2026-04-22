(function () {
    const grid = document.querySelector("[data-products-grid]");
    if (!grid) return;

    const category = grid.dataset.category;
    const status = document.querySelector("[data-products-status]");
    const sourceUrl = window.PRODUCTS_SOURCE_URL || "assets/data/products.csv";
    const cacheSafeSourceUrl = sourceUrl.includes("docs.google.com")
        ? `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}_=${Date.now()}`
        : sourceUrl;
    const fallbackCsv = `id,categorie,nom,prix,description,photos,statut
hom-001,hommes,Veste en laine vintage,"89,00 €","Veste seconde main sélectionnée pour sa coupe et son tombé intemporel.","assets/images/hommes.jpg|assets/images/hero.png",disponible
hom-002,hommes,Manteau classique,"119,00 €","Manteau homme à l'allure sobre, idéal pour une silhouette élégante.","assets/images/hommes.jpg",disponible
fem-001,femmes,Sac en cuir vintage,"129,00 €","Sac en cuir au caractère affirmé, choisi pour sa patine et sa tenue.","assets/images/femmes.png|assets/images/accessoires.png",disponible
fem-002,femmes,Blazer intemporel,"79,00 €","Blazer femme facile à porter, sélectionné pour sa ligne et son élégance.","assets/images/femmes.png|assets/images/hero.png",disponible
acc-001,accessoires,Chaîne plaqué or vintage,"45,00 €","Chaîne dorée vintage, discrète et lumineuse.","assets/images/logo_fripperie2.png|assets/images/accessoires.png",disponible
acc-002,accessoires,Lunettes de caractère,"59,00 €","Accessoire fort pour signer une silhouette avec subtilité.","assets/images/accessoires.png",disponible`;

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
        return rows.map((cells) => {
            const item = {};
            headers.forEach((header, index) => {
                item[header] = (cells[index] || "").trim();
            });
            return item;
        });
    }

    function productCard(product) {
        const photos = (product.photos || "").split("|").map((photo) => photo.trim()).filter(Boolean);
        const mainPhoto = photos[0] || "assets/images/logo_fripperie2.png";
        const thumbnails = photos.slice(0, 4).map((photo, index) => `
            <button class="catalog-card__thumb${index === 0 ? " is-active" : ""}" type="button" data-photo="${photo}" aria-label="Voir la photo ${index + 1}">
                <img src="${photo}" alt="">
            </button>
        `).join("");

        return `
            <article class="catalog-card">
                <div class="catalog-card__media">
                    <img class="catalog-card__image" src="${mainPhoto}" alt="${product.nom}">
                </div>
                ${photos.length > 1 ? `<div class="catalog-card__thumbs">${thumbnails}</div>` : ""}
                <div class="catalog-card__content">
                    <p class="catalog-card__status">${product.statut || "disponible"}</p>
                    <h2>${product.nom}</h2>
                    <p>${product.description}</p>
                    <strong>${product.prix}</strong>
                    <a class="button button--small" href="https://wa.me/33766884222?text=Bonjour,%20je%20souhaite%20des%20informations%20sur%20${encodeURIComponent(product.nom)}." target="_blank" rel="noopener">Demander</a>
                </div>
            </article>
        `;
    }

    function render(products) {
        const filtered = products.filter((product) => product.categorie === category);
        if (!filtered.length) {
            grid.innerHTML = `<p class="catalog-empty">Aucun article disponible pour le moment.</p>`;
            if (status) status.textContent = "0 article";
            return;
        }

        grid.innerHTML = filtered.map(productCard).join("");
        if (status) status.textContent = `${filtered.length} article${filtered.length > 1 ? "s" : ""}`;
    }

    function enableGallery() {
        grid.addEventListener("click", (event) => {
            const thumb = event.target.closest("[data-photo]");
            if (!thumb) return;

            const card = thumb.closest(".catalog-card");
            const image = card.querySelector(".catalog-card__image");
            image.src = thumb.dataset.photo;
            card.querySelectorAll(".catalog-card__thumb").forEach((button) => button.classList.remove("is-active"));
            thumb.classList.add("is-active");
        });
    }

    fetch(cacheSafeSourceUrl)
        .then((response) => {
            if (!response.ok) throw new Error("Source produits indisponible");
            return response.text();
        })
        .then((text) => render(parseCsv(text)))
        .catch(() => render(parseCsv(fallbackCsv)))
        .finally(enableGallery);
})();
