// scripts/modules/Stats.js
export default class Stats {
    /**
     * @param {string|Element} root - селектор или узел секции со статистикой
     * @param {Object} [opts]
     * @param {number} [opts.threshold=0.3] - доля видимости секции для старта
     * @param {boolean} [opts.once=true]    - анимировать только один раз
     */
    constructor(root = '#lab-stats', opts = {}) {
        this.root = typeof root === 'string' ? document.querySelector(root) : root;
        this.opts = { threshold: 0.3, once: true, ...opts };
        this._io = null;
        this._played = false;
    }

    init() {
        if (!this.root) return;
        // уважение к reduced motion
        this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        this.values = this.root.querySelectorAll('.stat__value');
        this.percents = this.root.querySelectorAll('.stat__meta');

        // сразу выставим нули, чтобы не мигало
        this.values.forEach((el) => (el.textContent = this._fmt(0)));
        this.percents.forEach((el) => (el.textContent = '0%'));

        this._io = new IntersectionObserver(this._onIntersect, {
            root: null,
            threshold: this.opts.threshold,
        });
        this._io.observe(this.root);
    }

    destroy() {
        if (this._io) {
            this._io.disconnect();
            this._io = null;
        }
    }

    // ====== приватные ======

    _onIntersect = (entries) => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            if (this.opts.once && this._played) return;
            this._played = true;
            this._play();
            if (this.opts.once) this._io?.disconnect();
            break;
        }
    };

    _play() {
        // числа
        this.values.forEach((el) => {
            const to = this._target(el);
            this._animate(el, 0, to, {
                duration: this._pickDuration(to),
                render: (v) => (el.textContent = this._fmt(v)),
            });
        });

        // проценты
        this.percents.forEach((el) => {
            const to = this._target(el);
            this._animate(el, 0, to, {
                duration: 900,
                render: (v) => (el.textContent = `${v}%`),
            });
        });
    }

    _target(el) {
        const ds = el.dataset?.count;
        if (ds != null) return this._num(ds);
        return this._num(el.textContent || '');
    }

    _num(s) {
        const n = Number(String(s).replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    _fmt(n) {
        // локаль RU с неразрывными пробелами
        return Number(Math.round(n)).toLocaleString('ru-RU');
    }

    _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    _pickDuration(n) {
        const base = 1200;
        const extra = Math.min(1000, String(Math.abs(n)).length * 120);
        return base + extra;
    }

    _animate(el, from, to, { duration = 1200, render }) {
        if (this.reduceMotion || duration <= 0) {
            render(to);
            return;
        }
        const start = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = this._easeOutCubic(p);
            const val = Math.round(from + (to - from) * eased);
            render(val);
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
}
