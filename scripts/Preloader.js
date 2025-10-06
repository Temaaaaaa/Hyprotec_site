class Intro {
    selectors = { root: '[data-js-intro]' };
    stateClasses = {
        introActive: 'is-intro-active',
        isLock: 'is-lock',
        leaving: 'is-leaving',
    };

    // Настраиваемые цифры:
    MIN_SHOW = 1800;         // минимум показа заставки (мс)
    BAR_DUR = 1600;          // длительность анимации полосы (мс)
    BAR_DELAY = 450;         // задержка старта полосы (мс)
    LEAVE_DUR = 800;         // длительность анимации ухода (мс) — для фолбэка

    constructor() {
        this.introEl = document.querySelector(this.selectors.root);
        if (!this.introEl) return;

        const html = document.documentElement;
        html.classList.add(this.stateClasses.introActive, this.stateClasses.isLock);

        // Применим длительность/задержку к полосе через CSS-переменные
        const bar = this.introEl.querySelector('.intro__bar');
        if (bar) {
            bar.style.setProperty('--intro-bar-dur', `${this.BAR_DUR}ms`);
            bar.style.setProperty('--intro-bar-delay', `${this.BAR_DELAY}ms`);
        }

        const start = performance.now();
        const scheduleLeave = () => {
            // держим до конца полосы И не меньше MIN_SHOW
            const untilBarEnd = this.BAR_DELAY + this.BAR_DUR + 100; // +100мс запас
            const mustShow = Math.max(this.MIN_SHOW, untilBarEnd);
            const elapsed = performance.now() - start;
            const delay = Math.max(mustShow - elapsed, 0);
            setTimeout(() => this.leave(), delay);
        };

        if (document.readyState === 'complete') {
            scheduleLeave();
        } else {
            window.addEventListener('load', scheduleLeave, { once: true });
            // фолбэк, если load вдруг не случится
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(scheduleLeave, 1200);
            }, { once: true });
        }
    }

    leave() {
        // respect Reduced Motion — скрываем без анимации
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return this.finish();

        this.introEl.classList.add(this.stateClasses.leaving);

        const onEnd = () => {
            this.introEl.removeEventListener('animationend', onEnd);
            this.finish();
        };
        this.introEl.addEventListener('animationend', onEnd, { once: true });

        // Жёсткий фолбэк
        this._fallback = setTimeout(() => {
            this.introEl.removeEventListener('animationend', onEnd);
            this.finish();
        }, this.LEAVE_DUR);
    }

    finish() {
        clearTimeout(this._fallback);
        const html = document.documentElement;
        html.classList.remove(this.stateClasses.introActive, this.stateClasses.isLock);
        this.introEl?.remove();
    }
}

export default Intro;
