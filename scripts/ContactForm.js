// ContactForm.js — UX: телефон ИЛИ email.
// НО: если пользователь начал ввод телефона (есть цифры, но <11),
//     требуем дописать телефон до конца, даже если email введён корректно.

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
            (this.form.querySelector('.feedback-form__actions') || this.form)
                .appendChild(this.ui.status);
        }

        this.$ = {
            name: this.form.elements.name,
            phone: this.form.elements.phone,
            email: this.form.elements.email,
            topic: this.form.elements.topic,
            message: this.form.elements.message,
            agree: this.form.elements.agree,
            honeypot: this.form.elements.company, // может быть отсутствует — ок
        };

        // Слушатели формы
        this.form.addEventListener('submit', (e) => this.onSubmit(e));
        this.form.addEventListener('input', (e) => this.onInput(e), { passive: true });
        this.form.addEventListener('blur', (e) => this.onBlur(e), true);

        // Маска телефона: +7 (XXX) XXX-XX-XX с нормальным backspace/caret
        if (this.$.phone) {
            this.$.phone.addEventListener('keydown', (e) => this.onPhoneKeydown(e));
            this.$.phone.addEventListener('input', () => this.onPhoneInput());
            this.$.phone.addEventListener('blur', () => this.cleanPhoneIfEmpty());
        }
    }

    /* ============ helpers ============ */

    setStatus(text, type = 'info') {
        if (!this.ui.status) return;
        this.ui.status.textContent = text || '';
        this.ui.status.dataset.type = type;
    }

    disableForm(disabled = true) {
        this.form.querySelectorAll('input, textarea, button')
            .forEach((el) => { el.disabled = disabled; });
    }

    setFieldError(input, message) {
        const wrap = input?.closest('.field, .check');
        const err = wrap?.querySelector('.field__error');
        if (err) err.textContent = message || '';
        if (input) {
            input.classList.toggle('is-invalid', !!message);
            input.setAttribute('aria-invalid', message ? 'true' : 'false');
        }
    }

    clearAllErrors() {
        this.form.querySelectorAll('.field__error').forEach((n) => (n.textContent = ''));
        this.form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
        this.form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.setAttribute('aria-invalid', 'false'));
    }

    /* ============ телефон: маска/валидация ============ */

    getPhoneDigits() {
        return (this.$.phone?.value || '').replace(/\D+/g, '');
    }

    isPhoneCompleteRU() {
        // Требуем ровно 11 цифр, нормализуем на 7 в начале
        let d = this.getPhoneDigits();
        if (!d) return false;
        if (d.startsWith('8')) d = '7' + d.slice(1);
        if (!d.startsWith('7')) d = '7' + d;
        return d.length === 11;
    }

    isPhonePartial() {
        const len = this.getPhoneDigits().length;
        return len > 0 && len < 11;
    }

    formatPhone(digits) {
        let d = digits.replace(/\D+/g, '');
        if (d.startsWith('8')) d = '7' + d.slice(1);
        if (!d.startsWith('7')) d = '7' + d;
        d = d.slice(0, 11);

        let out = '+7';
        if (d.length > 1) out += ' (' + d.slice(1, 4);
        if (d.length >= 4) out += ') ' + d.slice(4, 7);
        if (d.length >= 7) out += '-' + d.slice(7, 9);
        if (d.length >= 9) out += '-' + d.slice(9, 11);
        return out;
    }

    onPhoneKeydown(e) {
        const k = e.key;
        // Разрешаем навигацию
        if (['Tab','Enter','ArrowLeft','ArrowRight','Home','End','Delete'].includes(k)) return;

        // Фильтр символов
        if (k.length === 1 && !/[\d\+\-\s\(\)]/.test(k)) {
            e.preventDefault();
            return;
        }

        // Backspace через разделители
        if (k === 'Backspace') {
            const input = this.$.phone;
            const pos = input.selectionStart;
            const val = input.value;
            if (pos && /[()\-\s]/.test(val[pos - 1])) {
                e.preventDefault();
                const nextPos = pos - 1;
                input.setSelectionRange(nextPos, nextPos);
                const ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
                input.dispatchEvent(ev);
            }
        }
    }

    onPhoneInput() {
        const input = this.$.phone;
        const start = input.selectionStart || 0;
        const before = input.value.slice(0, start);
        const beforeDigits = before.replace(/\D+/g, '').length;

        const masked = this.formatPhone(this.getPhoneDigits());
        input.value = masked;

        // восстановим каретку по количеству цифр до позиции
        let i = 0, counted = 0;
        while (i < input.value.length && counted < beforeDigits) {
            if (/\d/.test(input.value[i])) counted++;
            i++;
        }
        input.setSelectionRange(i, i);

        // живой хинт для «незавершённого» номера
        if (this.isPhonePartial()) {
            this.setFieldError(input, 'Допишите телефон до 11 цифр');
        } else {
            this.setFieldError(input, '');
        }
    }

    cleanPhoneIfEmpty() {
        if (!this.getPhoneDigits()) this.$.phone.value = '';
    }

    /* ============ логика валидации (UX) ============ */

    emailValid() {
        const v = this.$.email?.value.trim() || '';
        if (!v) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    validate() {
        let ok = true;
        const { name, message, phone, email, agree, honeypot } = this.$;

        // Обязательные поля
        if (!name?.value.trim()) {
            this.setFieldError(name, 'Обязательное поле');
            ok = false;
        }
        if (!message?.value.trim()) {
            this.setFieldError(message, 'Обязательное поле');
            ok = false;
        }

        const hasEmail = !!email?.value.trim();
        const emailOk = this.emailValid();
        const phoneComplete = this.isPhoneCompleteRU();
        const phonePartial = this.isPhonePartial();

        // Ключевое правило формы:
        // — Разрешаем: ЛИБО полный телефон, ЛИБО валидный email.
        // — Но если телефон начат (partial) → требуем дописать, даже если email уже валиден.
        if (phonePartial) {
            this.setFieldError(phone, 'Вы начали ввод телефона — допишите его полностью');
            ok = false;
        } else if (!phoneComplete && !emailOk) {
            // оба пустые/невалидные
            this.setFieldError(phone, 'Укажите телефон или email');
            this.setFieldError(email, 'Укажите телефон или email');
            ok = false;
        } else {
            // если email введён, но формат не ок — подсветим
            if (hasEmail && !emailOk) {
                this.setFieldError(email, 'Неверный email');
                ok = false;
            }
        }

        // Согласие
        if (agree && !agree.checked) {
            this.setFieldError(agree, 'Нужно согласие');
            ok = false;
        }

        // Honeypot
        if (honeypot?.value) ok = false;

        return ok;
    }

    collectPayload() {
        return {
            name: this.$.name?.value.trim() || null,
            phone: this.$.phone?.value.trim() || null,
            email: this.$.email?.value.trim() || null,
            topic: this.$.topic?.value.trim() || null,
            message: this.$.message?.value.trim() || null,
            agree: !!this.$.agree?.checked,
            company: this.$.honeypot?.value || '',
            source: 'hyprotec-site',
            ts: new Date().toISOString(),
        };
    }

    async onSubmit(e) {
        e.preventDefault();
        this.clearAllErrors();

        if (!this.validate()) return;

        this.disableForm(true);
        this.setStatus('Отправляем…', 'info');

        const payload = this.collectPayload();

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: ctrl.signal,
            });

            clearTimeout(t);

            if (!res.ok) {
                let msg = `HTTP ${res.status}`;
                try {
                    const j = await res.json();
                    if (j?.message) msg = j.message;
                } catch {}
                throw new Error(msg);
            }

            this.setStatus('Заявка отправлена. Спасибо!', 'success');
            this.form.reset();
            this.$.name?.focus();
        } catch (err) {
            this.setStatus('Не удалось отправить. Попробуйте ещё раз.', 'error');
        } finally {
            clearTimeout(t);
            this.disableForm(false);
        }
    }

    /* ============ UX мелочи ============ */

    onInput(e) {
        const input = e.target.closest('input,textarea');
        if (!input) return;

        // снимаем локальную ошибку
        this.setFieldError(input, '');

        // при правке phone/email очищаем перекрёстные ошибки
        if (input.name === 'phone' || input.name === 'email') {
            this.setFieldError(this.$.phone, '');
            this.setFieldError(this.$.email, '');
        }
    }

    onBlur(e) {
        const input = e.target.closest('input,textarea');
        if (!input) return;

        if (input === this.$.email && this.$.email.value.trim()) {
            if (!this.emailValid()) this.setFieldError(input, 'Неверный email');
        }
        if (input === this.$.phone && this.getPhoneDigits()) {
            if (this.isPhonePartial()) this.setFieldError(input, 'Допишите телефон до 11 цифр');
        }
    }
}
