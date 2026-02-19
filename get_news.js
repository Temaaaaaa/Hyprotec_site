const fs = require('fs');

const TOKEN = process.env.TG_TOKEN;
const CHANNEL_ID = '@okaasdf_bot';

async function fetchTelegramNews() {
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        // --- ЛОГИ ДЛЯ ОТЛАДКИ ---
        console.log("--- СЫРЫЕ ДАННЫЕ ОТ TELEGRAM ---");
        console.log(JSON.stringify(data, null, 2));
        console.log("-------------------------------");

        if (data.result.length === 0) {
            console.log("⚠️ Telegram вернул пустой список. Бот не видит новых сообщений.");
        }

        const posts = data.result
            .filter(item => {
                const post = item.channel_post;
                if (!post) return false;

                // Проверяем, что приходит в логи: юзернейм или ID
                console.log(`Проверяю пост ID: ${post.message_id} от канала: ${post.chat.username || post.chat.id}`);

                return post.chat.username === CHANNEL_ID.replace('@', '') ||
                    post.chat.id.toString() === CHANNEL_ID;
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

        if (!fs.existsSync('./data')) fs.mkdirSync('./data');

        let existingNews = [];
        if (fs.existsSync('./data/news.json')) {
            const fileContent = fs.readFileSync('./data/news.json', 'utf8');
            existingNews = JSON.parse(fileContent || '[]');
        }

        const allNews = [...posts, ...existingNews];
        const uniqueNews = Array.from(new Map(allNews.map(item => [item.id, item])).values()).slice(0, 10);

        fs.writeFileSync('./data/news.json', JSON.stringify(uniqueNews, null, 2));
        console.log(`✅ Итог: сохранено постов - ${uniqueNews.length}`);

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

fetchTelegramNews();