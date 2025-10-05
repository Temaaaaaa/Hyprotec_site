// ========== Offerings Accordion ==========
class OfferingsAccordion {
    /**
     * @param {HTMLElement} root  контейнер с data-js-accordion
     * @param {Object} options
     * @param {boolean} options.allowMultiple  true — можно раскрывать несколько
     * @param {boolean} options.openByHash     true — открывать из #hash
     */
    constructor(root, { allowMultiple = true, openByHash = true } = {}) {
        this.root = root;
        this.opts = { allowMultiple, openByHash };

        /** @type {HTMLElement[]} */
        this.items = Array.from(this.root.querySelectorAll('.offering'));
        this.buttons = this.items.map((it) => it.querySelector('.offering__button'));
        this.panels  = this.items.map((it) => it.querySelector('.offering__panel'));

        this.ensureIds();
        this.attachEvents();
        if (this.opts.openByHash) this.openFromHash();
    }

    ensureIds() {
        this.items.forEach((item, idx) => {
            const btn = item.querySelector('.offering__button');
            const panel = item.querySelector('.offering__panel');

            // генерим стабильные id, если их нет
            if (!btn.id) btn.id = `offering-btn-${this.uid(idx)}`;
            if (!panel.id) panel.id = `offering-panel-${this.uid(idx)}`;

            // aria-связи + изначально скрыто
            btn.setAttribute('aria-controls', panel.id);
            btn.setAttribute('aria-expanded', 'false');
            panel.setAttribute('role', 'region');
            panel.setAttribute('aria-labelledby', btn.id);
            panel.hidden = true;
        });
    }

    attachEvents() {
        // клики (делегирование)
        this.root.addEventListener('click', (e) => {
            const btn = e.target.closest('.offering__button');
            if (!btn || !this.root.contains(btn)) return;
            e.preventDefault();
            this.toggleByButton(btn);
        });

        // клавиатура: ↑/↓/Home/End между заголовками
        this.root.addEventListener('keydown', (e) => {
            const current = e.target.closest('.offering__button');
            if (!current) return;

            const idx = this.buttons.indexOf(current);
            if (idx === -1) return;

            const focusBtn = (i) => this.buttons[i]?.focus();

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    focusBtn((idx - 1 + this.buttons.length) % this.buttons.length);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    focusBtn((idx + 1) % this.buttons.length);
                    break;
                case 'Home':
                    e.preventDefault();
                    focusBtn(0);
                    break;
                case 'End':
                    e.preventDefault();
                    focusBtn(this.buttons.length - 1);
                    break;
            }
        });

        // изменение hash в адресной строке
        window.addEventListener('hashchange', () => {
            if (this.opts.openByHash) this.openFromHash();
        });
    }

    toggleByButton(btn) {
        const item  = btn.closest('.offering');
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        const willOpen = btn.getAttribute('aria-expanded') !== 'true';

        if (!this.opts.allowMultiple && willOpen) {
            this.items.forEach((it) => {
                if (it === item) return;
                this.closeItem(it);
            });
        }

        willOpen ? this.openItem(item) : this.closeItem(item);
    }

    openItem(item) {
        const btn   = item.querySelector('.offering__button');
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        item.classList.add('is-expanded');
        btn.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
    }

    closeItem(item) {
        const btn   = item.querySelector('.offering__button');
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        item.classList.remove('is-expanded');
        btn.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
    }

    openFromHash() {
        const hash = decodeURIComponent(location.hash.replace('#', ''));
        if (!hash) return;

        // поддержим якорь на кнопке ИЛИ на панели
        const target = document.getElementById(hash);
        if (!target) return;

        const item = target.closest('.offering') ||
            target.closest('.offering__panel')?.closest('.offering');
        if (!item || !this.root.contains(item)) return;

        // открываем и прокручиваем к блоку плавно
        this.openItem(item);
        item.querySelector('.offering__button')?.focus({ preventScroll: true });
        item.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    uid(i) {
        // простой генератор (по индексу и DOM-положению), чтобы id были уникальны
        const pos = this.items.indexOf(this.items[i]);
        return `${pos}-${Math.random().toString(36).slice(2, 7)}`;
    }
}

// Инициализация всех групп аккордеона на странице

export default OfferingsAccordion;