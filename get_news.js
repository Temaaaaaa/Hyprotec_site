const fs = require('fs');

const TOKEN = process.env.TG_TOKEN;
const CHANNEL_ID = '@okaasdf_bot'; // Проверь, что это точный юзернейм канала

async function fetchTelegramNews() {
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        const posts = data.result
            .filter(item => {
                const post = item.channel_post;
                return post && (post.chat.username === CHANNEL_ID.replace('@', ''));
            })
            .map(item => {
                const post = item.channel_post;
                // ТУТ ИСПРАВЛЕНИЕ: берем либо текст, либо подпись под фото
                return {
                    id: post.message_id,
                    text: post.text || post.caption || "",
                    date: post.date
                };
            })
            .filter(post => post.text.length > 0)
            .reverse();

        if (!fs.existsSync('./data')) fs.mkdirSync('./data');

        let existingNews = [];
        if (fs.existsSync('./data/news.json')) {
            const fileContent = fs.readFileSync('./data/news.json', 'utf8');
            existingNews = JSON.parse(fileContent || '[]');
        }

        const allNews = [...posts, ...existingNews];
        const uniqueNews = Array.from(new Map(allNews.map(item => [item.id, item])).values())
            .slice(0, 10);

        fs.writeFileSync('./data/news.json', JSON.stringify(uniqueNews, null, 2));
        console.log(`✅ Найдено постов: ${posts.length}`);

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

fetchTelegramNews();