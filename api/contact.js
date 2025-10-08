// api/contact.js
/**
 * Serverless-эндпоинт для формы обратной связи HYPROTEC.
 * Ожидает JSON от фронта: { name, phone, email, topic, message, agree, company }
 * Шлёт заявку в Telegram. Возвращает { success, message }.
 */

function s(str = "", max = 500) {
    // безопасная обрезка + экранирование для HTML в Telegram
    return String(str)
        .slice(0, max)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res
                .status(405)
                .json({ success: false, message: "Method Not Allowed" });
        }

        // --- Парсинг входа ---
        const body = req.body || (await readJson(req));
        const {
            name = "",
            phone = "",
            email = "",
            topic = "",
            message = "",
            agree = false,
            company = "", // honeypot — должен быть пуст
        } = body || {};

        // --- Антиспам: honeypot ---
        if (company && String(company).trim() !== "") {
            // делаем вид, что всё ок, но ничего не отправляем
            return res
                .status(200)
                .json({ success: true, message: "Спасибо! Мы на связи." });
        }

        // --- Валидация ---
        const hasName = String(name).trim().length >= 1;
        const hasMsg = String(message).trim().length >= 1;
        const hasPhone = String(phone).trim().length >= 10;
        const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
        const contactOk = hasPhone || hasEmail;

        if (!hasName) {
            return res
                .status(422)
                .json({ success: false, message: "Укажите имя." });
        }
        if (!hasMsg) {
            return res
                .status(422)
                .json({ success: false, message: "Опишите ваш вопрос." });
        }
        if (!contactOk) {
            return res.status(422).json({
                success: false,
                message: "Укажите телефон или email — один из вариантов.",
            });
        }
        if (String(agree) !== "true" && agree !== true) {
            return res.status(422).json({
                success: false,
                message: "Нужно согласие на обработку персональных данных.",
            });
        }

        // --- Подготовка сообщения ---
        const SITE = process.env.SITE_NAME || "HYPROTEC";
        const ua = req.headers["user-agent"] || "";
        const ipHeader = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "";
        const ip = Array.isArray(ipHeader)
            ? ipHeader[0]
            : String(ipHeader).split(",")[0]?.trim();

        const lines = [
            `<b>🧾 Заявка с сайта ${s(SITE, 60)}</b>`,
            `— <b>Имя:</b> ${s(name, 120)}`,
            hasPhone ? `— <b>Телефон:</b> ${s(phone, 60)}` : "",
            hasEmail ? `— <b>Email:</b> ${s(email, 120)}` : "",
            topic ? `— <b>Тема:</b> ${s(topic, 120)}` : "",
            `— <b>Сообщение:</b>\n${s(message, 2000)}`,
            "",
            ip ? `<i>IP:</i> ${s(ip, 60)}` : "",
            ua ? `<i>UA:</i> ${s(ua, 200)}` : "",
        ]
            .filter(Boolean)
            .join("\n");

        // --- Отправка в Telegram ---
        const token = process.env.TG_BOT_TOKEN;
        const chatId = process.env.TG_CHAT_ID;

        if (!token || !chatId) {
            console.error("TG env not set");
            return res.status(500).json({
                success: false,
                message: "Сервис временно недоступен. Попробуйте позже.",
            });
        }

        const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
        const tgResp = await fetch(tgUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: lines,
                parse_mode: "HTML",
                disable_web_page_preview: true,
            }),
        });

        if (!tgResp.ok) {
            const errText = await safeText(tgResp);
            console.error("Telegram error:", tgResp.status, errText);
            return res.status(502).json({
                success: false,
                message: "Не удалось отправить. Попробуйте позже.",
            });
        }

        // Успех
        return res
            .status(200)
            .json({ success: true, message: "Заявка отправлена. Спасибо!" });
    } catch (e) {
        console.error("Handler error:", e);
        return res
            .status(500)
            .json({ success: false, message: "Ошибка сервера. Попробуйте позже." });
    }
}

/** Helpers **/
async function readJson(req) {
    if (req.body && typeof req.body === "object") return req.body;
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
        return JSON.parse(raw || "{}");
    } catch {
        return {};
    }
}
async function safeText(resp) {
    try {
        return await resp.text();
    } catch {
        return "<no text>";
    }
}
