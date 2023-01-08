import { Entry, ImageChapter, ImageChapterDetails, EntryContentRating, EntryStatus, ImageSource, EntryResults, EntryResultsInfo, fetch, FetchOptions, Listing, createListing, createEntryResults } from "soshiki-sources" 
import { AscendableSortFilter, createAscendableSortFilter, createExcludableMultiSelectFilter, createMultiSelectFilter, createNumberFilter, createRangeFilter, createSegmentFilter, createSelectFilter, createTextFilter, createToggleFilter, ExcludableMultiSelectFilter, Filter, MultiSelectFilter, SegmentFilter } from "soshiki-sources/dist/filter"

const API_URL = "https://api.mangadex.org"
const COVER_URL = "https://uploads.mangadex.org/covers"
const SITE_URL = "https://mangadex.org"

const MANGA_PER_PAGE = 30

let tagMappings: {[key: string]: string} = {}

function getStatus(status: string): EntryStatus {
    switch (status) {
        case "completed": return EntryStatus.completed
        case "ongoing": return EntryStatus.ongoing
        case "cancelled": return EntryStatus.dropped
        case "hiatus": return EntryStatus.hiatus
        default: return EntryStatus.unknown
    }
}

function getContentRating(rating: string): EntryContentRating {
    switch (rating) {
        case "safe": return EntryContentRating.safe
        case "suggestive": return EntryContentRating.suggestive
        default: return EntryContentRating.nsfw
    }
}

