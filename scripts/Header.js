class Header {
    selectors = {
        root: '[data-js-header]',
        overlay: '[data-js-header-overlay]',
        burgerButton: '[data-js-header-burger-button]',
        submenuItem: '.header__menu-item--has-submenu',
        submenuToggle: '[data-js-submenu-toggle]',
        submenuLinkTrigger: '.header__menu-item--has-submenu > .header__menu-link',
        submenuLinks: '.header__submenu a, .header__submenu-link',
        anyMenuLink: '.header__menu-link',
        langLinks: '.header__language-select a',              // NEW
    };

    stateClasses = {
        isActive: 'is-active',
        isLock: 'is-lock',
        isOpen: 'is-open',
    };

    constructor() {
        this.root = document.querySelector(this.selectors.root);
        if (!this.root) return;

        this.overlay = this.root.querySelector(this.selectors.overlay);
        this.burger = this.root.querySelector(this.selectors.burgerButton);

        this.mqMobile = window.matchMedia('(max-width: 767.98px)');
        this.bindEvents();
    }

    /* helpers */
    get isPanelOpen() { return this.overlay?.classList.contains(this.stateClasses.isActive); }

    openPanel() {
        this.overlay?.classList.add(this.stateClasses.isActive);
        this.burger?.classList.add(this.stateClasses.isActive);
        document.documentElement.classList.add(this.stateClasses.isLock);
        this.burger?.setAttribute('aria-expanded', 'true');
    }

    closePanel() {
        this.overlay?.classList.remove(this.stateClasses.isActive);
        this.burger?.classList.remove(this.stateClasses.isActive);
        document.documentElement.classList.remove(this.stateClasses.isLock);
        this.burger?.setAttribute('aria-expanded', 'false');
        this.closeAllSubmenus();
    }

    togglePanel = () => (this.isPanelOpen ? this.closePanel() : this.openPanel());

    closeAllSubmenus(except = null) {
        this.root
            .querySelectorAll(`${this.selectors.submenuItem}.${this.stateClasses.isOpen}`)
            .forEach((li) => {
                if (except && li === except) return;
                li.classList.remove(this.stateClasses.isOpen);
                const trigger = li.querySelector(this.selectors.submenuLinkTrigger);
                const btn = li.querySelector(this.selectors.submenuToggle);
                trigger?.setAttribute('aria-expanded', 'false');
                btn?.setAttribute('aria-expanded', 'false');
            });
    }

    toggleSubmenu(item) {
        const willOpen = !item.classList.contains(this.stateClasses.isOpen);
        this.closeAllSubmenus(willOpen ? item : null);
        item.classList.toggle(this.stateClasses.isOpen, willOpen);
        const trigger = item.querySelector(this.selectors.submenuLinkTrigger);
        const btn = item.querySelector(this.selectors.submenuToggle);
        trigger?.setAttribute('aria-expanded', String(willOpen));
        btn?.setAttribute('aria-expanded', String(willOpen));
    }

    /* events */
    onBurgerClick = () => this.togglePanel();

    onDocumentClick = (e) => {
        const target = e.target;

        // 1) Кнопка "+" (мобилка)
        const toggleBtn = target.closest(this.selectors.submenuToggle);
        if (toggleBtn && this.root.contains(toggleBtn)) {
            e.preventDefault();
            const item = toggleBtn.closest(this.selectors.submenuItem);
            if (item) this.toggleSubmenu(item);
            return;
        }

        // 2) Клик по ссылке «Услуги»
        const triggerLink = target.closest(this.selectors.submenuLinkTrigger);
        if (triggerLink && this.root.contains(triggerLink)) {
            if (this.mqMobile.matches) {
                // мобилка — раскрываем аккордеон, не переходим
                e.preventDefault();
                const item = triggerLink.closest(this.selectors.submenuItem);
                if (item) this.toggleSubmenu(item);
                return;
            }
            // десктоп — позволяем переход/hover-меню по CSS
        }

        // 3) Клик по пункту ПОДМЕНЮ — закрыть панель (мобилка)
        const subLink = target.closest(this.selectors.submenuLinks);
        if (subLink && this.root.contains(subLink) && this.isPanelOpen) {
            this.closePanel();
            return;
        }

        // 4) Клик по ЛЮБОЙ другой ссылке меню верхнего уровня — закрыть панель (мобилка) // NEW
        const topLink = target.closest(this.selectors.anyMenuLink);
        if (
            this.mqMobile.matches &&
            this.isPanelOpen &&
            topLink &&
            !topLink.matches(this.selectors.submenuLinkTrigger) // исключаем «Услуги»
        ) {
            // не мешаем навигации — просто закрываем
            this.closePanel();
            return;
        }

        // 5) Клик по выбору языка — тоже закрываем // NEW
        const langLink = target.closest(this.selectors.langLinks);
        if (langLink && this.isPanelOpen) {
            this.closePanel();
            return;
        }

        // 6) Клик вне пунктов подменю — закрыть раскрытые подменю
        if (!target.closest(this.selectors.submenuItem)) {
            this.closeAllSubmenus();
        }
    };

    onKeydown = (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            if (this.isPanelOpen) this.closePanel();
            this.closeAllSubmenus();
        }
        if (this.mqMobile.matches && (e.key === 'Enter' || e.key === ' ')) {
            const active = document.activeElement;
            if (active && active.matches(this.selectors.submenuLinkTrigger)) {
                e.preventDefault();
                const item = active.closest(this.selectors.submenuItem);
                if (item) this.toggleSubmenu(item);
            }
        }
    };

    onResizeChange = () => {
        if (!this.mqMobile.matches) {
            this.closeAllSubmenus();
        }
    };

    // закрываем панель при изменении hash и навигации в истории (якоря, назад-вперёд) // NEW
    onHashOrHistory = () => { if (this.isPanelOpen) this.closePanel(); }; // NEW

    bindEvents() {
        this.burger?.addEventListener('click', this.onBurgerClick);
        document.addEventListener('click', this.onDocumentClick, { passive: false });
        document.addEventListener('keydown', this.onKeydown);
        this.mqMobile.addEventListener('change', this.onResizeChange);
        window.addEventListener('hashchange', this.onHashOrHistory);   // NEW
        window.addEventListener('popstate', this.onHashOrHistory);     // NEW
    }
}

export default Header;
