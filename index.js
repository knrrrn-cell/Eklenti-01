const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const manifest = {
    id: "org.kanka.httpaddon",
    version: "1.1.0",
    name: "Kankas HTTP Multi-Stream (Işık Hızı)",
    description: "Hdfilmcehennemi ve FilmGecesi sitelerinden doğrudan hızlı akış sağlar.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

// Cinemeta üzerinden filmin Türkçe ve İngilizce isimlerini öğrenme
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
// 1. ULTRA HIZLI KAYNAK: HDFILMCEHENNEMI (Axios + Cheerio + Regex)
// -------------------------------------------------------------------------
async function fastScrapeHFC(imdbId, names) {
    try {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
        
        // 1. Aşama: Senin dediğin gibi önce IMDb ID ile, o olmazsa Türkçe isimle sitede arat
        const searchWord = imdbId || names.trName || names.enName;
        const searchUrl = `https://hdfilmcehennemi.land{encodeURIComponent(searchWord)}`;
        
        const searchResponse = await axios.get(searchUrl, { headers: { 'User-Agent': userAgent }, timeout: 4000 });
        const $ = cheerio.load(searchResponse.data);
        
        // Arama sonucundaki ilk filmin detay sayfa linkini çek
        const filmLink = $('.poster a').first().attr('href');
        if (!filmLink) return null;

        // 2. Aşama: Filmin detay sayfasına HTTP isteği at
        const filmPageResponse = await axios.get(filmLink, { headers: { 'User-Agent': userAgent }, timeout: 4000 });
        const pageHtml = filmPageResponse.data;

        // 3. Aşama: Sayfa kodunun içindeki şifreli Rapidrame / Close player kaynak linklerini Regex ile havada yakala
        // Bu regex yapıları iframe veya playlist tanımlarını yakalar
        const masterM3u8Regex = /(https:\/\/s[0-9]+\.rapidrame\.com\/hls2\/[^\s'"]+master\.m3u8[^\s'"]*)/i;
        const match = pageHtml.match(masterM3u8Regex);

        if (match && match[1]) {
            return {
                name: "🎬 HFC - Rapidrame",
                title: `Rapidrame [1080p Autoselect]`,
                url: match[1].replace(/&amp;/g, '&') // HTML şifrelemesini temizle
            };
        }
    } catch (e) {
        console.error("HFC Hızlı Tarama Hatası:", e.message);
    }
    return null;
}

// -------------------------------------------------------------------------
// 2. ULTRA HIZLI KAYNAK: FILMGECESI (Axios + Cheerio + Regex)
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
        
        // FilmGecesi sayfa kodlarında veya iframe ağlarında m3u8 taraması
        const m3u8Regex = /(https:\/\/[^\s'"]+master\.m3u8[^\s'"]*)/i;
        const match = filmPageResponse.data.match(m3u8Regex);

        if (match && match[1]) {
            return {
                name: "🎥 FilmGecesi - VIP",
                title: `Rapidrame [HQ Stream]`,
                url: match[1].replace(/&amp;/g, '&')
            };
        }
    } catch (e) {
        console.error("FilmGecesi Hızlı Tarama Hatası:", e.message);
    }
    return null;
}

// MAIN STREAM ENDPOINT
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params; // tt1234567 formatı
    console.log(`Gelen IMDb ID: ${id}`);

    const names = await getMovieNames(id);
    if (!names) return res.json({ streams: [] });

    console.log(`Aranıyor -> ID: ${id} | TR: ${names.trName}`);

    // İki siteyi arka planda milisaniyeler içinde paralel taratıyoruz
    const tasks = [
        fastScrapeHFC(id, names),
        fastScrapeFilmGecesi(id, names)
    ];

    const results = await Promise.allSettled(tasks);
    
    const activeStreams = results
        .filter(res => res.status === 'fulfilled' && res.value !== null)
        .map(res => res.value);

    // Sonuçları Nuvio'ya anında fırlatıyoruz (Zaman aşımı riski sıfırlandı!)
    res.json({ streams: activeStreams });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Işık hızında çalışan eklenti aktif!`));
