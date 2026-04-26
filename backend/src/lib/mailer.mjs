import { config } from "../config.mjs";
import { formatPrice } from "./invoice.mjs";

export async function sendOrderEmails(order, invoice) {
  const clientName = `${order.customer.firstName} ${order.customer.lastName}`.trim();
  const clientSubject = `${order.orderNumber} - Récapitulatif de commande`;
  const invoiceSubject = `${order.invoiceNumber} - Votre facture`;
  const sellerSubject = `${order.invoiceNumber} - Nouvelle commande réglée`;

  await sendEmail({
    to: order.customer.email,
    subject: clientSubject,
    html: wrapEmail(`
      <p>Bonjour ${escapeHtml(order.customer.firstName)},</p>
      <p>Merci pour votre commande chez ${escapeHtml(config.seller.brandName)}.</p>
      <p>Commande : <strong>${escapeHtml(order.orderNumber)}</strong><br>Montant : <strong>${escapeHtml(formatPrice(order.totalAmount))}</strong></p>
      ${buildItemsList(order)}
      <p>Votre facture est envoyée dans un second email.</p>
    `),
    replyTo: config.seller.email,
    debugLabel: `client-summary:${clientName}`
  });

  await sendEmail({
    to: order.customer.email,
    subject: invoiceSubject,
    html: invoice.html,
    replyTo: config.seller.email,
    debugLabel: `client-invoice:${clientName}`
  });

  await sendEmail({
    to: config.email.clientNotificationEmail || config.seller.email,
    subject: sellerSubject,
    html: wrapEmail(`
      <p>Nouvelle commande payée.</p>
      <p>Commande : <strong>${escapeHtml(order.orderNumber)}</strong><br>Facture : <strong>${escapeHtml(order.invoiceNumber)}</strong></p>
      <p>Client : ${escapeHtml(clientName)}<br>Email : ${escapeHtml(order.customer.email)}<br>Téléphone : ${escapeHtml(order.customer.phone)}</p>
      ${buildItemsList(order)}
      <p>Total : <strong>${escapeHtml(formatPrice(order.totalAmount))}</strong></p>
      <p>Identifiant capture PayPal : ${escapeHtml(order.paypal.captureId || "")}</p>
    `),
    replyTo: order.customer.email,
    debugLabel: "seller-notification"
  });
}

async function sendEmail(message) {
  if (config.email.mode !== "live") {
    console.log("[email:log]", JSON.stringify(message, null, 2));
    return;
  }

  if (config.email.provider === "resend") {
    await sendViaResend(message);
    return;
  }

  throw new Error(`EMAIL_PROVIDER non supporté: ${config.email.provider}`);
}

async function sendViaResend(message) {
  if (!config.email.resendApiKey) {
    throw new Error("RESEND_API_KEY manquant.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.email.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      reply_to: message.replyTo || undefined
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend a refusé l'email: ${body}`);
  }
}

function wrapEmail(content) {
  return `<!DOCTYPE html><html lang="fr"><body style="font-family: Georgia, serif; color: #1f1b15; background: #f6f1e7; margin: 0; padding: 24px;"><div style="max-width: 760px; margin: 0 auto; background: #fffdf8; padding: 32px;">${content}</div></body></html>`;
}

function buildItemsList(order) {
  const rows = order.items.map((item) => `<li>${escapeHtml(item.name)} x${item.quantity} - ${escapeHtml(formatPrice(item.unitAmount * item.quantity))}</li>`).join("");
  return `<ul>${rows}</ul>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
