// scripts/components/Carousel.js
// Работает с разметкой: .carousel [data-js-carousel] и дочерними data-js-* селекторами

export default class Carousel {
    // приватные поля
    #stopAutopIfDragging = false; // ← добавили объявление

    /**
     * @param {HTMLElement} root - элемент с data-js-carousel
     * @param {Object} opts
     * @param {boolean} [opts.loop=false]         // бесконечная прокрутка (без клонирования — по краям стоп)
     * @param {boolean} [opts.autoplay=false]     // авто-прокрутка
     * @param {number}  [opts.interval=4500]      // пауза между авто-скроллами
     * @param {number}  [opts.snapTimeout=120]    // debounce при syncFromScroll
     */
    constructor(root, opts = {}) {
        this.root = root;
        this.opts = { loop: false, autoplay: false, interval: 1000, snapTimeout: 120, ...opts };

        this.viewport = root.querySelector('[data-js-carousel-viewport]');
        this.track    = root.querySelector('[data-js-carousel-track]');
        this.prevBtn  = root.querySelector('[data-js-carousel-prev]');
        this.nextBtn  = root.querySelector('[data-js-carousel-next]');
        this.dotsWrap = root.querySelector('[data-js-carousel-dots]');
        this.slides   = Array.from(root.querySelectorAll('.carousel__slide'));

        if (!this.viewport || !this.track || !this.slides.length) return;

        // Состояние
        this.current = 0;
        this.slideGap = this.#computeGap();
        this.slideWidth = 0;
        this.drag = { active: false, startX: 0, startLeft: 0, moved: false };

        // Старт
        this.#normalizeA11y();
        this.#measure();
        this.#buildDots();
        this.#bind();
        this.#update();

        // Автоплей из data-атрибутов (если нужно)
        const attrAutoplay = this.root.getAttribute('data-autoplay');
        if (attrAutoplay === 'true' || this.opts.autoplay) this.#startAutoplay();
    }

