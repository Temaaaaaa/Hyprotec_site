// CookieConsent.js
const KEY = 'cookie:consent';          // 'accepted' | 'declined'
const DAYS = 180;                      // срок хранения выбора, дней

function setConsent(value) {
    try {
        const exp = Date.now() + DAYS * 24 * 60 * 60 * 1000;
        localStorage.setItem(KEY, JSON.stringify({ value, exp }));
    } catch {}
}
function getConsent() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const { value, exp } = JSON.parse(raw);
        if (!value || Date.now() > Number(exp)) {
            localStorage.removeItem(KEY);
            return null;
        }
        return value; // accepted | declined
    } catch { return null; }
}
function clearConsent() {
    try { localStorage.removeItem(KEY); } catch {}
}

/** Включает отложенные скрипты: <script type="text/plain" data-consent="analytics"> ... */
function enableDeferredScripts(type = 'analytics') {
    document.querySelectorAll(`script[type="text/plain"][data-consent="${type}"]`).forEach((tpl) => {
        const s = document.createElement('script');
        for (const attr of tpl.attributes) {
            if (attr.name === 'type' || attr.name === 'data-consent') continue;
            s.setAttribute(attr.name, attr.value);
        }
        if (tpl.textContent?.trim()) s.text = tpl.textContent;
        tpl.replaceWith(s);
    });
}

export default function initCookieConsent() {
    const banner = document.getElementById('cookie-banner');
    const manageBtn = document.querySelector('[data-js-cookie-manage]');
    if (!banner) return;

    const prev = getConsent();
    if (prev === 'accepted') {
        enableDeferredScripts('analytics');
        manageBtn && (manageBtn.hidden = false);
        return;
    }
    if (prev === 'declined') {
        manageBtn && (manageBtn.hidden = false);
        return;
    }

    // показать баннер (нет выбора)
    banner.hidden = false;
    requestAnimationFrame(() => banner.classList.add('is-visible'));

    const acceptBtn = banner.querySelector('[data-js-cookie-accept]');
    const declineBtn = banner.querySelector('[data-js-cookie-decline]');

    const close = () => {
        banner.classList.remove('is-visible');
        setTimeout(() => (banner.hidden = true), 220);
        manageBtn && (manageBtn.hidden = false);
    };

    acceptBtn?.addEventListener('click', () => {
        setConsent('accepted');
        enableDeferredScripts('analytics');
        close();
    });
    declineBtn?.addEventListener('click', () => {
        setConsent('declined');
        close();
    });

    // Esc = «Только необходимые»
    banner.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            setConsent('declined');
            close();
        }
    });

    // Кнопка «Настройки cookie»: сбрасываем выбор и показываем баннер
    manageBtn?.addEventListener('click', () => {
        clearConsent();
        banner.hidden = false;
        requestAnimationFrame(() => banner.classList.add('is-visible'));
    });
}
