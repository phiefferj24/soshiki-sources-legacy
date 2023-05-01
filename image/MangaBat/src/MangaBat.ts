import { Entry, ImageChapter, ImageChapterDetails, EntryContentRating, EntryStatus, ImageSource, EntryResults, EntryResultsInfo, fetch, FetchOptions, Listing, createListing, createEntryResults, Document, ShortEntry, createShortEntry, createEntry, createImageChapter, createImageChapterPage } from "soshiki-sources" 
import { createExcludableMultiSelectFilter, createSegmentFilter, createSortFilter, createTextFilter, createToggleFilter, Filter } from "soshiki-sources/dist/filter"

const BASE_URL = "https://h.mangabat.com"

let tagMappings: {[key: string]: string} = {}

export default class Source extends ImageSource {
    id = "en_mangabat"
    async getListing(previousInfo: EntryResultsInfo | null, listing: Listing): Promise<EntryResults> {
        const page = previousInfo === null ? 1 : previousInfo.page + 1
        const document = await fetch(`${BASE_URL}/manga-list-all/${page}${listing.id === "" || listing.id === "latest" ? "" : `?type=${listing.id}`}`).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.list-story-item > a")
        let entries: ShortEntry[] = []
        for (const item of items) {
            entries.push(createShortEntry({
                id: item.getAttribute("href"),
                title: item.title,
                subtitle: "",
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        const hasMore = parseInt(document.querySelector("a.page-last").innerText.match(/LAST\((\d+)\)/)?.[1] ?? "1") <= page
        document.free()
        return createEntryResults({
            page,
            hasMore,
            entries
        })
    }
    async getSearchResults(previousInfo: EntryResultsInfo | null, query: string, filters: Filter[]): Promise<EntryResults> {
        const page = previousInfo === null ? 1 : previousInfo.page + 1
        let queryItems: string[] = [`page=${page}`, `keyw=${query.replace(/[\W_]+/g, "_").toLowerCase()}`]
        for (const filter of filters) {
            switch (filter.id) {
                case "status": if (filter.value !== 'All') queryItems.push(`sts=${(filter.value as string).toLowerCase()}`); break
                case "sort":
                    switch (filter.value as string | null) {
                        case "Most Popular": queryItems.push("orby=topview"); break
                        case "Newest": queryItems.push("orby=newest"); break
                        case "A-Z": queryItems.push("orby=az"); break
                        default: break
                    }
                    break
                case "genres":
                    if ((filter.value as [string, boolean][]).filter(genre => genre[1] === false).length > 0) queryItems.push(`g_i=_${(filter.value as [string, boolean][]).filter(genre => genre[1] === false).map(item => tagMappings[item[0]]).join("_")}_`)
                    if ((filter.value as [string, boolean][]).filter(genre => genre[1] === true).length > 0) queryItems.push(`g_e=_${(filter.value as [string, boolean][]).filter(genre => genre[1] === true).map(item => tagMappings[item[0]]).join("_")}_`)
                    break
            }
        }
        const document = await fetch(`${BASE_URL}/advanced_search?${queryItems.join("&")}`).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.list-story-item > a")
        let entries: ShortEntry[] = []
        for (const item of items) {
            entries.push(createShortEntry({
                id: item.getAttribute("href"),
                title: item.title,
                subtitle: "",
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        const hasMore = parseInt(document.querySelector("a.page-last").innerText.match(/LAST\((\d+)\)/)?.[1] ?? "1") <= page
        document.free()
        return createEntryResults({
            page,
            hasMore,
            entries
        })
    }
    async getEntry(id: string): Promise<Entry> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const data = document.querySelector("div.panel-story-info")
        const image = data.querySelector("span.info-image > img")
        const infoTable = data.querySelectorAll("tbody > tr")
        const tags = infoTable[3].querySelectorAll("td.table-value > a").map(item => item.innerText.trim())
        const statusText = infoTable[2].querySelector("td.table-value").innerText
        const entry = createEntry({
            id,
            title: image.title,
            staff: infoTable[1].querySelectorAll("td.table-value > a").map(item => item.innerText.trim()),
            tags,
            cover: image.getAttribute("src"),
            nsfw: tags.includes("Smut") || tags.includes("Pornographic") ? EntryContentRating.nsfw : tags.includes("Adult") || tags.includes("Ecchi") || tags.includes("Mature") || tags.includes("Erotica") ? EntryContentRating.suggestive : EntryContentRating.safe,
            status: statusText === "Completed" ? EntryStatus.completed : statusText === "Ongoing" ? EntryStatus.ongoing : EntryStatus.unknown,
            url: id,
            description: document.querySelector("div.panel-story-info-description").innerText.substring("Description :".length).trim()
        })
        document.free()
        return entry
    }
    async getChapters(id: string): Promise<ImageChapter[]> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("ul.row-content-chapter > li > a")
        let chapters: ImageChapter[] = []
        for (const item of items) {
            chapters.push(createImageChapter({
                id: item.getAttribute("href"),
                entryId: id,
                chapter: parseFloat(item.getAttribute("href").match(/chap-([0-9.]+)/)?.[1] ?? "0"),
                name: item.innerText.match(/Chapter [0-9.]+: (.*)/)?.[1] ?? undefined
            }))
        }
        document.free()
        return chapters
    }
    async getChapterDetails(id: string, entryId: string): Promise<ImageChapterDetails> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const pages = document.querySelectorAll("div.container-chapter-reader > img").map((item, index) => createImageChapterPage({
            index,
            url: item.getAttribute("src")
        }))
        document.free()
        return {
            id,
            entryId,
            pages
        }
    }
    async getFilters(): Promise<Filter[]> {
        const document = await fetch(`${BASE_URL}/advanced-search`).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("span.advanced-search-tool-genres-item")
        tagMappings = {}
        for (const item of items) {
            tagMappings[item.innerText.trim()] = item.getAttribute("data-i")
        }
        document.free()
        return [
            createSortFilter({
                id: "sort",
                value: null,
                name: "Sort",
                selections: ["Latest Update", "Most Popular", "Newest", "A-Z"]
            }),
            createSegmentFilter({
                id: "status",
                value: "All",
                name: "Status",
                selections: ["All", "Ongoing", "Completed"]
            }),
            createExcludableMultiSelectFilter({
                id: "genres",
                value: [],
                name: "Genres",
                selections: Object.keys(tagMappings)
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "latest",
                name: "Latest"
            }),
            createListing({
                id: "newest",
                name: "New"
            }),
            createListing({
                id: "topview",
                name: "Popular"
            })
        ]
    }
    async getSettings(): Promise<Filter[]> {
        return [
            createSegmentFilter({
                id: "coverQuality",
                value: "Medium",
                name: "Cover Quality",
                selections: ["Original", "Medium", "Low"]
            }),
            createToggleFilter({
                id: "dataSaver",
                value: false,
                name: "Data Saver"
            }),
            createTextFilter({
                id: "blockedScanlators",
                value: "5fed0576-8b94-4f9a-b6a7-08eecd69800d, 06a9fecb-b608-4f19-b93c-7caab06b7f44, 8d8ecf83-8d42-4f8c-add8-60963f9f28d9, 4f1de6a2-f0c5-4ac5-bce5-02c7dbb67deb, 319c1b10-cbd0-4f55-a46e-c4ee17e65139",
                name: "Blocked Scanlators"
            }),
            createTextFilter({
                id: "blockedUploaders",
                value: "",
                name: "Blocked Uploaders"
            })
        ]
    }
    async modifyImageRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions }> {
        return { 
            url, 
            options: {
                headers: {
                    Referer: "https://h.mangabat.com",
                    ...(options.headers ?? {})
                },
                ...options
            } 
        }
    }
}