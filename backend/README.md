# Backend paiements

Ce backend remplace la logique actuelle `paypal.me` par un flux serveur propre :

- création de commande côté serveur
- recalcul du total depuis le catalogue
- création de l'ordre PayPal via l'API Orders v2
- capture du paiement côté serveur
- retour vers le site
- génération de facture HTML
- envoi des emails client/vendeur après paiement
- traitement des webhooks PayPal

## Lancer le backend

Le backend n'a pas de dépendances npm externes. Il nécessite seulement Node 18+.

```bash
node ./backend/src/server.mjs
```

Ou depuis le dossier `backend` :

```bash
node ./src/server.mjs
```

## Variables d'environnement

Copier `backend/.env.example` vers `backend/.env` et renseigner au minimum :

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `SITE_BASE_URL`
- `APP_BASE_URL`
- `SELLER_EMAIL`

Pour les emails :

- `EMAIL_MODE=log` : aucun envoi réel, les emails sont journalisés
- `EMAIL_PROVIDER=resend` : envoi réel via l'API Resend si `RESEND_API_KEY` est défini

## Endpoints principaux

- `GET /api/health`
- `POST /api/checkout/paypal/order`
- `POST /api/checkout/paypal/order/:paypalOrderId/capture`
- `POST /api/paypal/webhooks`
- `GET /api/orders/:orderNumber`
- `GET /payment/success`
- `GET /payment/cancel`

## Intégration front recommandée

Le front ne doit plus construire l'URL de paiement lui-même.

Flux recommandé :

1. le panier envoie `cart + customer` à `POST /api/checkout/paypal/order`
2. le backend crée l'ordre PayPal
3. le front ouvre PayPal :
   - soit avec le bouton PayPal JS SDK
   - soit avec `approvalUrl` en redirection de secours
4. après approbation, le front appelle `POST /api/checkout/paypal/order/:paypalOrderId/capture`
5. le backend marque la commande payée, génère la facture et envoie les emails
6. le webhook PayPal sécurise la synchronisation finale

## Stockage

Les commandes sont conservées dans `backend/data/orders.json`.

Pour une vraie mise en production long terme, remplace ce stockage fichier par une base SQL. La structure métier a déjà été isolée pour faciliter ce remplacement.
