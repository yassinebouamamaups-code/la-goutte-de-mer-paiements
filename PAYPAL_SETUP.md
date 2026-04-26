# Configuration PayPal et backend

## Ce qu'il faut changer dans l'architecture

Le site actuel prépare une commande côté navigateur puis redirige vers `paypal.me`. Cette approche ne permet pas de garantir proprement :

- le retour client après paiement
- la preuve serveur que le paiement est bien capturé
- le déclenchement fiable des emails et de la facture
- la synchro vendeur en cas de fermeture de fenêtre ou d'échec côté navigateur

La base propre est maintenant :

1. le front envoie le panier au backend
2. le backend recalcul le montant
3. le backend crée l'ordre PayPal
4. PayPal redirige ou approuve
5. le backend capture le paiement
6. le backend génère la facture et envoie les emails
7. le webhook PayPal confirme l'état final

## Configuration du profil développeur PayPal

1. Ouvre [developer.paypal.com](https://developer.paypal.com/).
2. Connecte-toi avec ton compte PayPal.
3. Va dans `Testing Tools > Sandbox Accounts`.
4. Vérifie que tu as :
   - un compte `Business` pour simuler le vendeur
   - un compte `Personal` pour simuler l'acheteur
5. Va dans `Apps & Credentials`.
6. Dans la section `Sandbox`, crée une app REST.
7. Récupère :
   - `Client ID`
   - `Client Secret`
8. Dans l'app, configure un webhook qui pointe vers :
   - `https://ton-backend/api/paypal/webhooks`
9. Abonne au minimum le webhook à :
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `CHECKOUT.ORDER.APPROVED`
   - `CHECKOUT.ORDER.COMPLETED` si proposé sur ton tableau de bord
10. Copie aussi le `Webhook ID` dans ton `.env`.

## Variables à renseigner dans le backend

Dans [backend/.env.example](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/.env.example), copie vers `.env` puis renseigne :

- `PAYPAL_ENV=sandbox`
- `PAYPAL_CLIENT_ID=...`
- `PAYPAL_CLIENT_SECRET=...`
- `PAYPAL_WEBHOOK_ID=...`
- `APP_BASE_URL=https://api.ton-domaine.fr`
- `SITE_BASE_URL=https://www.ton-site.fr`

Puis les infos vendeur :

- `SELLER_EMAIL`
- `SELLER_PHONE`
- `SELLER_ADDRESS_LINE1`
- `SELLER_CITY`
- `SELLER_POSTAL_CODE`
- `SELLER_SIRET` si applicable
- `SELLER_VAT_NUMBER` si applicable

## Backend généré dans ce repo

Le backend est dans [backend/src/server.mjs](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/src/server.mjs).

Modules principaux :

- [config.mjs](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/src/config.mjs) : configuration `.env`
- [paypal.mjs](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/src/lib/paypal.mjs) : OAuth, création ordre, capture, vérification webhook
- [catalog.mjs](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/src/lib/catalog.mjs) : recalcul du prix depuis le catalogue
- [order-service.mjs](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/src/lib/order-service.mjs) : logique métier commande
- [invoice.mjs](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/src/lib/invoice.mjs) : génération facture HTML
- [mailer.mjs](C:/Users/yass-/OneDrive/Documents/La goutte de mer - paiments/backend/src/lib/mailer.mjs) : emails client/vendeur

## Flux recommandé côté front

1. `POST /api/checkout/paypal/order`
   - body :

```json
{
  "cart": [
    { "id": "SKU-001", "quantity": 1 },
    { "id": "SKU-002", "quantity": 1 }
  ],
  "customer": {
    "firstName": "Yassine",
    "lastName": "Bouamama",
    "email": "client@example.com",
    "phone": "+33600000000",
    "addressLine1": "12 rue Exemple",
    "postalCode": "31000",
    "city": "Toulouse"
  }
}
```

2. le backend retourne :

```json
{
  "orderNumber": "CMD-...",
  "invoiceNumber": "FAC-...",
  "paypalOrderId": "5O190127TN364715T",
  "approvalUrl": "https://www.sandbox.paypal.com/checkoutnow?...",
  "totalAmount": 39.9
}
```

3. le front ouvre PayPal
4. après validation PayPal, le front appelle :
   - `POST /api/checkout/paypal/order/:paypalOrderId/capture`
5. le backend :
   - capture
   - stocke la commande payée
   - génère la facture
   - envoie le récap client
   - envoie la facture client
   - envoie la notification vendeur

## Important pour la robustesse

- le montant doit être recalculé côté serveur
- l'envoi des emails doit partir du backend, pas du navigateur
- le webhook PayPal doit être vérifié
- l'ordre PayPal et la commande interne doivent être corrélés avec `orderNumber` et `invoiceNumber`
- la page de retour client ne doit jamais être la seule source de vérité

## Sources officielles utiles

- Sandbox testing guide : [developer.paypal.com/tools/sandbox](https://developer.paypal.com/tools/sandbox/)
- Sandbox accounts : [developer.paypal.com/api/rest/sandbox/accounts/](https://developer.paypal.com/api/rest/sandbox/accounts/)
- Get started checkout standard : [developer.paypal.com/studio/checkout/standard/getstarted?backend=node](https://developer.paypal.com/studio/checkout/standard/getstarted?backend=node)
- Orders API use cases : [developer.paypal.com/api/rest/integration/orders-api/api-use-cases/standard/](https://developer.paypal.com/api/rest/integration/orders-api/api-use-cases/standard/)
- JavaScript SDK : [developer.paypal.com/sdk/js/](https://developer.paypal.com/sdk/js/)
- Webhooks overview : [developer.paypal.com/api/rest/webhooks/](https://developer.paypal.com/api/rest/webhooks/)
- Verify webhook signature : [developer.paypal.com/docs/api/webhooks/v1/](https://developer.paypal.com/docs/api/webhooks/v1/)
