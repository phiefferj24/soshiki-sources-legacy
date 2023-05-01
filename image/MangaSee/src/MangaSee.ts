import { Entry, ImageChapter, ImageChapterDetails, EntryContentRating, EntryStatus, ImageSource, EntryResults, EntryResultsInfo, fetch, FetchOptions, Listing, createEntryResults, createShortEntry, createImageChapter, createImageChapterDetails, ImageChapterPage, createImageChapterPage, createListing } from "soshiki-sources" 
import { createAscendableSortFilter, createExcludableMultiSelectFilter, createSegmentFilter, Filter } from "soshiki-sources/dist/filter"
import * as fuzzysort from "fuzzysort"

const MS_SITE_URL = "https://mangasee123.com"
const ML_SITE_URL = "https://manga4life.com"
const IMAGE_SERVER_URL = "https://temp.compsci88.com"

type SiteChapter = {
    Chapter: string,
    Type: string,
    Date: string,
    ChapterName: string | null,
    Page?: string,
    Directory?: string
}

type SiteEntry = {
    /** ID */
    i: string,
    /** Title */
    s: string,
    /** Official ("yes" or "no") */
    o: string,
    /** Scan Status */
    ss: string,
    /** Publish Status */
    ps: string,
    /** Type */
    t: string,
    /** Views (all time) */
    v: string,
    /** Views (this month) */
    vm: string,
    /** Year */
    y: string,
    /** Authors */
    a: string[],
    /** Alternative Titles */
    al: string[],
    /** not sure */
    l: string,
    /** Last Updated, in seconds since epoch (probably) */
    lt: number,
    /** Last Updated (probably) */
    ls: string,
    /** Genres */
    g: string[],
    /** Hot (or not :D) */
    h: boolean
}

let directoryUrl = serverUrl()
let directory: SiteEntry[] | undefined

function serverUrl(): string {
    return getSettingsValue("serverUrl", "en_mangasee") === "Manga4Life" ? ML_SITE_URL : MS_SITE_URL
}

async function fetchDirectory() {
    const html = await fetch(`${serverUrl()}/search/`).then(res => res.data)
    directory = JSON.parse(`[${html.match(/vm\.Directory \= \[(.*?)\];/)?.[1] ?? ''}]`)
    directoryUrl = serverUrl()
}

