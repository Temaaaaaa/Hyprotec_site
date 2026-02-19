const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TG_TOKEN;
const CHANNEL_ID = "-1003859497665";
const NEWS_IMAGE_PATH = './images/news'; // Путь к твоим картинкам

// Функция для скачивания файла
async function downloadFile(fileId, fileName) {
    try {
        const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
        const res = await fetch(getFileUrl);
        const data = await res.json();

        if (data.ok) {
            const filePath = data.result.file_path;
            const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

            const fileRes = await fetch(downloadUrl);
            const buffer = await fileRes.arrayBuffer();

            // Проверяем, существует ли папка, если нет — создаем
            if (!fs.existsSync(NEWS_IMAGE_PATH)) {
                fs.mkdirSync(NEWS_IMAGE_PATH, { recursive: true });
            }

            const finalPath = path.join(NEWS_IMAGE_PATH, fileName);
            fs.writeFileSync(finalPath, Buffer.from(buffer));

            // Возвращаем путь, который будет работать в HTML (относительно корня)
            return `images/news/${fileName}`;
        }
    } catch (e) {
        console.error('Ошибка при скачивании фото:', e.message);
    }
    return null;
}

async function fetchTelegramNews() {
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) throw new Error(data.description);

        // Используем Promise.all, так как внутри map теперь есть асинхронное скачивание фото
        const posts = await Promise.all(data.result
            .filter(item => {
                const post = item.channel_post;
                return post && String(post.chat.id) === String(CHANNEL_ID);
            })
            .map(async item => {
                const post = item.channel_post;
                let imagePath = null;

                // Если в посте есть фото
                if (post.photo && post.photo.length > 0) {
                    // Telegram присылает массив разных размеров, берем последний (самый большой)
                    const photo = post.photo[post.photo.length - 1];
                    const fileName = `news_${post.message_id}.jpg`;
                    imagePath = await downloadFile(photo.file_id, fileName);
                }

                return {
                    id: post.message_id,
                    text: post.text || post.caption || "Без текста",
                    date: new Date(post.date * 1000).toLocaleDateString('ru-RU'),
                    image: imagePath // Ссылка на локальный файл в images/news/
                };
            }));

        // Логика сохранения в JSON (уже проверенная тобой)
        if (!fs.existsSync('./data')) fs.mkdirSync('./data');

        let existingNews = [];
        if (fs.existsSync('./data/news.json')) {
            try {
                existingNews = JSON.parse(fs.readFileSync('./data/news.json', 'utf8') || '[]');
            } catch (e) { existingNews = []; }
        }

        const allNews = [...posts, ...existingNews];
        const uniqueNews = Array.from(new Map(allNews.map(item => [item.id, item])).values()).slice(0, 10);

        fs.writeFileSync('./data/news.json', JSON.stringify(uniqueNews, null, 2));

        console.log(`✅ Обработано. Новостей с фото: ${posts.filter(p => p.image).length}`);
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

fetchTelegramNews();