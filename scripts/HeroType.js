// HeroType.js
export function initHeroType(selector = '.hero__subtitle--type', opts = {}) {
    const el = document.querySelector(selector);
    if (!el) return;

    // Если пользователь просит снизить анимации — просто ставим первую фразу и выходим
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Фразы берем из data-phrases (JSON) или из opts.phrases или из текущего текста
    let phrases = [];
    try {
        const ds = el.dataset.phrases;
        phrases = ds ? JSON.parse(ds) : [];
    } catch { /* ignore */ }
    if (!phrases.length) phrases = opts.phrases || [el.textContent.trim()].filter(Boolean);

    // Базовые настройки
    const typeDelay = opts.typeDelay ?? 55;     // скорость печати (мс на символ)
    const eraseDelay = opts.eraseDelay ?? 35;   // скорость удаления
    const holdDelay = opts.holdDelay ?? 1300;   // пауза после напечатанной фразы
    const gapDelay  = opts.gapDelay  ?? 350;    // пауза перед печатью следующей

    let i = 0, pos = 0, typing = true, rafId = null, timerId = null;

    function setText(t) { el.textContent = t; }

    function typeStep() {
        const phrase = phrases[i];
        if (typing) {
            pos++;
            setText(phrase.slice(0, pos));
            if (pos >= phrase.length) {
                typing = false;
                timerId = setTimeout(loop, holdDelay);
                return;
            }
            timerId = setTimeout(loop, typeDelay);
        } else {
            pos--;
            setText(phrase.slice(0, pos));
            if (pos <= 0) {
                typing = true;
                i = (i + 1) % phrases.length;
                timerId = setTimeout(loop, gapDelay);
                return;
            }
            timerId = setTimeout(loop, eraseDelay);
        }
    }

    function loop() {
        // Остановка при скрытой вкладке — экономия батареи/CPU
        if (document.hidden) {
            timerId = setTimeout(loop, 300);
            return;
        }
        typeStep();
    }

    function start() {
        if (prefersReduced) {
            setText(phrases[0]);
            return;
        }
        clearTimeout(timerId);
        pos = 0; typing = true;
        setText('');
        loop();
    }

    // Перезапуск при возврате на вкладку
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !prefersReduced) {
            // небольшой debounce
            clearTimeout(timerId);
            timerId = setTimeout(() => { /* продолжить цикл */ loop(); }, 150);
        }
    });

    start();
}
