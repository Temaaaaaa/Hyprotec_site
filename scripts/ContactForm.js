// Lightweight contact form controller (no deps)
export default class ContactForm {
    constructor(selector = '.feedback-form') {
        this.form = document.querySelector(selector);
        if (!this.form) return;

        this.ui = {
            status: this.form.querySelector('.feedback-form__status'),
            submit: this.form.querySelector('.feedback-form__submit'),
        };
        if (!this.ui.status) {
            this.ui.status = document.createElement('span');
            this.ui.status.className = 'feedback-form__status';
            this.ui.status.setAttribute('role', 'status');
            this.ui.status.setAttribute('aria-live', 'polite');
            const actions = this.form.querySelector('.feedback-form__actions');
            (actions || this.form).appendChild(this.ui.status);
        }


        this.inputs = {
            name: this.form.elements.name,
            phone: this.form.elements.phone,
            email: this.form.elements.email,
            topic: this.form.elements.topic,
            message: this.form.elements.message,
            agree: this.form.elements.agree,
            honeypot: this.form.elements.company, // hidden anti-bot
        };

        // bind
        this.form.addEventListener('submit', (e) => this.onSubmit(e));
        // live validation hints
        this.form.addEventListener('input', (e) => this.onInput(e));
        // light phone mask (RU-ish)
        if (this.inputs.phone) {
            this.inputs.phone.addEventListener('input', () => this.maskPhone());
            this.inputs.phone.addEventListener('blur', () => this.cleanPhoneIfEmpty());
        }
    }

    onInput(e) {
        // clear error for that field
        const input = e.target.closest('input,textarea');
        if (!input) return;
        this.setFieldError(input, '');
        // cross-field rule: one of (phone,email)
        if (input.name === 'phone' || input.name === 'email') {
            this.setFieldError(this.inputs.phone, '');
            this.setFieldError(this.inputs.email, '');
        }
    }

    setStatus(text, type = 'info') {
        if (!this.ui.status) return;
        this.ui.status.textContent = text;
        this.ui.status.dataset.type = type;
    }

    disableForm(disabled = true) {
        this.form.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = disabled; });
    }

    setFieldError(input, message) {
        const wrap = input.closest('.field, .check');
        if (!wrap) return;
        const err = wrap.querySelector('.field__error');
        if (err) err.textContent = message || '';
        input.classList.toggle('is-invalid', !!message);
    }

    validate() {
        let ok = true;

        // required
        ['name', 'message'].forEach(name => {
            const el = this.inputs[name];
            if (!el?.value.trim()) {
                this.setFieldError(el, 'Обязательное поле');
                ok = false;
            }
        });

        // at least one of phone/email
        const phoneVal = (this.inputs.phone?.value || '').trim();
        const emailVal = (this.inputs.email?.value || '').trim();

        if (!phoneVal && !emailVal) {
            this.setFieldError(this.inputs.phone, 'Укажите телефон или email');
            this.setFieldError(this.inputs.email, 'Укажите телефон или email');
            ok = false;
        }

        // formats
        if (phoneVal && !/^[\d+\-\s()]{10,}$/.test(phoneVal)) {
            this.setFieldError(this.inputs.phone, 'Неверный телефон');
            ok = false;
        }
        if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            this.setFieldError(this.inputs.email, 'Неверный email');
            ok = false;
        }

        // agree
        if (this.inputs.agree && !this.inputs.agree.checked) {
            this.setFieldError(this.inputs.agree, 'Нужно согласие');
            ok = false;
        }

        // honeypot
        if (this.inputs.honeypot?.value) ok = false;

        return ok;
    }

    collectPayload() {
        const data = {
            name: this.inputs.name?.value.trim() || null,
            phone: this.inputs.phone?.value.trim() || null,
            email: this.inputs.email?.value.trim() || null,
            topic: this.inputs.topic?.value.trim() || null,
            message: this.inputs.message?.value.trim() || null,
            agree: !!this.inputs.agree?.checked,
            source: 'hyprotec-site',
            ts: new Date().toISOString(),
        };
        return data;
    }

    async onSubmit(e) {
        e.preventDefault();
        // clear previous errors
        this.form.querySelectorAll('.field__error').forEach(n => (n.textContent = ''));

        if (!this.validate()) return;

        this.disableForm(true);
        this.setStatus('Отправляем…', 'info');

        const payload = this.collectPayload();

        // abort after 12s
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 12000);

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
                signal: ctrl.signal,
            });

            clearTimeout(timeout);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            this.setStatus('Заявка отправлена. Спасибо!', 'success');
            this.form.reset();
            // return focus to first field for accessibility
            this.inputs.name?.focus();
        } catch (err) {
            this.setStatus('Не получилось отправить. Попробуйте ещё раз.', 'error');
        } finally {
            clearTimeout(timeout);
            this.disableForm(false);
        }
    }

    // ---------- tiny phone helpers ----------
    maskPhone() {
        // digits only, try to format like +7 (XXX) XXX-XX-XX — без навязчивости
        let d = this.inputs.phone.value.replace(/\D+/g, '');
        if (!d) return;
        if (d.startsWith('8')) d = '7' + d.slice(1);
        if (!d.startsWith('7')) d = '7' + d;
        d = d.slice(0, 11);

        let out = '+7';
        if (d.length > 1) out += ' (' + d.slice(1, 4);
        if (d.length >= 4) out += ') ' + d.slice(4, 7);
        if (d.length >= 7) out += '-' + d.slice(7, 9);
        if (d.length >= 9) out += '-' + d.slice(9, 11);

        this.inputs.phone.value = out;
    }

    cleanPhoneIfEmpty() {
        if (this.inputs.phone.value.replace(/\D+/g, '').length <= 1) {
            this.inputs.phone.value = '';
        }
    }
}
