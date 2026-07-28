import Intro from './Preloader.js';
import Header from "./Header.js";
import Carousel from "./Carousel.js";
import Stats from "./Stats.js";
import initCookieConsent from './CookieConsent.js';
new Intro();
import { initHeroType } from './HeroType.js';
initCookieConsent();

document.addEventListener('DOMContentLoaded', () => {
    initHeroType('.hero__subtitle--type', {
        // при желании подправь скорости под вкус:
        typeDelay: 55,
        eraseDelay: 35,
        holdDelay: 1300,
        gapDelay: 350,
    });
});







document.addEventListener('DOMContentLoaded', () => {
    const stats = new Stats('#lab-stats', { threshold: 0.3, once: true });
    stats.init();
    // при необходимости: stats.destroy();
});

function initOfferingAccordion(){
    const root=document.querySelector('[data-js-offering]'); if(!root) return;
    const multi=root.getAttribute('data-multiple')==='true';
    const items=[...root.querySelectorAll('.offering__item')];
    const setOpen=(item,open)=>{
        const panel=item.querySelector('.offering__panel');
        const header=item.querySelector('.offering__header');
        if(!panel||!header) return;
        header.setAttribute('aria-expanded',String(open));
        panel.setAttribute('aria-hidden',String(!open));
        item.classList.toggle('is-open',open);
    };
    items.forEach(item=>{
        const panel=item.querySelector('.offering__panel');
        if(!panel) return;
        panel.style.height='0px';
        setOpen(item,false);
    });
    root.addEventListener('click',e=>{
        const h=e.target.closest('.offering__header'); if(!h) return;
        const it=h.closest('.offering__item'), p=it.querySelector('.offering__panel'), c=it.querySelector('.offering__content');
        if(!it||!p||!c) return;
        if(!multi) items.forEach(x=>{
            if(x===it||!x.classList.contains('is-open')) return;
            const otherPanel=x.querySelector('.offering__panel');
            const otherContent=x.querySelector('.offering__content');
            if(!otherPanel||!otherContent) return;
            otherPanel.style.height=otherContent.scrollHeight+'px';
            requestAnimationFrame(()=>{otherPanel.style.height='0px';});
            setOpen(x,false);
        });
        const isOpen=it.classList.contains('is-open');
        if(isOpen){p.style.height=c.scrollHeight+'px'; requestAnimationFrame(()=>p.style.height='0px'); setOpen(it,false);}
        else{p.style.height='0px'; requestAnimationFrame(()=>{p.style.height=c.scrollHeight+'px';}); p.addEventListener('transitionend',e=>{if(e.propertyName==='height') p.style.height='auto'},{once:true}); setOpen(it,true);}
    });
}
initOfferingAccordion();


// scripts/main.js
import { initTcoBars } from './tco-bars.js';
initTcoBars();
new Header();

document.querySelectorAll('[data-js-carousel]').forEach(el => {
    // можно читать настройки из data-атрибутов
    const autoplay = el.getAttribute('data-autoplay') === 'true';
    const interval = Number(el.getAttribute('data-interval')) || 4500;

    new Carousel(el, { autoplay, interval });
});
document.querySelectorAll('.hero__subtitle--type').forEach(el => {
    const n = el.textContent.trim().length;                 // длина строки
    el.style.setProperty('--type-chars', n.toString());     // ставим в CSS-переменную
});

function initFormModals() {
    document.querySelectorAll('[data-js-form-modal-open]').forEach((trigger) => {
        const modalId = trigger.getAttribute('data-form-modal-target');
        const modal = modalId ? document.getElementById(modalId) : null;
        if (!modal) return;

        const frame = modal.querySelector('[data-src]');
        const closeButtons = modal.querySelectorAll('[data-js-form-modal-close]');
        let lastFocus = null;

        const closeModal = () => {
            if (modal.open) modal.close();
            document.documentElement.classList.remove('is-lock');
            lastFocus?.focus?.();
        };

        trigger.addEventListener('click', (event) => {
            if (typeof modal.showModal !== 'function') return;

            event.preventDefault();
            lastFocus = document.activeElement;

            if (frame && !frame.getAttribute('src')) {
                frame.setAttribute('src', frame.dataset.src);
            }

            modal.showModal();
            document.documentElement.classList.add('is-lock');
        });

        closeButtons.forEach((button) => button.addEventListener('click', closeModal));

        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });

        modal.addEventListener('cancel', (event) => {
            event.preventDefault();
            closeModal();
        });

        modal.addEventListener('close', () => {
            document.documentElement.classList.remove('is-lock');
        });
    });
}

initFormModals();