export default class Source extends ImageSource {
    id = "en_mangasee"
    async getListing(previousInfo: EntryResultsInfo | null, listing: Listing): Promise<EntryResults> {
        if (typeof directory === 'undefined' || serverUrl() !== directoryUrl) await fetchDirectory()
        return createEntryResults({
            page: 1,
            hasMore: false,
            entries: directory!.sort((entry1, entry2) => {
                switch (listing.id) {
                    case "": return 1
                    case "latestChapter": return (entry2.lt - entry1.lt)
                    case "mostPopular": return (parseInt(entry2.v) - parseInt(entry1.v))
                    case "mostPopularMonthly": return (parseInt(entry2.vm) - parseInt(entry1.vm))
                    default: return 0
                }
            }).map(entry => createShortEntry({
                id: entry.i,
                title: entry.s,
                subtitle: "",
                cover: `${IMAGE_SERVER_URL}/cover/${entry.i}.jpg`
            }))
        })
    }
    async getSearchResults(previousInfo: EntryResultsInfo | null, query: string, filters: Filter[]): Promise<EntryResults> {
        if (typeof directory === 'undefined' || serverUrl() !== directoryUrl) await fetchDirectory()
        return createEntryResults({
            page: 1,
            hasMore: false,
            entries: fuzzysort.go(query, directory!, { keys: [ "s", "al" ] }).filter(entry => {
                return filters.every(filter => {
                    switch (filter.id) {
                        case "official": return filter.value === 'Any' ? true : entry.obj.o === (filter.value as string).toLowerCase()
                        case "scanStatus": return (filter.value as [string, boolean][]).length === 0 ? true : ((filter.value as [string, boolean][]).filter(status => status[1] === false).some(status => entry.obj.ss === status[0]) && (filter.value as [string, boolean][]).filter(status => status[1] === true).every(status => entry.obj.ss !== status[0]))
                        case "publishStatus": return (filter.value as [string, boolean][]).length === 0 ? true : ((filter.value as [string, boolean][]).filter(status => status[1] === false).some(status => entry.obj.ps === status[0]) && (filter.value as [string, boolean][]).filter(status => status[1] === true).every(status => entry.obj.ps !== status[0]))
                        case "type": return (filter.value as [string, boolean][]).length === 0 ? true : ((filter.value as [string, boolean][]).filter(type => type[1] === false).some(type => entry.obj.t === type[0]) && (filter.value as [string, boolean][]).filter(type => type[1] === true).every(type => entry.obj.t !== type[0]))
                        case "genre": return (filter.value as [string, boolean][]).every(genre => entry.obj.g.includes(genre[0]) !== genre[1])
                        default: return true
                    }
                })
            }).sort((entry1, entry2) => {
                const sort = (filters.find(filter => filter.id === "sort")?.value ?? ["Popularity (All Time)", false]) as [string, boolean]
                switch (sort[0]) {
                    case "Alphabetical": return entry1.obj.s.localeCompare(entry2.obj.s) * (sort[1] ? -1 : 1)
                    case "Latest Chapter": return (entry2.obj.lt - entry1.obj.lt) * (sort[1] ? -1 : 1)
                    case "Year Released": return (parseInt(entry2.obj.y) - parseInt(entry1.obj.y)) * (sort[1] ? -1 : 1)
                    case "Popularity (All Time)": return (parseInt(entry2.obj.v) - parseInt(entry1.obj.v)) * (sort[1] ? -1 : 1)
                    case "Popularity (Monthly)": return (parseInt(entry2.obj.vm) - parseInt(entry1.obj.vm)) * (sort[1] ? -1 : 1)
                    default: return 0
                }
            }).map(entry => createShortEntry({
                id: entry.obj.i,
                title: entry.obj.s,
                subtitle: "",
                cover: `${IMAGE_SERVER_URL}/cover/${entry.obj.i}.jpg`
            }))
        })
    }
    async getEntry(id: string): Promise<Entry> {
        if (typeof directory === 'undefined' || serverUrl() !== directoryUrl) await fetchDirectory()
        const entry = directory!.find(item => item.i === id)!
        return {
            id: entry.i,
            title: entry.s,
            staff: entry.a,
            tags: entry.g,
            cover: `${IMAGE_SERVER_URL}/cover/${entry.i}.jpg`,
            nsfw: entry.g.includes("Hentai") ? EntryContentRating.nsfw : entry.g.includes("Smut") || entry.g.includes("Ecchi") ? EntryContentRating.suggestive : EntryContentRating.safe,
            status: (() => {
                switch (entry.ps) {
                    case "Cancelled": return EntryStatus.dropped
                    case "Complete": return EntryStatus.completed
                    case "Discontinued": return EntryStatus.dropped
                    case "Hiatus": return EntryStatus.hiatus
                    case "Ongoing": return EntryStatus.ongoing
                    default: return EntryStatus.unknown
                }
            })(),
            url: `${serverUrl()}/manga/${id}`,
            description: ""
        }
    }
    async getChapters(id: string): Promise<ImageChapter[]> {
        const html = await fetch(`${serverUrl()}/manga/${id}`).then(res => res.data)
        const chapters: SiteChapter[] = JSON.parse(`[${html.match(/vm\.Chapters \= \[(.*?)\];/)?.[1] ?? ''}]`)
        return chapters.map(chapter => createImageChapter({
            id: `${id}-chapter-${parseInt(chapter.Chapter.substring(1, 5)) + parseInt(chapter.Chapter.substring(5, 6)) / 10}${chapter.Chapter.substring(0, 1) === "1" ? "" : `-index-${chapter.Chapter.substring(0, 1)}`}-page-1.html`,
            entryId: id,
            chapter: parseInt(chapter.Chapter.substring(1, 5)) + parseInt(chapter.Chapter.substring(5, 6)) / 10,
            name: chapter.ChapterName ?? undefined
        }))
    }
    async getChapterDetails(id: string, entryId: string): Promise<ImageChapterDetails> {
        const html = await fetch(`${serverUrl()}/read-online/${id}`).then(res => res.data)
        const chapter: Required<SiteChapter> = JSON.parse(`{${html.match(/vm\.CurChapter \= \{(.*?)\};/)?.[1] ?? ''}}`)
        const baseUrl = `https://${html.match(/vm\.CurPathName \= \"(.*?)\";/)?.[1] ?? ''}`
        let pages: ImageChapterPage[] = []
        for (let page = 1; page <= parseInt(chapter.Page); ++page) {
            pages.push(createImageChapterPage({
                index: page - 1,
                url: `${baseUrl}/manga/${entryId}/${chapter.Chapter.substring(1, 5)}-${`000${page}`.substring(`000${page}`.length - 3)}.png`
            }))
        }
        return createImageChapterDetails({
            id,
            entryId,
            pages
        })
    }
    async getFilters(): Promise<Filter[]> {
        return [
            createAscendableSortFilter({
                id: "sort",
                value: ["Popularity (All Time)", false],
                name: "Sort",
                selections: [
                    "Alphabetical",
                    "Latest Chapter",
                    "Year Released",
                    "Popularity (All Time)",
                    "Popularity (Monthly)"
                ]
            }),
            createSegmentFilter({
                id: "official",
                value: "Any",
                name: "Official Translation",
                selections: ["Any", "Yes", "No"]
            }),
            createExcludableMultiSelectFilter({
                id: "scanStatus",
                value: [],
                name: "Scan Status",
                selections: [
                    "Cancelled",
                    "Completed",
                    "Discontinued",
                    "Hiatus",
                    "Ongoing"
                ]
            }),
            createExcludableMultiSelectFilter({
                id: "publishStatus",
                value: [],
                name: "Publishing Status",
                selections: [
                    "Cancelled",
                    "Completed",
                    "Discontinued",
                    "Hiatus",
                    "Ongoing"
                ]
            }),
            createExcludableMultiSelectFilter({
                id: "type",
                value: [],
                name: "Type",
                selections: [
                    "Doujinshi",
                    "Manga",
                    "Manhua",
                    "Manhwa",
                    "OEL",
                    "One-shot"
                ]
            }),
            createExcludableMultiSelectFilter({
                id: "genre",
                value: [],
                name: "Genre",
                selections: [
                    "Action",
                    "Adult",
                    "Adventure",
                    "Comedy",
                    "Doujinshi",
                    "Drama",
                    "Ecchi",
                    "Fantasy",
                    "Gender Bender",
                    "Harem",
                    "Hentai",
                    "Historical",
                    "Horror",
                    "Isekai",
                    "Josei",
                    "Lolicon",
                    "Martial Arts",
                    "Martial Arts Shounen",
                    "Mature",
                    "Mecha",
                    "Mystery",
                    "Psychological",
                    "Psychological Romance",
                    "Romance",
                    "School Life",
                    "Sci-fi",
                    "Seinen",
                    "Shotacon",
                    "Shoujo",
                    "Shoujo Ai",
                    "Shounen",
                    "Shounen Ai",
                    "Shounen Ai Slice of Life",
                    "Slice of Life",
                    "Slice of Life Supernatural",
                    "Smut",
                    "Sports",
                    "Supernatural",
                    "Tragedy",
                    "Yaoi",
                    "Yuri"
                ]
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "latestChapter",
                name: "Latest Chapter"
            }),
            createListing({
                id: "mostPopular",
                name: "Most Popular (All Time)"
            }),
            createListing({
                id: "mostPopularMonthly",
                name: "Most Popular (Monthly)"
            })
        ]
    }
    async getSettings(): Promise<Filter[]> {
        return [
            createSegmentFilter({
                id: "serverUrl",
                value: "MangaSee123",
                name: "Server",
                selections: ["MangaSee123", "Manga4Life"]
            })
        ]
    }
    async modifyImageRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions }> {
        return { url, options }
    }
}