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

        this.form.addEventListener('submit', (e) => this.onSubmit(e));
        this.form.addEventListener('input', (e) => this.onInput(e));

        if (this.inputs.phone) {
            this.inputs.phone.addEventListener('input', () => this.maskPhone());
            this.inputs.phone.addEventListener('blur', () => this.cleanPhoneIfEmpty());
            // не даём backspace «залипать» на дефисах/скобках
            this.inputs.phone.addEventListener('keydown', (e) => this.phoneBackspaceFix(e));
        }
    }

    // ---- UI helpers ----
    setStatus(text, type = 'info') {
        if (!this.ui.status) return;
        this.ui.status.textContent = text;
        this.ui.status.dataset.type = type;
    }

    disableForm(disabled = true) {
        this.form.querySelectorAll('input, textarea, button').forEach((el) => {
            el.disabled = disabled;
        });
    }

    setFieldError(input, message) {
        if (!input) return;
        const wrap = input.closest('.field, .check');
        const err = wrap?.querySelector('.field__error');
        if (err) err.textContent = message || '';
        input.classList.toggle('is-invalid', !!message);
    }

    onInput(e) {
        const input = e.target.closest('input,textarea');
        if (!input) return;

        // очищаем ошибку текущего поля
        this.setFieldError(input, '');

        // кросс-правило: телефон/почта
        if (input.name === 'phone' || input.name === 'email') {
            this.setFieldError(this.inputs.phone, '');
            this.setFieldError(this.inputs.email, '');
        }
    }

    // ---- Validation ----
    validate() {
        let ok = true;

        // обязательные поля
        ['name', 'message'].forEach((name) => {
            const el = this.inputs[name];
            if (!el?.value.trim()) {
                this.setFieldError(el, 'Обязательное поле');
                ok = false;
            }
        });

        // телефон / email
        const phoneRaw = (this.inputs.phone?.value || '').trim();
        const phoneDigits = String(phone).replace(/\D+/g, '');
        const emailRaw = (this.inputs.email?.value || '').trim();
        const hasEmail = emailRaw ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) : false;
        const hasAnyPhone = phoneDigits.length === 11 && phoneDigits[0] === '7';

        if (!hasAnyPhone && !hasEmail) {
            this.setFieldError(this.inputs.phone, 'Укажите телефон или email');
            this.setFieldError(this.inputs.email, 'Укажите телефон или email');
            ok = false;
        }

        // если телефон введён — он должен быть полным: ровно 11 цифр и начинаться с 7
        if (hasAnyPhone) {
            const fullPhone = phoneDigits.length === 11 && phoneDigits[0] === '7';
            if (!fullPhone) {
                this.setFieldError(this.inputs.phone, 'Введите корректный номер целиком');
                ok = false;
            }
        }

        // если email заполнен, но невалиден
        if (emailRaw && !hasEmail) {
            this.setFieldError(this.inputs.email, 'Неверный email');
            ok = false;
        }

        // согласие
        if (this.inputs.agree && !this.inputs.agree.checked) {
            this.setFieldError(this.inputs.agree, 'Нужно согласие');
            ok = false;
        }

        // honeypot
        if (this.inputs.honeypot?.value) ok = false;

        return ok;
    }

    // ---- Payload ----
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

    // ---- Submit ----
    async onSubmit(e) {
        e.preventDefault();
        this.form.querySelectorAll('.field__error').forEach((n) => (n.textContent = ''));

        if (!this.validate()) return;

        this.disableForm(true);
        this.setStatus('Отправляем…', 'info');

        const payload = this.collectPayload();

        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 12000);

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: ctrl.signal,
            });
            clearTimeout(timeout);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            this.setStatus('Заявка отправлена. Спасибо!', 'success');
            this.form.reset();
            this.inputs.name?.focus();
        } catch (err) {
            this.setStatus('Не получилось отправить. Попробуйте ещё раз.', 'error');
        } finally {
            clearTimeout(timeout);
            this.disableForm(false);
        }
    }

    // ---------- Phone helpers ----------
    maskPhone() {
        // берём только цифры и строим отображение «с нуля» — без липких символов
        let d = this.inputs.phone.value.replace(/\D+/g, '');
        if (!d) {
            this.inputs.phone.value = '';
            return;
        }
        if (d[0] === '8') d = '7' + d.slice(1);
        if (d[0] !== '7') d = '7' + d;
        d = d.slice(0, 11);

        let out = '+7';
        if (d.length > 1) out += ' (' + d.slice(1, 4);
        if (d.length >= 4) out += ') ' + d.slice(4, 7);
        if (d.length >= 7) out += '-' + d.slice(7, 9);
        if (d.length >= 9) out += '-' + d.slice(9, 11);

        this.inputs.phone.value = out;
    }

    phoneBackspaceFix(e) {
        if (e.key !== 'Backspace') return;
        const el = this.inputs.phone;
        const { selectionStart, selectionEnd, value } = el;

        // работаем только без выделения и в конце строки
        if (selectionStart !== selectionEnd) return;
        if (selectionStart !== value.length) return;

        // если последний символ — не цифра, удалим его вручную, затем пересоберём маску
        if (/\D$/.test(value)) {
            e.preventDefault();
            el.value = value.slice(0, -1);
            requestAnimationFrame(() => {
                this.maskPhone();
                const len = el.value.length;
                el.setSelectionRange(len, len);
            });
        }
    }

    cleanPhoneIfEmpty() {
        const digits = this.inputs.phone.value.replace(/\D+/g, '');
        if (digits.length <= 1) this.inputs.phone.value = '';
    }
}
