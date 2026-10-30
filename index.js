const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const manifest = {
    id: "org.kanka.httpaddon",
    version: "1.2.0",
    name: "Kankas HTTP Multi-Stream (Kilit Kırıcı)",
    description: "Referer korumalı HTTP sitelerinden güvenli akış sağlar.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

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
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
        const searchWord = imdbId || names.trName || names.enName;
        const searchUrl = `https://hdfilmcehennemi.land{encodeURIComponent(searchWord)}`;
        
        const searchResponse = await axios.get(searchUrl, { headers: { 'User-Agent': userAgent }, timeout: 4000 });
        const $ = cheerio.load(searchResponse.data);
        
        const filmLink = $('.poster a').first().attr('href');
        if (!filmLink) return null;

        const filmPageResponse = await axios.get(filmLink, { headers: { 'User-Agent': userAgent }, timeout: 4000 });
        const pageHtml = filmPageResponse.data;

        // Gelişmiş kaynak yakalayıcı Regex formülü
        const masterM3u8Regex = /(https:\/\/s[0-9]+\.rapidrame\.com\/hls2\/[^\s'"]+master\.m3u8[^\s'"]*)/i;
        const match = pageHtml.match(masterM3u8Regex);

        if (match && match[1]) {
            const cleanUrl = match[1].replace(/&amp;/g, '&');
            return {
                name: "🎬 HFC - Rapidrame",
                title: `Rapidrame [1080p Korumalı Aktarım]`,
                url: cleanUrl,
                // NUVIO / STREMIO OYNATICISINA GİZLİ ŞİFREYI GÖNDERİYORUZ:
                behaviorHints: {
                    notSupported: false,
                    proxyHeaders: {
                        "request": {
                            "User-Agent": userAgent,
                            "Referer": "https://hdfilmcehennemi.land",
                            "Origin": "https://hdfilmcehennemi.land"
                        }
                    }
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
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
        const searchWord = imdbId || names.trName || names.enName;
        const searchUrl = `https://filmgecesi.vip{encodeURIComponent(searchWord)}`;

        const searchResponse = await axios.get(searchUrl, { headers: { 'User-Agent': userAgent }, timeout: 4000 });
        const $ = cheerio.load(searchResponse.data);

        const filmLink = $('.film-content a, .poster a, a[href*="/film/"]').first().attr('href');
        if (!filmLink) return null;

        const filmPageResponse = await axios.get(filmLink, { headers: { 'User-Agent': userAgent }, timeout: 4000 });
        
        const m3u8Regex = /(https:\/\/[^\s'"]+master\.m3u8[^\s'"]*)/i;
        const match = filmPageResponse.data.match(m3u8Regex);

        if (match && match[1]) {
            const cleanUrl = match[1].replace(/&amp;/g, '&');
            return {
                name: "🎥 FilmGecesi - VIP",
                title: `Rapidrame [HQ Korumalı Aktarım]`,
                url: cleanUrl,
                behaviorHints: {
                    notSupported: false,
                    proxyHeaders: {
                        "request": {
                            "User-Agent": userAgent,
                            "Referer": "https://filmgecesi.vip",
                            "Origin": "https://filmgecesi.vip"
                        }
                    }
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
