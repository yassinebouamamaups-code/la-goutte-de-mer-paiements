# Stripe - Prochaine Etape

Le projet contient maintenant un squelette Stripe base sur Stripe Checkout heberge.

## Ce qui est deja prepare

- option Stripe visible dans le checkout frontend
- endpoint backend `POST /api/checkout/stripe/session`
- endpoint backend `POST /api/stripe/webhooks`
- retour frontend via `session_id`
- route de verification `GET /api/checkout/stripe/session/:sessionId`

## Variables a configurer plus tard

Dans Render pour le backend :

- `STRIPE_ENV=test`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_CURRENCY=eur`

## Webhook Stripe a creer plus tard

URL :

- `https://la-goutte-de-mer-paiements.onrender.com/api/stripe/webhooks`

Evenement minimal recommande pour ce projet :

- `checkout.session.completed`

Sources officielles Stripe :

- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/checkout/sessions/create