export default class Source extends ImageSource {
    async getListing(previousInfo: EntryResultsInfo | null, listing: Listing): Promise<EntryResults> {
        const page = previousInfo === null ? 1 : previousInfo.page + 1
        const offset = (page - 1) * MANGA_PER_PAGE

        const res = await fetch(`${API_URL}/manga?order[${listing.id === 'latest' ? 'latestUploadedChapter' : 'followedCount'}]=desc&includes[]=cover_art&includes[]=author&includes[]=artist&limit=${MANGA_PER_PAGE}&offset=${offset}`).then(res => JSON.parse(res.data))

        const coverQuality = getSettingsValue("coverQuality")

        return createEntryResults({
            page: page,
            hasMore: offset + MANGA_PER_PAGE < res.total,
            entries: res.data.map((entry: any) => { return {
                id: entry.id,
                title: entry.attributes.title.en ?? entry.attributes.title[Object.keys(entry.attributes.title)[0]] ?? "",
                subtitle: entry.relationships.filter((relationship: any) => relationship.type === "artist" || relationship.type === "author").map((relationship: any) => relationship.attributes.name)[0] ?? "",
                cover: `${COVER_URL}/${entry.id}/${entry.relationships.filter((relationship: any) => relationship.type === "cover_art").map((relationship: any) => relationship.attributes.fileName)[0]}${coverQuality === 'Medium' ? '.512.jpg' : coverQuality === 'Low' ? '.256.jpg' : ''}`
            }})
        })
    }
    async getSearchResults(previousInfo: EntryResultsInfo | null, query: string, filters: Filter[]): Promise<EntryResults> {
        const page = previousInfo === null ? 1 : previousInfo.page + 1
        const offset = (page - 1) * MANGA_PER_PAGE

        let url = `${API_URL}/manga?title=${encodeURIComponent(query)}&includes[]=cover_art&includes[]=author&includes[]=artist&limit=${MANGA_PER_PAGE}&offset=${offset}`

        for (const filter of filters) {
            switch (filter.id) {
                case 'hasAvailableChapters': url += '&hasAvailableChapters=true'; break
                case 'originalLanguage':
                    for (const language of (filter as ExcludableMultiSelectFilter).value) {
                        switch (language[0]) {
                            case 'Japanese (Manga)': url += `&${language[1] ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=ja`; break
                            case 'Korean (Manhwa)': url += `&${language[1] ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=ko`; break
                            case 'Chinese (Manhua)': url += `&${language[1] ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=zh&${language[1] ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=zh-hk`; break
                        }
                    }
                    break
                case 'demographic': for (const demographic of (filter as MultiSelectFilter).value) url += `&publicationDemographic[]=${demographic.toLowerCase}`; break
                case 'contentRating': for (const rating of (filter as MultiSelectFilter).value) url += `&contentRating[]=${rating.toLowerCase}`; break
                case 'status': for (const status of (filter as MultiSelectFilter).value) url += `&status[]=${status.toLowerCase}`; break
                case 'sort': 
                    switch ((filter as AscendableSortFilter).value?.[0]) {
                        case 'Latest Chapter': url += `&order[latestUploadedChapter]=${(filter as AscendableSortFilter).value![1] ? 'asc' : 'desc'}`; break
                        case 'Relevance': url += `&order[relevance]=${(filter as AscendableSortFilter).value![1] ? 'asc' : 'desc'}`; break
                        case 'Follows': url += `&order[followedCount]=${(filter as AscendableSortFilter).value![1] ? 'asc' : 'desc'}`; break
                        case 'Created Date': url += `&order[createdAt]=${(filter as AscendableSortFilter).value![1] ? 'asc' : 'desc'}`; break
                        case 'Latest Chapter': url += `&order[updatedAt]=${(filter as AscendableSortFilter).value![1] ? 'asc' : 'desc'}`; break
                        case 'Title': url += `&order[title]=${(filter as AscendableSortFilter).value![1] ? 'asc' : 'desc'}`; break
                    }
                    break
                case 'includedTagsMode': url += `&includedTagsMode=${(filter as SegmentFilter).value}`; break
                case 'excludedTagsMode': url += `&excludedTagsMode=${(filter as SegmentFilter).value}`; break
                case 'contents': for (const content of (filter as ExcludableMultiSelectFilter).value) url += `&${content[1] ? 'excluded' : 'included'}Tags[]=${tagMappings[content[0]]}`; break
                case 'formats': for (const content of (filter as ExcludableMultiSelectFilter).value) url += `&${content[1] ? 'excluded' : 'included'}Tags[]=${tagMappings[content[0]]}`; break
                case 'genres': for (const content of (filter as ExcludableMultiSelectFilter).value) url += `&${content[1] ? 'excluded' : 'included'}Tags[]=${tagMappings[content[0]]}`; break
                case 'themes': for (const content of (filter as ExcludableMultiSelectFilter).value) url += `&${content[1] ? 'excluded' : 'included'}Tags[]=${tagMappings[content[0]]}`; break
            }
        }

        const res = await fetch(url).then(res => JSON.parse(res.data))

        const coverQuality = getSettingsValue("coverQuality")

        return createEntryResults({
            page: page,
            hasMore: offset + MANGA_PER_PAGE < res.total,
            entries: res.data.map((entry: any) => { return {
                id: entry.id,
                title: entry.attributes.title.en ?? entry.attributes.title[Object.keys(entry.attributes.title)[0]] ?? "",
                subtitle: entry.relationships.filter((relationship: any) => relationship.type === "artist" || relationship.type === "author").map((relationship: any) => relationship.attributes.name)[0] ?? "",
                cover: `${COVER_URL}/${entry.id}/${entry.relationships.filter((relationship: any) => relationship.type === "cover_art").map((relationship: any) => relationship.attributes.fileName)[0]}${coverQuality === 'Medium' ? '.512.jpg' : coverQuality === 'Low' ? '.256.jpg' : ''}`
            }})
        })
    }
    async getEntry(id: string): Promise<Entry> {
        const res = await fetch(`${API_URL}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`).then(res => JSON.parse(res.data).data)

        const coverQuality = getSettingsValue("coverQuality")
    
        return {
            id: id,
            title: res.attributes.title.en ?? res.attributes.title[Object.keys(res.attributes.title)[0]] ?? "",
            staff: res.relationships.filter((relationship: any) => relationship.type === "artist" || relationship.type === "author").map((relationship: any) => relationship.attributes.name),
            tags: res.attributes.tags.map((tag: any) => tag.attributes.name.en ?? tag.attributes.name[Object.keys(tag.attributes.name)[0]] ?? ""),
            cover: `${COVER_URL}/${id}/${res.relationships.filter((relationship: any) => relationship.type === "cover_art").map((relationship: any) => relationship.attributes.fileName)[0]}${coverQuality === 'Medium' ? '.512.jpg' : coverQuality === 'Low' ? '.256.jpg' : ''}`,
            nsfw: getContentRating(res.attributes.contentRating as string),
            status: getStatus(res.attributes.status),
            url: `${SITE_URL}/title/${id}`,
            description: res.attributes.description.en ?? res.attributes.description[Object.keys(res.attributes.description)[0]] ?? ""
        }
    }
    async getChapters(id: string): Promise<ImageChapter[]> {
        let chapters: ImageChapter[] = []
        let offset = 0
        let url = `${API_URL}/manga/${id}/feed?order[volume]=desc&order[chapter]=desc&translatedLanguage[]=en&includes[]=scanlation_group&limit=500&offset=${offset}`

        const blockedGroups = getSettingsValue("blockedScanlators")
        if (blockedGroups) for (const group of blockedGroups.split(",")) url += `&excludedGroups[]=${group.trim()}`
        const blockedUploaders = getSettingsValue("blockedScanlators")
        if (blockedUploaders) for (const group of blockedUploaders.split(",")) url += `&excludedUploaders[]=${group.trim()}`

        while (true) {
            const res = await fetch(url).then(res => JSON.parse(res.data))
            for (const chapter of res.data) {
                chapters.push({
                    id: chapter.id,
                    entryId: id,
                    name: chapter.attributes.title,
                    chapter: parseFloat(chapter.attributes.chapter),
                    volume: parseFloat(chapter.attributes.volume),
                    translator: chapter.relationships.filter((relationship: any) => relationship.type === 'scanlation_group').map((relationship: any) => relationship.attributes.name)[0]
                })
            }
            if (offset + 500 > res.total) return chapters
            else offset += 500
        }
    }
    async getChapterDetails(id: string, entryId: string): Promise<ImageChapterDetails> {
        const res = await fetch(`https://api.mangadex.org/at-home/server/${id}`).then(res => JSON.parse(res.data))

        const dataSaver = getSettingsValue("dataSaver") as boolean

        return {
            id,
            entryId,
            pages: res.chapter[dataSaver ? "dataSaver" : "data"].map((page: string, index: number) => { return {
                index,
                url: `${res.baseUrl}/${dataSaver ? "data-saver" : "data"}/${res.chapter.hash}/${page}`
            }})
        }
    }
    async getFilters(): Promise<Filter[]> {
        const tags = await fetch("https://api.mangadex.org/manga/tag").then(res => JSON.parse(res.data).data)
        for (const tag of tags) tagMappings[tag.attributes.name.en as string] = tag.id as string

        return [
            createToggleFilter({
                id: "hasAvailableChapters",
                value: true,
                name: "Has Available Chapters"
            }),
            createExcludableMultiSelectFilter({
                id: "originalLanguage",
                value: [],
                name: "Original Language",
                selections: ["Japanese (Manga)", "Korean (Manhwa)", "Chinese (Manhua)"],
            }),
            createMultiSelectFilter({
                id: "demographic",
                value: [],
                name: "Demographic",
                selections: ["None", "Shounen", "Shoujo", "Seinen", "Josei"]
            }),
            createMultiSelectFilter({
                id: "contentRating",
                value: ["Safe", "Suggestive"],
                name: "Content Rating",
                selections: ["Safe", "Suggestive", "Erotica", "Pornographic"]
            }),
            createMultiSelectFilter({
                id: "status",
                value: [],
                name: "Status",
                selections: ["Ongoing", "Completed", "Hiatus", "Cancelled"]
            }),
            createAscendableSortFilter({
                id: "sort",
                value: ["Latest Chapter", false],
                name: "Sort",
                selections: ["Latest Chapter", "Relevance", "Follows", "Created Date", "Last Updated", "Title"]
            }),
            createSegmentFilter({
                id: "includedTagsMode",
                value: "AND",
                name: "Included Tags Mode",
                selections: ["AND", "OR"]
            }),
            createSegmentFilter({
                id: "excludedTagsMode",
                value: "OR",
                name: "Excluded Tags Mode",
                selections: ["AND", "OR"]
            }),
            createExcludableMultiSelectFilter({
                id: "contents",
                value: [],
                name: "Contents",
                selections: tags.filter((tag: any) => tag.attributes.group === 'content').map((tag: any) => tag.attributes.name.en)
            }),
            createExcludableMultiSelectFilter({
                id: "formats",
                value: [],
                name: "Formats",
                selections: tags.filter((tag: any) => tag.attributes.group === 'format').map((tag: any) => tag.attributes.name.en)
            }),
            createExcludableMultiSelectFilter({
                id: "genres",
                value: [],
                name: "Genres",
                selections: tags.filter((tag: any) => tag.attributes.group === 'genre').map((tag: any) => tag.attributes.name.en)
            }),
            createExcludableMultiSelectFilter({
                id: "themes",
                value: [],
                name: "Themes",
                selections: tags.filter((tag: any) => tag.attributes.group === 'theme').map((tag: any) => tag.attributes.name.en)
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "popular",
                name: "Popular"
            }),
            createListing({
                id: "latest",
                name: "Latest"
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
                    Origin: "https://mangadex.org/",
                    ...(options.headers ?? {})
                },
                ...options
            }
        }
    }
}