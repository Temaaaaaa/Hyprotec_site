const fs = require('fs');

const TOKEN = process.env.TG_TOKEN;
// Используем числовой ID, который мы увидели в твоих логах
const CHANNEL_ID = "-1003859497665";

async function fetchTelegramNews() {
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        const posts = data.result
            .filter(item => {
                const post = item.channel_post;
                if (!post) return false;

                // Сравниваем ID как строки, чтобы не было ошибок
                const chatId = String(post.chat.id);
                const targetId = String(CHANNEL_ID);

                console.log(`Проверяю пост от ID: ${chatId}`);
                return chatId === targetId;
            })
            .map(item => {
                const post = item.channel_post;
                return {
                    id: post.message_id,
                    text: post.text || post.caption || "Без текста",
                    date: post.date
                };
            })
            .reverse();

        // Проверяем папку
        if (!fs.existsSync('./data')) fs.mkdirSync('./data');

        // Читаем старые новости
        let existingNews = [];
        if (fs.existsSync('./data/news.json')) {
            try {
                const fileContent = fs.readFileSync('./data/news.json', 'utf8');
                existingNews = JSON.parse(fileContent || '[]');
            } catch (e) {
                existingNews = [];
            }
        }

        // Объединяем и убираем дубликаты
        const allNews = [...posts, ...existingNews];
        const uniqueNews = Array.from(new Map(allNews.map(item => [item.id, item])).values()).slice(0, 10);

        fs.writeFileSync('./data/news.json', JSON.stringify(uniqueNews, null, 2));

        console.log(`✅ Найдено в этом запросе: ${posts.length}`);
        console.log(`✅ Итого сохранено в файл: ${uniqueNews.length}`);

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

fetchTelegramNews();