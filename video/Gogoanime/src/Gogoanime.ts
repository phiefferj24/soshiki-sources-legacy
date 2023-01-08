import { createEntry, createEntryResults, createVideoEpisodeDetails, Entry, EntryContentRating, EntryResults, EntryResultsInfo, EntryStatus, FetchOptions, Listing, VideoEpisode, VideoEpisodeDetails, VideoSource, Filter, Document, createShortEntry, fetch, createMultiSelectFilter, createSortFilter, MultiSelectFilter, SortFilter, ShortEntry, createListing, createVideoEpisode, VideoEpisodeType, VideoEpisodeUrl, VideoEpisodeUrlType, createVideoEpisodeProvider, VideoEpisodeProvider, createSegmentFilter } from "soshiki-sources"
import CryptoJS from "crypto-es"

const BASE_URL = "https://www1.gogoanime.bid"
const AJAX_URL = "https://ajax.gogo-load.com"

const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36'
const GOGO_KEYS = {
    key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
    secondKey: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
    iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
}

const STREAMSB_HOST = 'https://streamsss.net/sources49'
const STREAMSB_PAYLOAD_START = '41794e71437657784e6845657c7c'
const STREAMSB_PAYLOAD_END = '7c7c393579706a5471624b707a567c7c73747265616d7362'

let mappings: {[key: string]: {[key2: string]: string}} = {}

