export function initTcoBars(root = document) {
    root.querySelectorAll('.bars__list').forEach(list => {
        const max = Number(list.getAttribute('data-max')) || 0;

        list.querySelectorAll('.bar').forEach(bar => {
            const val = Number(bar.getAttribute('data-value')) || 0;
            const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0;

            // создаём трек (задник)
            let track = bar.querySelector('.bar-track');
            if (!track) {
                track = document.createElement('div');
                track.className = 'bar-track';
                // вставляем в grid между label и value
                bar.insertBefore(track, bar.lastChild);
            }

            // устанавливаем ширину «чипа» со значением
            bar.style.setProperty('--bar-width', pct + '%');
            // делаем из ::after «чип» нужной ширины — через inline style
            const chipWidth = `max(${pct}%, 3.5rem)`; // минимальная «пилюля»
            bar.style.setProperty('--chip-width', chipWidth);

            // переносим ширину в after через style (используем attr нельзя) — через dataset+CSS vars
            // Для простоты зададим прямо width ближайшему псевдоэлементу через wrapper:
            // т.к. псевдоэлементу напрямую width не задашь, используем hack: добавим real span.
            if (!bar.querySelector('.bar-chip')) {
                const span = document.createElement('span');
                span.className = 'bar-chip';
                span.textContent = `${val} у.е.`;
                bar.appendChild(span);
            }
            const chip = bar.querySelector('.bar-chip');
            chip.style.width = chipWidth;
            chip.style.background = getComputedStyle(bar).getPropertyValue('--bar-color');
        });
    });
}