    // ===========================
    // Helpers / Measure
    // ===========================
    #computeGap() {
        const styles = getComputedStyle(this.track);
        const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
        return gap;
    }

    #measure() {
        // ширина одного «столбца» (слайда) = ширина первого li
        const first = this.slides[0];
        this.slideWidth = first.getBoundingClientRect().width + this.slideGap;
    }

    #normalizeA11y() {
        // Убедимся в корректных ролях
        this.viewport.setAttribute('role', this.viewport.getAttribute('role') || 'region');
        this.viewport.setAttribute('tabindex', this.viewport.getAttribute('tabindex') || '0');
        this.viewport.setAttribute('aria-roledescription', this.viewport.getAttribute('aria-roledescription') || 'carousel');

        this.slides.forEach((slide, i) => {
            slide.setAttribute('role', 'group');
            slide.setAttribute('aria-roledescription', 'slide');
            slide.setAttribute('aria-label', `${i + 1} из ${this.slides.length}`);
        });
    }

    // ===========================
    // Dots
    // ===========================
    #buildDots() {
        if (!this.dotsWrap) return;
        this.dotsWrap.innerHTML = '';
        this.dots = this.slides.map((_, i) => {
            const b = document.createElement('button');
            b.className = 'carousel__dot';
            b.type = 'button';
            b.setAttribute('aria-label', `Слайд ${i + 1}`);
            b.addEventListener('click', () => this.goTo(i));
            this.dotsWrap.appendChild(b);
            return b;
        });
    }

    // ===========================
    // Events
    // ===========================
    #bind() {
        // Кнопки
        this.prevBtn?.addEventListener('click', () => this.prev());
        this.nextBtn?.addEventListener('click', () => this.next());

        // Колёсико/тач скролл → синхронизация индекса
        let t;
        this.viewport.addEventListener('scroll', () => {
            clearTimeout(t);
            t = setTimeout(() => this.#syncFromScroll(), this.opts.snapTimeout);
        }, { passive: true });

        // Клавиатура
        this.viewport.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'Home') this.goTo(0);
            if (e.key === 'End')  this.goTo(this.slides.length - 1);
        });

        // Drag mouse (десктоп)
        this.viewport.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
        window.addEventListener('pointermove', (e) => this.#onPointerMove(e));
        window.addEventListener('pointerup',   (e) => this.#onPointerUp(e));
        window.addEventListener('pointercancel', (e) => this.#onPointerUp(e));

        // Resize / remeasure
        this.ro = new ResizeObserver(() => {
            const old = this.slideWidth;
            this.slideGap = this.#computeGap();
            this.#measure();
            if (Math.abs(old - this.slideWidth) > 1) {
                // привязать текущий индекс к новой ширине
                this.#scrollToIndex(this.current, false);
            }
        });
        this.ro.observe(this.viewport);

        // Пауза автоплея при фокусе/hover
        this.root.addEventListener('mouseenter', () => this.#stopAutoplay(), { passive: true });
        this.root.addEventListener('mouseleave', () => this.#startAutoplay(), { passive: true });
        this.viewport.addEventListener('focusin', () => this.#stopAutoplay());
        this.viewport.addEventListener('focusout', () => this.#startAutoplay());
    }

    #onPointerDown(e) {
        // только ЛКМ и на широких экранах (на мобиле и так тач-скролл норм)
        if (e.button !== 0) return;
        this.drag.active = true;
        this.drag.moved = false;
        this.viewport.setPointerCapture?.(e.pointerId);
        this.drag.startX = e.clientX;
        this.drag.startLeft = this.viewport.scrollLeft;
        this.#stopAutopIfDragging = true;  // ← используем приватное поле
        this.#stopAutoplay();
    }

    #onPointerMove(e) {
        if (!this.drag.active) return;
        const dx = e.clientX - this.drag.startX;
        if (Math.abs(dx) > 3) this.drag.moved = true;
        this.viewport.scrollLeft = this.drag.startLeft - dx;
    }

    #onPointerUp(e) {
        if (!this.drag.active) return;
        this.drag.active = false;

        // Снэп к ближайшему слайду, если был реальный сдвиг
        if (this.drag.moved) {
            this.#syncFromScroll();
            this.#scrollToIndex(this.current, true);
        }
        this.drag.moved = false;

        if (this.#stopAutopIfDragging) {
            this.#stopAutopIfDragging = false;
            this.#startAutoplay();
        }
    }

    // ===========================
    // Core
    // ===========================
    #indexFromScroll() {
        const i = Math.round(this.viewport.scrollLeft / this.slideWidth);
        return Math.max(0, Math.min(i, this.slides.length - 1));
    }

    #syncFromScroll() {
        const idx = this.#indexFromScroll();
        if (idx !== this.current) {
            this.current = idx;
            this.#update();
        } else {
            // подровнять (на случай дробного положения)
            this.#scrollToIndex(this.current, true);
        }
    }

    #scrollToIndex(index, smooth = true) {
        const x = index * this.slideWidth;
        this.viewport.scrollTo({ left: x, behavior: smooth ? 'smooth' : 'auto' });
    }

    #update() {
        // Кнопки
        if (this.prevBtn) this.prevBtn.disabled = !this.opts.loop && this.current === 0;
        if (this.nextBtn) this.nextBtn.disabled = !this.opts.loop && this.current === this.slides.length - 1;

        // Dots
        if (this.dots?.length) {
            this.dots.forEach((d, i) => d.setAttribute('aria-current', i === this.current ? 'true' : 'false'));
        }
    }

    goTo(index) {
        const max = this.slides.length - 1;
        if (!this.opts.loop) {
            this.current = Math.max(0, Math.min(index, max));
        } else {
            // soft-loop: за границей просто стопаемся на краю
            this.current = Math.max(0, Math.min(index, max));
        }
        this.#scrollToIndex(this.current, true);
        this.#update();
    }

    next() { this.goTo(this.current + 1); }
    prev() { this.goTo(this.current - 1); }

    // ===========================
    // Autoplay
    // ===========================
    #startAutoplay() {
        if (!this.opts.autoplay) return;
        if (this.autoplayTimer) return;
        this.autoplayTimer = setInterval(() => {
            if (!this.viewport.matches(':hover') && !this.root.matches(':focus-within')) {
                if (this.current >= this.slides.length - 1) this.goTo(0);
                else this.next();
            }
        }, this.opts.interval);
    }

    #stopAutoplay() {
        if (this.autoplayTimer) {
            clearInterval(this.autoplayTimer);
            this.autoplayTimer = null;
        }
    }

    destroy() {
        this.#stopAutoplay();
        this.ro?.disconnect();
    }
}
