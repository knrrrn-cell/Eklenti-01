const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const manifest = {
    id: "org.kanka.httpaddon",
    version: "1.4.0",
    name: "Kankas HTTP Multi-Stream (Vip Pro)",
    description: "Hdfilmcehennemi ve FilmGecesi şifreli player kaynaklarını çözer.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

// Bot filtrelerine takılmamak için en gerçekçi mobil tarayıcı başlığı
const getHeaders = (host) => ({
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
    'Referer': `https://${host}/`,
    'Origin': `https://${host}`
});

async function getMovieNames(imdbId) {
    try {
        const response = await axios.get(`https://strem.io{imdbId}.json`, { timeout: 3000 });
        if (response.data && response.data.meta) {
            return {
                enName: response.data.meta.name,
                trName: response.data.meta.locale && response.data.meta.locale.tr ? response.data.meta.locale.tr.name : response.data.meta.name
            };
        }
    } catch (e) {
        console.error("Cinemeta hatası:", e.message);
    }
    return null;
}

// -------------------------------------------------------------------------
// ŞİFRE ÇÖZÜCÜ MOTOR (Base64 ve Karmaşık Kod Çözücü)
// -------------------------------------------------------------------------
function extractPackedM3u8(htmlContent) {
    // 1. Aşama: Sayfa içine gömülü çıplak m3u8 linklerini tara
    const directM3u8Regex = /(https:\/\/[^\s'"]+master\.m3u8[^\s'"]*)/i;
    let match = htmlContent.match(directM3u8Regex);
    if (match) return match[1].replace(/&amp;/g, '&');

    // 2. Aşama: Sitelerin video linkini gizlediği Base64 şifreli blokları tara (Gelişmiş Koruma Kırıcı)
    const base64Regex = /["'](ey[a-zA-Z0-9_-]{10,}=*)["']/g;
    let b64Match;
    while ((b64Match = base64Regex.exec(htmlContent)) !== null) {
        try {
            const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
            if (decoded.includes('master.m3u8') || decoded.includes('.m3u8')) {
                const subMatch = decoded.match(/(https:\/\/[^\s'"]+master\.m3u8[^\s'"]*)/i);
                if (subMatch) return subMatch[1].replace(/&amp;/g, '&');
            }
        } catch (e) {}
    }
    return null;
}

// -------------------------------------------------------------------------
// SOURCE 1: HDFILMCEHENNEMI (Işık Hızı + Kilit Kırıcı)
// -------------------------------------------------------------------------
async function fastScrapeHFC(imdbId, names) {
    try {
        const host = 'www.hdfilmcehennemi.land';
        const searchWord = imdbId || names.trName || names.enName;
        const searchUrl = `https://${host}/?s=${encodeURIComponent(searchWord)}`;
        
        const searchResponse = await axios.get(searchUrl, { headers: getHeaders(host), timeout: 5000 });
        const $ = cheerio.load(searchResponse.data);
        
        const filmLink = $('.poster a').first().attr('href');
        if (!filmLink) return null;

        const filmPageResponse = await axios.get(filmLink, { headers: getHeaders(host), timeout: 5000 });
        const pageHtml = filmPageResponse.data;

        // Şifre çözücü motorumuzu tetikliyoruz
        const streamUrl = extractPackedM3u8(pageHtml);

        if (streamUrl) {
            // Nuvio'nun linki doğrulaması için zorunlu Referer pipe köprüsü
            const finalStreamUrl = `${streamUrl}|Referer=https://${host}/&User-Agent=Mozilla/5.0`;
            return {
                name: "🎬 HFC - Rapidrame",
                title: `Rapidrame [1080p Aktif Akış]`,
                url: finalStreamUrl
            };
        }
    } catch (e) {
        console.error("HFC Hatası:", e.message);
    }
    return null;
}

// -------------------------------------------------------------------------
// SOURCE 2: FILMGECESI (Işık Hızı + Kilit Kırıcı)
// -------------------------------------------------------------------------
async function fastScrapeFilmGecesi(imdbId, names) {
    try {
        const host = 'www.filmgecesi.vip';
        const searchWord = imdbId || names.trName || names.enName;
        const searchUrl = `https://${host}/?s=${encodeURIComponent(searchWord)}`;

        const searchResponse = await axios.get(searchUrl, { headers: getHeaders(host), timeout: 5000 });
        const $ = cheerio.load(searchResponse.data);

        const filmLink = $('.film-content a, .poster a, a[href*="/film/"]').first().attr('href');
        if (!filmLink) return null;

        const filmPageResponse = await axios.get(filmLink, { headers: getHeaders(host), timeout: 5000 });
        const streamUrl = extractPackedM3u8(filmPageResponse.data);

        if (streamUrl) {
            const finalStreamUrl = `${streamUrl}|Referer=https://${host}/&User-Agent=Mozilla/5.0`;
            return {
                name: "🎥 FilmGecesi - VIP",
                title: `Rapidrame [HQ Aktif Akış]`,
                url: finalStreamUrl
            };
        }
    } catch (e) {
        console.error("FilmGecesi Hatası:", e.message);
    }
    return null;
}

// STREAM GATEWAY
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    const names = await getMovieNames(id);
    if (!names) return res.json({ streams: [] });

    console.log(`İstek İşleniyor -> ID: ${id} | İsim: ${names.trName}`);

    const tasks = [
        fastScrapeHFC(id, names),
        fastScrapeFilmGecesi(id, names)
    ];

    const results = await Promise.allSettled(tasks);
    
    const activeStreams = results
        .filter(res => res.status === 'fulfilled' && res.value !== null)
        .map(res => res.value);

    res.json({ streams: activeStreams });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Kilit kırıcı sistem aktif duruma getirildi.`));
