const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const manifest = {
    id: "org.kanka.httpaddon",
    version: "1.3.0",
    name: "Kankas HTTP Multi-Stream (Vip Bypass)",
    description: "Hdfilmcehennemi ve FilmGecesi sitelerinden korumalı bypass akışı sağlar.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

// Ortak tarayıcı başlıkları (Bot engeline takılmamak için)
const getHeaders = (host) => ({
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Target-Host': host,
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
// REKORSAN TARAYICI: HDFILMCEHENNEMI
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

        const masterM3u8Regex = /(https:\/\/s[0-9]+\.rapidrame\.com\/hls2\/[^\s'"]+master\.m3u8[^\s'"]*)/i;
        const match = pageHtml.match(masterM3u8Regex);

        if (match && match[1]) {
            const cleanUrl = match[1].replace(/&amp;/g, '&');
            
            // Oynatıcının doğrudan okuyabilmesi için standart Header ekleme yöntemi (| Köprüsü)
            const finalStreamUrl = `${cleanUrl}|Referer=https://${host}/&User-Agent=Mozilla/5.0`;

            return {
                name: "🎬 HFC - Rapidrame",
                title: `Rapidrame [1080p Kesintisiz]`,
                url: finalStreamUrl,
                behaviorHints: {
                    notSupported: false
                }
            };
        }
    } catch (e) {
        console.error("HFC Tarama Hatası:", e.message);
    }
    return null;
}

// -------------------------------------------------------------------------
// REKORSAN TARAYICI: FILMGECESI
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
        
        const m3u8Regex = /(https:\/\/[^\s'"]+master\.m3u8[^\s'"]*)/i;
        const match = filmPageResponse.data.match(m3u8Regex);

        if (match && match[1]) {
            const cleanUrl = match[1].replace(/&amp;/g, '&');
            const finalStreamUrl = `${cleanUrl}|Referer=https://${host}/&User-Agent=Mozilla/5.0`;
            
            return {
                name: "🎥 FilmGecesi - VIP",
                title: `Rapidrame [HQ Kesintisiz]`,
                url: finalStreamUrl,
                behaviorHints: {
                    notSupported: false
                }
            };
        }
    } catch (e) {
        console.error("FilmGecesi Tarama Hatası:", e.message);
    }
    return null;
}

// ENDPOINT
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    const names = await getMovieNames(id);
    if (!names) return res.json({ streams: [] });

    console.log(`Gelen Talep -> ID: ${id} | İsim: ${names.trName}`);

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
app.listen(PORT, '0.0.0.0', () => console.log(`Eklenti hazır!`));
