import Intro from './Preloader.js';
import Header from "./Header.js";
import Carousel from "./Carousel.js";
import Stats from "./Stats.js";
import ContactForm from './ContactForm.js';
new ContactForm('.feedback-form');
new Intro();



document.addEventListener('DOMContentLoaded', () => {
    const stats = new Stats('#lab-stats', { threshold: 0.3, once: true });
    stats.init();
    // при необходимости: stats.destroy();
});

function initOfferingAccordion(){
    const root=document.querySelector('[data-js-offering]'); if(!root) return;
    const multi=root.getAttribute('data-multiple')==='true';
    const items=[...root.querySelectorAll('.offering__item')];
    items.forEach(i=>{const p=i.querySelector('.offering__panel'); p.style.height='0px'; p.setAttribute('aria-hidden','true'); i.querySelector('.offering__header').setAttribute('aria-expanded','false');});
    root.addEventListener('click',e=>{
        const h=e.target.closest('.offering__header'); if(!h) return;
        const it=h.closest('.offering__item'), p=it.querySelector('.offering__panel'), c=it.querySelector('.offering__content');
        const toggle=(open)=>{h.setAttribute('aria-expanded',open); p.setAttribute('aria-hidden',!open); it.classList.toggle('is-open',open);};
        if(!multi) items.forEach(x=>x!==it&&x.classList.contains('is-open')&&(x.querySelector('.offering__panel').style.height=x.querySelector('.offering__content').scrollHeight+'px',requestAnimationFrame(()=>x.querySelector('.offering__panel').style.height='0px'),toggle.call(null,false),x.classList.remove('is-open')));
        const isOpen=it.classList.contains('is-open');
        if(isOpen){p.style.height=c.scrollHeight+'px'; requestAnimationFrame(()=>p.style.height='0px'); toggle(false);}
        else{p.style.height='0px'; requestAnimationFrame(()=>{p.style.height=c.scrollHeight+'px';}); p.addEventListener('transitionend',e=>{if(e.propertyName==='height') p.style.height='auto'},{once:true}); toggle(true);}
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



