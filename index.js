const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const manifest = {
    id: "org.kanka.httpaddon",
    version: "1.5.0",
    name: "Kankas HTTP Multi-Stream (Ultimate)",
    description: "Hdfilmcehennemi ve FilmGecesi korumalarını otomatik api ile bypass eder.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

const getHeaders = (host) => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
    'Referer': `https://${host}/`
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
// HDFILMCEHENNEMI AUTOMATIC BYPASS API
// -------------------------------------------------------------------------
async function scrapeHFC(imdbId, names) {
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
        const $page = cheerio.load(pageHtml);

        // Sayfa içerisindeki iframe elementlerinden rapidrame veya close olanları süzüyoruz
        let iframeSrc = $page('iframe[src*="rapidrame"], iframe[src*="close"], iframe[src*="video"]').first().attr('src');
        
        if (!iframeSrc && pageHtml.includes('iframe')) {
            const regex = /iframe[^>]+src=["']([^"']+)["']/i;
            const match = pageHtml.match(regex);
            if (match) iframeSrc = match[1];
        }

        if (iframeSrc) {
            if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;

            // Video şifrelerini sunucu tarafında çözen global bypass köprüsü
            const streamResolverUrl = `https://94.23.63{encodeURIComponent(iframeSrc)}`;

            return {
                name: "🎬 HFC - Premium Stream",
                title: `Multi-Player [1080p Otomatik Çözüm]`,
                url: streamResolverUrl
            };
        }
    } catch (e) {
        console.error("HFC Hata:", e.message);
    }
    return null;
}

// -------------------------------------------------------------------------
// FILMGECESI AUTOMATIC BYPASS API
// -------------------------------------------------------------------------
async function scrapeFilmGecesi(imdbId, names) {
    try {
        const host = 'www.filmgecesi.vip';
        const searchWord = imdbId || names.trName || names.enName;
        const searchUrl = `https://${host}/?s=${encodeURIComponent(searchWord)}`;

        const searchResponse = await axios.get(searchUrl, { headers: getHeaders(host), timeout: 5000 });
        const $ = cheerio.load(searchResponse.data);

        const filmLink = $('.film-content a, .poster a, a[href*="/film/"]').first().attr('href');
        if (!filmLink) return null;

        const filmPageResponse = await axios.get(filmLink, { headers: getHeaders(host), timeout: 5000 });
        const $page = cheerio.load(filmPageResponse.data);
        
        let iframeSrc = $page('iframe').first().attr('src');
        if (iframeSrc) {
            if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
            
            const streamResolverUrl = `https://94.23.63{encodeURIComponent(iframeSrc)}`;

            return {
                name: "🎥 FilmGecesi - Premium VIP",
                title: `Multi-Player [HQ Otomatik Çözüm]`,
                url: streamResolverUrl
            };
        }
    } catch (e) {
        console.error("FilmGecesi Hata:", e.message);
    }
    return null;
}

// STREAM GATEWAY
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    const names = await getMovieNames(id);
    if (!names) return res.json({ streams: [] });

    const tasks = [
        scrapeHFC(id, names),
        scrapeFilmGecesi(id, names)
    ];

    const results = await Promise.allSettled(tasks);
    
    const activeStreams = results
        .filter(res => res.status === 'fulfilled' && res.value !== null)
        .map(res => res.value);

    res.json({ streams: activeStreams });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Bypass API Sistemi Devrede.`));
