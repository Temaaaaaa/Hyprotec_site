const KEY = "cookie:consent";
const DAYS = 180;

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

    return value;
  } catch {
    return null;
  }
}

function enableDeferredScripts(type = "analytics") {
  document
    .querySelectorAll(`script[type="text/plain"][data-consent="${type}"]`)
    .forEach((tpl) => {
      const script = document.createElement("script");

      for (const attr of tpl.attributes) {
        if (attr.name === "type" || attr.name === "data-consent") continue;
        script.setAttribute(attr.name, attr.value);
      }

      if (tpl.textContent?.trim()) {
        script.text = tpl.textContent;
      }

      tpl.replaceWith(script);
    });
}

function loadAnalytics() {
  enableDeferredScripts("analytics");
  import("./yandex-metrika.js");
}

function createBanner() {
  let banner = document.getElementById("cookie-banner");

  if (!banner) {
    banner = document.createElement("div");
    banner.className = "cookie";
    banner.id = "cookie-banner";
    banner.hidden = true;
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "true");
    banner.setAttribute("aria-labelledby", "cookie-title");
    banner.innerHTML = `
      <div class="cookie__inner container">
        <div class="cookie__text">
          <strong id="cookie-title" class="cookie__title">Мы используем cookie</strong>
          <p class="cookie__desc">
            Аналитические cookie Яндекс.Метрики включаются только с вашего согласия.
            <a href="/cookies/" class="cookie__link">Подробнее</a>
          </p>
        </div>
        <div class="cookie__actions">
          <button type="button" class="cookie__btn" data-js-cookie-decline>Только необходимые</button>
          <button type="button" class="cookie__btn cookie__btn--primary" data-js-cookie-accept>Согласен</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
  }

  return banner;
}

export default function initCookieConsent() {
  const banner = createBanner();
  const prev = getConsent();

  if (prev === "accepted") {
    loadAnalytics();
    return;
  }

  if (prev === "declined") {
    return;
  }

  const show = () => {
    banner.hidden = false;
    requestAnimationFrame(() => banner.classList.add("is-visible"));
  };

  const close = () => {
    banner.classList.remove("is-visible");
    setTimeout(() => {
      banner.hidden = true;
    }, 220);
  };

  banner.querySelector("[data-js-cookie-accept]")?.addEventListener("click", () => {
    setConsent("accepted");
    loadAnalytics();
    close();
  });

  banner.querySelector("[data-js-cookie-decline]")?.addEventListener("click", () => {
    setConsent("declined");
    close();
  });

  banner.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setConsent("declined");
      close();
    }
  });

  show();
}
