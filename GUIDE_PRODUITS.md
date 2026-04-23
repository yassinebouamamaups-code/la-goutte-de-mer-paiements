# Gestion des articles

Les pages `hommes.html`, `femmes.html` et `accessoires.html` affichent maintenant les articles depuis un fichier CSV.

## Option simple : Excel

1. Ouvre ou modifie le fichier `assets/data/products.csv`.
2. Garde exactement ces colonnes :

```csv
id,categorie,nom,prix,promo,selection_moment,description,photos,statut
```

3. Valeurs attendues :

- `categorie` : `hommes`, `femmes` ou `accessoires`
- `prix` : prix normal
- `promo` : nouveau prix promotionnel, laisse vide s'il n'y a pas de promo
- `selection_moment` : mets `oui` pour afficher l'article sur l'accueil, laisse vide sinon
- `photos` : une ou plusieurs photos séparées par `;` ou `|`
- `statut` : par exemple `disponible`, `réservé`, `vendu`

Exemple :

```csv
hom-003,hommes,Veste bleu marine,"95,00 €","75,00 €",oui,"Veste vintage en très bon état.","assets/images/veste-1.jpg; assets/images/veste-2.jpg",disponible
```

Si `promo` est rempli, le site affiche le prix initial barré et le prix promo à côté. Si `promo` est vide, seul le prix initial est affiché.

## Option Google Sheets

1. Crée une feuille Google Sheets avec les mêmes colonnes.
2. Va dans `Fichier > Partager > Publier sur le web`.
3. Choisis le format `CSV`.
4. Copie l'URL publiée.
5. Dans chaque page catégorie, remplace :

```html
window.PRODUCTS_SOURCE_URL = "assets/data/products.csv";
```

par :

```html
window.PRODUCTS_SOURCE_URL = "https://docs.google.com/spreadsheets/d/e/TON_URL/pub?output=csv";
```

## Photos

Tu peux utiliser :

- des images locales dans `assets/images/`
- des URLs publiques d'images
- plusieurs photos avec `;` ou `|`

Exemple :

```csv
photos
assets/images/sac-1.jpg; assets/images/sac-2.jpg; https://example.com/sac-3.jpg
```

Les miniatures apparaissent sous la photo principale et permettent de changer l'image affichée.
