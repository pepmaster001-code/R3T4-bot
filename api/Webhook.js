const TOKEN = "8999927256:AAHrkk76bD-m5TnWUfYp5AQo3f9NJERqIj4";
const OWNER_CHAT_ID = "912919088";
const API = `https://api.telegram.org/bot${TOKEN}`;

// Products catalog
const PRODUCTS = [
  {
    id: "r3t4_starter",
    name: "R3T4 — Starter Pack",
    price: "200€",
    options: null
  }
];

// In-memory session store
const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = { step: "idle", order: {} };
  }
  return sessions[chatId];
}

async function sendMessage(chatId, text, keyboard = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };
  if (keyboard) {
    body.reply_markup = keyboard;
  }
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function notifyOwner(order) {
  const msg = `🛍️ <b>NOUVELLE COMMANDE</b>\n\n` +
    `📦 Produit : ${order.product}\n` +
    `👤 Nom : ${order.name}\n` +
    `📱 Contact : ${order.contact}\n` +
    `📍 Adresse : ${order.address}\n` +
    `💬 Remarques : ${order.notes || "Aucune"}\n\n` +
    `🕐 ${new Date().toLocaleString("fr-FR")}`;
  await sendMessage(OWNER_CHAT_ID, msg);
}

async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text?.trim();
  const session = getSession(chatId);

  // /start command
  if (text === "/start") {
    session.step = "idle";
    session.order = {};
    await sendMessage(chatId,
      `👋 Bienvenue sur la boutique <b>R3T4</b> !\n\nTape /commander pour passer une commande.`
    );
    return;
  }

  // /commander command
  if (text === "/commander") {
    session.step = "choose_product";
    session.order = {};

    const keyboard = {
      inline_keyboard: PRODUCTS.map(p => ([{
        text: `${p.name} — ${p.price}`,
        callback_data: `product_${p.id}`
      }]))
    };

    await sendMessage(chatId, "🛒 <b>Choisis ton produit :</b>", keyboard);
    return;
  }

  // Step: awaiting name
  if (session.step === "await_name") {
    session.order.name = text;
    session.step = "await_contact";
    await sendMessage(chatId, "📱 Ton numéro de téléphone ou Instagram pour te contacter :");
    return;
  }

  // Step: awaiting contact
  if (session.step === "await_contact") {
    session.order.contact = text;
    session.step = "await_address";
    await sendMessage(chatId, "📍 Ton adresse complète de livraison :");
    return;
  }

  // Step: awaiting address
  if (session.step === "await_address") {
    session.order.address = text;
    session.step = "await_notes";
    await sendMessage(chatId, "💬 Des remarques ou précisions ? (tape <i>non</i> si aucune)");
    return;
  }

  // Step: awaiting notes
  if (session.step === "await_notes") {
    session.order.notes = text.toLowerCase() === "non" ? null : text;
    session.step = "confirm";

    const o = session.order;
    const recap = `✅ <b>Récap de ta commande :</b>\n\n` +
      `📦 ${o.product}\n` +
      `👤 ${o.name}\n` +
      `📱 ${o.contact}\n` +
      `📍 ${o.address}\n` +
      `💬 ${o.notes || "Aucune remarque"}\n\n` +
      `Confirmes-tu cette commande ?`;

    const keyboard = {
      inline_keyboard: [[
        { text: "✅ Confirmer", callback_data: "confirm_yes" },
        { text: "❌ Annuler", callback_data: "confirm_no" }
      ]]
    };

    await sendMessage(chatId, recap, keyboard);
    return;
  }

  // Default
  await sendMessage(chatId, "Tape /commander pour passer une commande 🛍️");
}

async function handleCallback(query) {
  const chatId = String(query.message.chat.id);
  const data = query.data;
  const session = getSession(chatId);

  // Answer callback to remove loading spinner
  await fetch(`${API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: query.id })
  });

  // Product selection
  if (data.startsWith("product_")) {
    const productId = data.replace("product_", "");
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    session.order.product = `${product.name} — ${product.price}`;
    session.step = "await_name";
    await sendMessage(chatId, `Super choix ! 🔥\n\nTon <b>nom et prénom</b> pour la commande :`);
    return;
  }

  // Confirm order
  if (data === "confirm_yes") {
    await notifyOwner(session.order);
    session.step = "idle";
    session.order = {};
    await sendMessage(chatId,
      `🎉 <b>Commande confirmée !</b>\n\nOn te recontacte rapidement pour les détails de paiement et livraison. Merci ! 🙏`
    );
    return;
  }

  if (data === "confirm_no") {
    session.step = "idle";
    session.order = {};
    await sendMessage(chatId, "Commande annulée. Tape /commander quand tu veux recommencer.");
    return;
  }
}

// Vercel serverless handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  const update = req.body;

  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (err) {
    console.error("Bot error:", err);
  }

  res.status(200).json({ ok: true });
}