export default class GogoanimeSource extends VideoSource {
    async getListing(previousInfo: EntryResultsInfo | null, listing: Listing): Promise<EntryResults> {
        const page = previousInfo === null ? 1 : previousInfo.page + 1
        let entries: ShortEntry[] = []

        if (listing.id === 'popular' || listing.id === '') {
            const document = Document.parse(await fetch(`${AJAX_URL}/ajax/page-recent-release-ongoing.html?page=${page}`).then(res => `<html>${res.data}</html>`))
            const items = document.querySelectorAll("div.added_series_body > ul > li")
            for (const item of items) {
                const children = item.children
                entries.push(createShortEntry({
                    id: children[0].getAttribute("href"),
                    title: children[1].innerText.trim(),
                    subtitle: children[3].innerText.trim(),
                    cover: children[0].querySelector("div").style.match(/https?:\/\/[^']*/)?.[0] ?? ""
                }))
            }
            document.free();
        } else {
            const document = Document.parse(await fetch(`${AJAX_URL}/ajax/page-recent-release.html?page=${page}&type=${listing.id}`).then(res => `<html>${res.data}</html>`))
            const items = document.querySelectorAll("div.last_episodes ul.items > li")
            for (const item of items) {
                entries.push(createShortEntry({
                    id: item.querySelector("a").getAttribute("href"),
                    title: item.querySelector("p.name").innerText.trim(),
                    subtitle: item.querySelector("p.episode").innerText.trim(),
                    cover: item.querySelector("img").getAttribute("src")
                }))
            }
            document.free();
        }
        return createEntryResults({
            page,
            entries,
            hasMore: entries.length > 0
        })
    }
    async getSearchResults(previousInfo: EntryResultsInfo | null, query: string, filters: Filter[]): Promise<EntryResults> {
        const page = previousInfo === null ? 1 : previousInfo.page + 1
        let url = `${BASE_URL}/filter.html?keyword=${encodeURIComponent(query)}&page=${page}`
        for (const filter of filters) {
            if (filter.type === 'sort') {
                url += `&${mappings[filter.id][(filter as SortFilter).value ?? 'Name A-Z'] }`
            } else if (filter.type === 'multiSelect') {
                for (const value of (filter as MultiSelectFilter).value) url += `&${mappings[filter.id][value]}`
            }
        }
        const document = Document.parse(await fetch(url).then(res => res.data))
        const items = document.querySelectorAll("ul.items > li")
        let entries: ShortEntry[] = []
        for (const item of items) {
            const e = createShortEntry({
                id: item.querySelector("a").getAttribute("href"),
                title: item.querySelector("p.name").innerText.trim(),
                subtitle: item.querySelector("p.released").innerText.trim(),
                cover: item.querySelector("img").getAttribute("src")
            })
            entries.push(e)
        }
        document.free()
        return createEntryResults({
            page,
            entries,
            hasMore: entries.length > 0
        })
    }
    parseEntryStatus(status: string): EntryStatus {
        switch (status) {
            case 'Ongoing': return EntryStatus.ongoing
            case 'Completed': return EntryStatus.completed
            default: return EntryStatus.unknown
        }
    }
    async getEntry(id: string): Promise<Entry> {
        const document = Document.parse(await fetch(`${BASE_URL}${id}`).then(res => res.data))
        const info = document.querySelector("div.anime_info_body_bg")
        const types = info.querySelectorAll("p.type")
        const entry = createEntry({
            id,
            title: info.querySelector("h1").innerText.trim(),
            staff: [],
            tags: types[2].querySelectorAll("a").map(e => e.innerText.replace(", ", "")),
            cover: info.querySelector("img").getAttribute("src"),
            nsfw: EntryContentRating.safe,
            status: this.parseEntryStatus(types[4].querySelector("a").innerText),
            url: `${BASE_URL}${id}`,
            description: types[1].innerText.substring('Plot Summary: '.length).trim()
        })
        document.free()
        return entry
    }
    async getEpisodes(id: string): Promise<VideoEpisode[]> {
        const document = Document.parse(await fetch(`${BASE_URL}${id}`).then(res => res.data))
        const ajaxId = document.getElementById("movie_id").getAttribute("value")
        document.free()
        const document2 = Document.parse(await fetch(`${AJAX_URL}/ajax/load-list-episode?ep_start=0&ep_end=1000000&id=${ajaxId}`).then(res => `<html>${res.data}</html>`))
        let episodes: VideoEpisode[] = []
        for (const episode of document2.querySelectorAll("ul#episode_related > li > a")) {
            const href = episode.getAttribute("href").trim()
            const typeText = episode.querySelector("div.cate").innerText.toLowerCase()
            episodes.push(createVideoEpisode({
                id: href,
                entryId: id,
                episode: parseFloat(href.match(/(?:.*?)(\d+)/)?.[1] ?? "0"),
                type: typeText === 'sub' ? VideoEpisodeType.sub : typeText === 'dub' ? VideoEpisodeType.dub : VideoEpisodeType.unknown
            }))
        }
        document2.free()
        return episodes
    }
    async getEpisodeDetails(id: string, entryId: string): Promise<VideoEpisodeDetails> {
        const document = Document.parse(await fetch(`${BASE_URL}${id}`).then(res => res.data))
        const gogoServerUrl = `https:${document.querySelector("div#load_anime > div > div > iframe").getAttribute("src")}`
        const vidStreamingServerUrl = `https:${document.querySelector("div.anime_video_body > div.anime_muti_link > ul > li.vidcdn > a").getAttribute("data-video")}`
        const streamSBServerUrl = `${document.querySelector("div.anime_video_body > div.anime_muti_link > ul > li.streamsb > a").getAttribute("data-video")}`
        document.free()

        let promises: Promise<VideoEpisodeProvider>[] = []
        if (gogoServerUrl.match(URL_REGEX) !== null) {
            promises.push((async () => createVideoEpisodeProvider({
                name: "GogoCDN",
                urls: await this.getGogoCDNUrls(gogoServerUrl)
            }))())
        }
        if (vidStreamingServerUrl.match(URL_REGEX) !== null) {
            promises.push((async () => createVideoEpisodeProvider({
                name: "Vidstreaming",
                urls: await this.getGogoCDNUrls(vidStreamingServerUrl)
            }))())
        }
        if (streamSBServerUrl.match(URL_REGEX) !== null) {
            promises.push((async () => createVideoEpisodeProvider({
                name: "StreamSB",
                urls: await this.getStreamSBUrls(streamSBServerUrl)
            }))())
        }
        const providers = (await Promise.all(promises)).sort((a, b) => a.name === getSettingsValue("preferredProvider") ? -1 : b.name === getSettingsValue("preferredProvider") ? 1 : 0)

        return createVideoEpisodeDetails({
            id,
            entryId,
            providers
        })
    }
    async getFilters(): Promise<Filter[]> {
        let document = Document.parse(await fetch(`${BASE_URL}/filter.html`).then(res => res.data))
        let genres = document.querySelectorAll("div.cls_genre > ul > li").map(el => { return { id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`, name: el.innerText} })
        let countries = document.querySelectorAll("div.cls_country > ul > li").map(el => { return { id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`, name: el.innerText} })
        let seasons = document.querySelectorAll("div.cls_season > ul > li").map(el => { return { id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`, name: el.innerText} })
        let years = document.querySelectorAll("div.cls_year > ul > li").map(el => { return { id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`, name: el.innerText} })
        let types = document.querySelectorAll("div.cls_type > ul > li").map(el => { return { id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`, name: el.innerText} })
        let statuses = document.querySelectorAll("div.cls_status > ul > li").map(el => { return { id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`, name: el.innerText} })
        let sort = document.querySelectorAll("div.cls_sort > ul > li").map(el => { return { id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`, name: el.innerText} })
        document.free()
        mappings["genre"] = {}
        genres.forEach(genre => mappings["genre"][genre.name] = genre.id)
        mappings["country"] = {}
        countries.forEach(country => mappings["country"][country.name] = country.id)
        mappings["season"] = {}
        seasons.forEach(season => mappings["season"][season.name] = season.id)
        mappings["year"] = {}
        years.forEach(year => mappings["year"][year.name] = year.id)
        mappings["type"] = {}
        types.forEach(type => mappings["type"][type.name] = type.id)
        mappings["status"] = {}
        statuses.forEach(status => mappings["status"][status.name] = status.id)
        mappings["sort"] = {}
        sort.forEach(option => mappings["sort"][option.name] = option.id)
        return [
            createSortFilter({
                id: "sort",
                value: sort[0].name,
                name: "Sort",
                selections: sort.map(x => x.name)
            }),
            createMultiSelectFilter({
                id: "genre",
                value: [],
                name: "Genre",
                selections: genres.map(x => x.name)
            }),
            createMultiSelectFilter({
                id: "country",
                value: [],
                name: "Country",
                selections: countries.map(x => x.name)
            }),
            createMultiSelectFilter({
                id: "season",
                value: [],
                name: "Season",
                selections: seasons.map(x => x.name)
            }),
            createMultiSelectFilter({
                id: "year",
                value: [],
                name: "Year",
                selections: seasons.map(x => x.name)
            }),
            createMultiSelectFilter({
                id: "type",
                value: [],
                name: "Type",
                selections: seasons.map(x => x.name)
            }),
            createMultiSelectFilter({
                id: "season",
                value: [],
                name: "Status",
                selections: seasons.map(x => x.name)
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "1",
                name: "Recent"
            }),
            createListing({
                id: "2",
                name: "Dub"
            }),
            createListing({
                id: "3",
                name: "Chinese"
            }),
            createListing({
                id: "popular",
                name: "Popular"
            })
        ]
    }
    async getSettings(): Promise<Filter[]> {
        return [
            createSegmentFilter({
                id: "preferredProvider",
                value: "GogoCDN",
                name: "Preferred Provider",
                selections: ["GogoCDN", "Vidstreaming", "StreamSB"]
            })
        ]
    }
    async modifyVideoRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions; }> {
        let newHeaders: {[key: string]: string} = {
            Referer: url.match(/([^\?]*)\?(.*)/)?.[1] ?? ""
        }
        if (url.includes("akamai-cdn-content.com")) { // streamsb
            newHeaders["watchsb"] = "streamsb"
            newHeaders["User-Agent"] = USER_AGENT
        }
        return {
            url,
            options: {
                headers: {
                    ...newHeaders,
                    ...options.headers ?? {}
                },
                ...options ?? {}
            }
        }
    }

    async getGogoCDNUrls(serverUrl: string): Promise<VideoEpisodeUrl[]> {
        const document = Document.parse(await fetch(serverUrl).then(res => res.data))

        const id = serverUrl.match(/([^\?]*)\?(.*)/)?.[2].split('&').find(e => e.split('=')[0] === 'id')?.split('=')[1] ?? ''
        const encryptedKey = CryptoJS.AES.encrypt(id, GOGO_KEYS.key, { iv: GOGO_KEYS.iv })
        const scriptValue = document.querySelector("script[data-name='episode']").getAttribute("data-value")
        const decryptedToken = CryptoJS.AES.decrypt(scriptValue, GOGO_KEYS.key, { iv: GOGO_KEYS.iv }).toString(CryptoJS.enc.Utf8)
        const encryptedAjaxParams = `id=${encryptedKey}&alias=${id}&${decryptedToken}`
        
        document.free()
        
        const encryptedData = await fetch(`${serverUrl.match(/(https?:)[^\?]*\?.*/)?.[1] ?? 'https:'}//${serverUrl.match(/https?:\/\/([^\/]*)/)?.[1] ?? ''}/encrypt-ajax.php?${encryptedAjaxParams}`, { 
            headers: { "X-Requested-With": "XMLHttpRequest" }
        }).then(res => { try { return JSON.parse(res.data).data } catch { return null } })
        if (encryptedData === null) return []

        const decryptedData = JSON.parse(
            CryptoJS.enc.Utf8.stringify(
                CryptoJS.AES.decrypt(encryptedData, GOGO_KEYS.secondKey, { iv: GOGO_KEYS.iv })
            )
        )
        
        if (!decryptedData.source) return []
        
        let episodes: VideoEpisodeUrl[] = []
        if (decryptedData.source[0].file.includes('.m3u8')) {
            const res = await fetch(decryptedData.source[0].file.toString()).then(res => res.data)
            const resolutions = res.match(/(RESOLUTION=)(.*)(\s*?)(\s*.*)/g);
            (resolutions ?? []).forEach((resolution: string) => {
                const index = decryptedData.source[0].file.lastIndexOf('/')
                const quality = resolution.split('\n')[0].split('x')[1].split(',')[0]
                const url = decryptedData.source[0].file.slice(0, index)
                episodes.push({
                    url: url + '/' + resolution.split('\n')[1],
                    type: (url + resolution.split('\n')[1]).includes('.m3u8') ? VideoEpisodeUrlType.hls : VideoEpisodeUrlType.video,
                    quality: parseFloat(quality)
                })
            })

            decryptedData.source.forEach((source: any) => {
                episodes.push({
                    url: source.file,
                    type: source.file.includes('.m3u8') ? VideoEpisodeUrlType.hls : VideoEpisodeUrlType.video
                })
            })
        } else {
            decryptedData.source.forEach((source: any) => {
                episodes.push({
                    url: source.file,
                    type: source.file.includes('.m3u8') ? VideoEpisodeUrlType.hls : VideoEpisodeUrlType.video,
                    quality: parseFloat(source.label.split(' ')[0])
                })
            })
        }
      
        decryptedData.source_bk.forEach((source: any) => {
            episodes.push({
                url: source.file,
                type: source.file.includes('.m3u8') ? VideoEpisodeUrlType.hls : VideoEpisodeUrlType.video
            })
        })

        return episodes
    }

    async getStreamSBUrls(serverUrl: string): Promise<VideoEpisodeUrl[]> {
        let id = serverUrl.split('/e/').pop()
        if (id?.includes("html")) id = id.split('.html')[0]
        if (typeof id === 'undefined') return []
        let hexEncoded = ""
        for (let i = 0; i < id.length; ++i) hexEncoded += ("0"+id.charCodeAt(i).toString(16)).slice(-2)
        const res = await fetch(`${STREAMSB_HOST}/${STREAMSB_PAYLOAD_START}${hexEncoded}${STREAMSB_PAYLOAD_END}`, {
            headers: {
                'watchsb': 'sbstream',
                'User-Agent': USER_AGENT,
                'Referer': serverUrl
            }
        }).then(res => { try { return JSON.parse(res.data) } catch { return null } }).catch(() => null)
        if (!res.stream_data) return []
        const m3u8Urls = await fetch(res.stream_data.file, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': serverUrl.split("e/")[0],
                'Accept-Language': 'en-US,en;q=0.9'
            },
        }).then(res => res.data).catch(() => null)

        if (m3u8Urls === null) return []
      
        const videoList = m3u8Urls.split('#EXT-X-STREAM-INF:')
      
        let urls: VideoEpisodeUrl[] = []
        for (const video of videoList ?? []) {
            if (!video.includes('m3u8')) continue

            const url = video.split('\n')[1]
            const quality = video.split('RESOLUTION=')[1].split(',')[0].split('x')[1]
            urls.push({
                url: url,
                quality: parseFloat(quality),
                type: VideoEpisodeUrlType.hls
            })
        }

        urls.push({
            url: res.stream_data.file,
            type: res.stream_data.file.includes('.m3u8') ? VideoEpisodeUrlType.hls : VideoEpisodeUrlType.video
        })

        return urls
    }
}