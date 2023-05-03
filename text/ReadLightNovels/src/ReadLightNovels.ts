import { Entry, EntryResults, EntryResultsInfo, Filter, Listing, TextChapter, TextChapterDetails, TextSource, fetch, Document, ShortEntry, createShortEntry, createEntryResults, createEntry, EntryStatus, EntryContentRating, createTextChapter, createTextChapterDetails, createSelectFilter } from "soshiki-sources"

const BASE_URL = "https://readlightnovels.net"
const AJAX_URL = "https://readlightnovels.net/wp-admin/admin-ajax.php"

export default class ReadLightNovelsSource extends TextSource {
    id = "en_readlightnovels"
    async getListing(previousInfo: EntryResultsInfo | null, listing: Listing): Promise<EntryResults> {
        const page = previousInfo?.page ?? 1
        const url = `${BASE_URL}/${listing.id === 'completed' ? 'completed' : 'latest'}/page/${page}`
        const document = await fetch(url).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.home-truyendecu > a")
        let entries: ShortEntry[] = []
        for (const item of items) {
            const id = item.getAttribute("href")
            if (id.match(/id(\d+)\.html$/) !== null) continue
            entries.push(createShortEntry({
                id,
                title: item.getAttribute("title"),
                subtitle: "",
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        document.free()
        return createEntryResults({
            page,
            hasMore: items.length > 0,
            entries
        })
    }
    async getSearchResults(previousInfo: EntryResultsInfo | null, query: string, filters: Filter[]): Promise<EntryResults> {
        const page = previousInfo?.page ?? 1
        let url = BASE_URL
        if (filters[0] && filters[0].value) url += `/${(filters[0].value as string).toLowerCase().replace(" ", "-")}`
        url += `/page/${page}?s=${encodeURIComponent(query)}`
        const document = await fetch(url).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.home-truyendecu > a")
        let entries: ShortEntry[] = []
        for (const item of items) {
            const id = item.getAttribute("href")
            if (id.match(/id(\d+)\.html$/) !== null) continue
            entries.push(createShortEntry({
                id,
                title: item.getAttribute("title"),
                subtitle: "",
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        document.free()
        return createEntryResults({
            page,
            hasMore: items.length > 0,
            entries
        })
    }
    async getEntry(id: string): Promise<Entry> {
        const document = await fetch(id, {
            headers: {
                "Referer": "https://readlightnovels.net/"
            }
        }).then(res => Document.parse(res.data))
        const info = document.querySelectorAll("div.info > div")
        const entry = createEntry({
            id,
            title: document.querySelector("h3.title").innerText,
            staff: [info[0].querySelector("a").innerText],
            tags: info[1].querySelectorAll("a").map(el => el.innerText),
            cover: document.querySelector("div.book > img").getAttribute("src"),
            nsfw: EntryContentRating.safe,
            status: info[2].querySelector("a").innerText === 'On Going' ? EntryStatus.ongoing : EntryStatus.completed,
            url: id,
            description: document.querySelector("div.desc-text").innerText
        })
        document.free()
        return entry
    }
    async getChapters(id: string): Promise<TextChapter[]> {
        let chapters: TextChapter[] = []
        const doc = await fetch(id).then(res => Document.parse(res.data))
        const ajaxId = doc.querySelector("input#id_post").getAttribute("value")
        doc.free()
        for (let page = 1; true; ++page) {
            const document = await fetch(AJAX_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: `action=tw_ajax&type=pagination&id=${ajaxId}&page=${page}`
            }).then(res => Document.parse(JSON.parse(res.data).list_chap)).catch(() => null)
            if (document === null) break
            const newChapters = document.querySelectorAll("ul.list-chapter > li > a").map(el => createTextChapter({
                id: el.getAttribute("href"),
                entryId: id,
                chapter: parseFloat(el.getAttribute("title").match(/Chapter (\d+).*/)?.[1] ?? "0"),
                volume: isNaN(parseFloat(el.getAttribute("title").match(/Volume (\d+).*/)?.[1] ?? "")) ? undefined : parseFloat(el.getAttribute("title").match(/Volume (\d+).*/)?.[1] ?? ""),
                name: el.innerText.match(/(?:Volume \d+ )?(?:Chapter \d+(?: - )?)?([^-]*)/)?.[1].split(' ').map(str=> str.charAt(0).toUpperCase() + str.substring(1)).join(' ') ?? undefined
            }))
            document.free()
            if (newChapters.length === 0) break
            chapters.push(...newChapters)
        }
        return chapters.reverse()
    }
    async getChapterDetails(id: string, entryId: string): Promise<TextChapterDetails> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const html = document.querySelector("div.chapter-content").innerHTML
        document.free()
        return createTextChapterDetails({
            id,
            entryId,
            html
        })
    }
    async getFilters(): Promise<Filter[]> {
        const document = await fetch(BASE_URL).then(res => Document.parse(res.data))
        const genres = document.querySelectorAll("ul.navbar-nav > li")[1].querySelectorAll("div > ul > li > a").map(el => el.title)
        document.free()
        return [
            createSelectFilter({
                id: "genre",
                name: "Genre",
                value: null,
                selections: genres
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            {
                id: 'latest',
                name: 'Latest'
            },
            {
                id: 'completed',
                name: 'Completed'
            }
        ]
    }
    async getSettings(): Promise<Filter[]> {
        return []
    }
    
}