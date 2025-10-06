// api/contact.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }
    return res.status(200).json({ success: true, message: 'Contact endpoint is alive' });
}
