import Intro from './Preloader.js';
import Header from './Header.js';
import Carousel from './Carousel.js';
import Stats from './Stats.js';
import { initHeroType } from './HeroType.js';
import initCookieConsent from './CookieConsent.js';
import { initTcoBars } from './tco-bars.js';

new Intro();
new Header();
initCookieConsent();
initTcoBars();

const initCarousels = () => {
    const nodes = document.querySelectorAll('[data-js-carousel]');
    nodes.forEach((el) => {
        const autoplay = el.getAttribute('data-autoplay') === 'true';
        const interval = Number(el.getAttribute('data-interval')) || 4500;
        new Carousel(el, { autoplay, interval });
    });
};

const initHeroSubtitles = () => {
    const heroNodes = document.querySelectorAll('.hero__subtitle--type');
    if (!heroNodes.length) {
        return;
    }

    heroNodes.forEach((el) => {
        const length = el.textContent.trim().length;
        el.style.setProperty('--type-chars', length.toString());
    });

    initHeroType('.hero__subtitle--type', {
        typeDelay: 55,
        eraseDelay: 35,
        holdDelay: 1300,
        gapDelay: 350,
    });
};

const initStats = () => {
    if (!document.querySelector('#lab-stats')) {
        return;
    }

    const stats = new Stats('#lab-stats', { threshold: 0.3, once: true });
    stats.init();
};

const initOfferingAccordion = () => {
    const root = document.querySelector('[data-js-offering]');
    if (!root) {
        return;
    }

    const allowMultiple = root.dataset.multiple === 'true';
    const items = Array.from(root.querySelectorAll('.offering__item'))
        .map((item) => {
            const header = item.querySelector('.offering__header');
            const panel = item.querySelector('.offering__panel');
            const content = item.querySelector('.offering__content');

            if (!header || !panel || !content) {
                return null;
            }

            return {
                item,
                header,
                panel,
                content,
            };
        })
        .filter(Boolean);

    if (!items.length) {
        return;
    }

    const setExpandedState = (entry, expanded) => {
        entry.header.setAttribute('aria-expanded', String(expanded));
        entry.panel.setAttribute('aria-hidden', String(!expanded));
        entry.item.classList.toggle('is-open', expanded);
    };

    const expand = (entry) => {
        const { panel, content } = entry;
        panel.style.height = '0px';
        requestAnimationFrame(() => {
            panel.style.height = `${content.scrollHeight}px`;
        });
        panel.addEventListener(
            'transitionend',
            (event) => {
                if (event.propertyName === 'height') {
                    panel.style.height = 'auto';
                }
            },
            { once: true },
        );
        setExpandedState(entry, true);
    };

    const collapse = (entry) => {
        const { panel, content } = entry;
        panel.style.height = `${content.scrollHeight}px`;
        requestAnimationFrame(() => {
            panel.style.height = '0px';
        });
        setExpandedState(entry, false);
    };

    items.forEach((entry) => {
        entry.panel.style.height = '0px';
        setExpandedState(entry, false);
    });

    root.addEventListener('click', (event) => {
        const header = event.target.closest('.offering__header');
        if (!header) {
            return;
        }

        const entry = items.find((item) => item.header === header);
        if (!entry) {
            return;
        }

        const isOpen = entry.item.classList.contains('is-open');
        if (isOpen) {
            collapse(entry);
            return;
        }

        if (!allowMultiple) {
            items.forEach((item) => {
                if (item !== entry && item.item.classList.contains('is-open')) {
                    collapse(item);
                }
            });
        }

        expand(entry);
    });
};

const initOnReady = () => {
    initCarousels();
    initHeroSubtitles();
    initStats();
    initOfferingAccordion();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnReady, { once: true });
} else {
    initOnReady();
}
