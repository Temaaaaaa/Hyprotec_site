// ContactForm.js — строгая валидация: если введён email, телефон обязателен и полный.
// Маска телефона РФ +7 (XXX) XXX-XX-XX с адекватным backspace и caret-позицией.
// Зависимостей нет.

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

        this.inputs = {
            name: this.form.elements.name,
            phone: this.form.elements.phone,
            email: this.form.elements.email,
            topic: this.form.elements.topic,
            message: this.form.elements.message,
            agree: this.form.elements.agree,
            honeypot: this.form.elements.company, // может отсутствовать в разметке, ок
        };

        // Bind
        this.form.addEventListener('submit', (e) => this.onSubmit(e));
        this.form.addEventListener('input', (e) => this.onInput(e), { passive: true });
        this.form.addEventListener('blur', (e) => this.onBlur(e), true);

        // Телефон: маска с управлением кареткой и backspace
        if (this.inputs.phone) {
            this.inputs.phone.addEventListener('keydown', (e) => this.onPhoneKeydown(e));
            this.inputs.phone.addEventListener('input', () => this.onPhoneInput());
            this.inputs.phone.addEventListener('blur', () => this.cleanPhoneIfEmpty());
        }
    }

    // =========================
    // Общие утилиты
    // =========================
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

    // =========================
    // Телефон: маска и проверка
    // =========================
    getPhoneDigits() {
        return (this.inputs.phone?.value || '').replace(/\D+/g, '');
    }

    isPhoneCompleteRU() {
        // Требуем ровно 11 цифр. Нормализуем на 7 в начале.
        let d = this.getPhoneDigits();
        if (!d) return false;
        if (d.startsWith('8')) d = '7' + d.slice(1);
        if (!d.startsWith('7')) return false;
        return d.length === 11;
    }

    formatPhoneFromDigits(digits) {
        // Приводим к виду +7 (XXX) XXX-XX-XX
        let d = digits.replace(/\D+/g, '');
        if (!d) return '';

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
        // Разрешаем навигацию, delete/home/end/стрелки, tab
        const k = e.key;
        if (
            k === 'Tab' || k === 'Enter' ||
            k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End' ||
            k === 'Delete'
        ) return;

        // Ограничение ввода: цифры, +, (, ), -, пробел — остальное блокируем
        const allowed = /[\d\+\-\s\(\)]/;
        if (k.length === 1 && !allowed.test(k)) {
            e.preventDefault();
            return;
        }

        // Backspace: перепрыгиваем разделители
        if (k === 'Backspace') {
            const input = this.inputs.phone;
            const pos = input.selectionStart;
            const val = input.value;

            // Если слева разделитель — сдвигаем каретку ещё на 1 влево, чтобы удалять «пачкой»
            const sep = /[()\-\s]/;
            if (pos && sep.test(val[pos - 1])) {
                e.preventDefault();
                const nextPos = pos - 1;
                input.setSelectionRange(nextPos, nextPos);
                // эмулируем повторный backspace по цифре
                const ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
                input.dispatchEvent(ev);
            }
        }
    }

    onPhoneInput() {
        const input = this.inputs.phone;
        const start = input.selectionStart || 0;

        // Текущие только цифры, форматируем
        const digits = this.getPhoneDigits();
        const before = input.value.slice(0, start);
        const beforeDigits = before.replace(/\D+/g, '').length;

        const masked = this.formatPhoneFromDigits(digits);
        input.value = masked;

        // Восстанавливаем каретку: считаем, где оказаться после маски
        let i = 0;
        let counted = 0;
        while (i < input.value.length && counted < beforeDigits) {
            if (/\d/.test(input.value[i])) counted++;
            i++;
        }
        input.setSelectionRange(i, i);

        // Живые подсказки по формату
        if (digits.length && digits.length < 11) {
            this.setFieldError(input, 'Нужно 11 цифр телефона');
        } else {
            this.setFieldError(input, '');
        }
    }

    cleanPhoneIfEmpty() {
        const input = this.inputs.phone;
        if (!input) return;
        // Если фактически нет цифр — очищаем поле полностью
        if (!this.getPhoneDigits()) input.value = '';
    }

    // =========================
    // Валидация
    // =========================
    validate() {
        let ok = true;

        const name = this.inputs.name;
        const message = this.inputs.message;
        const phone = this.inputs.phone;
        const email = this.inputs.email;
        const agree = this.inputs.agree;

        const nameVal = name?.value.trim() || '';
        const msgVal = message?.value.trim() || '';
        const emailVal = email?.value.trim() || '';

        // Обязательные
        if (!nameVal) {
            this.setFieldError(name, 'Обязательное поле');
            ok = false;
        }
        if (!msgVal) {
            this.setFieldError(message, 'Обязательное поле');
            ok = false;
        }

        // Email формат (если введён)
        let emailOk = false;
        if (emailVal) {
            emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
            if (!emailOk) {
                this.setFieldError(email, 'Неверный email');
                ok = false;
            }
        }

        // Главное правило:
        // 1) Если email введён (и валиден) → телефон обязателен и ДОЛЖЕН быть полным (11 цифр РФ).
        // 2) Если email не введён → телефон обязателен и полный.
        const phoneComplete = this.isPhoneCompleteRU();

        if (emailVal) {
            if (!phoneComplete) {
                this.setFieldError(phone, 'Если указан email — заполните телефон полностью');
                ok = false;
            }
        } else {
            if (!phoneComplete) {
                this.setFieldError(phone, 'Укажите корректный телефон (+7 и 11 цифр)');
                ok = false;
            }
        }

        // Согласие
        if (agree && !agree.checked) {
            this.setFieldError(agree, 'Нужно согласие');
            ok = false;
        }

        // Honeypot (если есть в форме и вдруг заполнен)
        if (this.inputs.honeypot?.value) {
            ok = false;
        }

        return ok;
    }

    // =========================
    // Сбор данных и отправка
    // =========================
    collectPayload() {
        const data = {
            name: this.inputs.name?.value.trim() || null,
            phone: this.inputs.phone?.value.trim() || null,
            email: this.inputs.email?.value.trim() || null,
            topic: this.inputs.topic?.value.trim() || null,
            message: this.inputs.message?.value.trim() || null,
            agree: !!this.inputs.agree?.checked,
            company: this.inputs.honeypot?.value || '', // honeypot на бэке
            source: 'hyprotec-site',
            ts: new Date().toISOString(),
        };
        return data;
    }

    async onSubmit(e) {
        e.preventDefault();
        this.clearAllErrors();

        if (!this.validate()) return;

        this.disableForm(true);
        this.setStatus('Отправляем…', 'info');

        const payload = this.collectPayload();

        // Abort через 12с
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

            if (!res.ok) {
                // попробуем прочитать ответ бэка, чтобы показать текст
                let msg = `HTTP ${res.status}`;
                try {
                    const j = await res.json();
                    if (j?.message) msg = j.message;
                } catch {}
                throw new Error(msg);
            }

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

    // =========================
    // UX-мелочи
    // =========================
    onInput(e) {
        const input = e.target.closest('input,textarea');
        if (!input) return;

        // Снимаем ошибку с текущего поля
        this.setFieldError(input, '');

        // Скрестные поля: если меняем phone/email — снимаем ошибки на обоих
        if (input.name === 'phone' || input.name === 'email') {
            this.setFieldError(this.inputs.phone, '');
            this.setFieldError(this.inputs.email, '');
        }
    }

    onBlur(e) {
        const input = e.target.closest('input,textarea');
        if (!input) return;

        // Локальная подсветка на blur
        if (input === this.inputs.email && input.value.trim()) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
                this.setFieldError(input, 'Неверный email');
            }
        }
        if (input === this.inputs.phone && this.getPhoneDigits()) {
            if (!this.isPhoneCompleteRU()) {
                this.setFieldError(input, 'Нужно 11 цифр телефона');
            }
        }
    }
}
