const fs = require('fs');

// 1. Настройки (токен подхватится из Secrets GitHub автоматически)
const TOKEN = process.env.TG_TOKEN;
const CHANNEL_ID = '@@okaasdf_bot'; // ЗАМЕНИ на свой username канала (с @)

async function fetchTelegramNews() {
    // API метод для получения последних обновлений бота
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
            throw new Error(`Telegram API Error: ${data.description}`);
        }

        // 2. Фильтруем данные: нам нужны только посты из конкретного канала
        const posts = data.result
            .filter(item => {
                // Проверяем, что это пост из канала и ID или Username совпадают
                const post = item.channel_post;
                return post && (
                    post.chat.username === CHANNEL_ID.replace('@', '') ||
                    post.chat.id.toString() === CHANNEL_ID
                );
            })
            .map(item => {
                const post = item.channel_post;
                return {
                    id: post.message_id,
                    text: post.text || "", // Текст поста
                    date: post.date,      // Дата в формате Unix Timestamp
                    // Если в посте есть ссылка или кнопка, её можно вытянуть из entities,
                    // но для начала ограничимся текстом.
                };
            })
            .filter(post => post.text.length > 0) // Убираем пустые посты (например, только фото)
            .reverse(); // Свежие новости — в начало списка

        // 3. Проверяем наличие папки data и записываем файл
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }

        // Читаем старые новости, чтобы не затирать их (так как getUpdates хранит данные недолго)
        let existingNews = [];
        if (fs.existsSync('./data/news.json')) {
            const fileContent = fs.readFileSync('./data/news.json', 'utf8');
            existingNews = JSON.parse(fileContent || '[]');
        }

        // Объединяем старые и новые посты, удаляя дубликаты по ID
        const allNews = [...posts, ...existingNews];
        const uniqueNews = Array.from(new Map(allNews.map(item => [item.id, item])).values())
            .slice(0, 10); // Храним только последние 10 новостей

        fs.writeFileSync('./data/news.json', JSON.stringify(uniqueNews, null, 2));

        console.log(`✅ Успех! Найдено новых постов: ${posts.length}. Всего в базе: ${uniqueNews.length}`);

    } catch (error) {
        console.error('❌ Ошибка при получении новостей:', error.message);
        process.exit(1); // Сообщаем GitHub Actions, что произошла ошибка
    }
}

fetchTelegramNews();