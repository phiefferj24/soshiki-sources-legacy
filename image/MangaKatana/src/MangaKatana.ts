import {
  Document,
  Entry,
  EntryContentRating,
  EntryResults,
  EntryResultsInfo,
  EntryStatus,
  FetchOptions,
  ImageChapter,
  ImageChapterDetails,
  ImageChapterPage,
  ImageSource,
  Listing,
  ShortEntry,
  createEntry,
  createEntryResults,
  createImageChapter,
  createImageChapterPage,
  createListing,
  createShortEntry,
  fetch,
} from 'soshiki-sources';
import {
  Filter,
  createExcludableMultiSelectFilter,
  createSegmentFilter,
  createSelectFilter,
  createSortFilter,
} from 'soshiki-sources/dist/filter';

const BASE_URL = 'https://mangakatana.com';

let tagMappings: { [key: string]: string } = {};

/**
 *
 * @param url A MangaKatana url of a chapter or manga page
 * @returns An absolute url that leads to the same destination
 * @example
 * getAbsoluteUrl('https://mangakatana.com/manga/go-toubun-no-hanayome.18224') // returns 'https://mangakatana.com/manga/id.18224'
 * @example
 * getAbsoluteUrl('https://mangakatana.com/manga/go-toubun-no-hanayome.18224/c1') // returns 'https://mangakatana.com/manga/id.18224/c1'
 */
function getAbsoluteUrl(url: string): string {
  return url.replace(/\/([a-zA-Z\-]+)(\.\d+(?:\/.*)?$)/, '/id$2');
}

export default class Source extends ImageSource {
  async getListing(
    previousInfo: EntryResultsInfo | null,
    listing: Listing
  ): Promise<EntryResults> {
    const page = previousInfo === null ? 1 : previousInfo.page + 1;
    let list = 'manga';

    switch (listing.id as string | null) {
      case 'all':
        list = 'manga';
        break;
      case 'latest':
        list = 'latest';
        break;
      case 'new':
        list = 'new-manga';
        break;
      default:
        break;
    }

    const url = `${BASE_URL}/${list}/page/${page}`;

    const document = await fetch(url).then((res) => Document.parse(res.data));

    let entries: ShortEntry[] = [];

    // MangaKatana is retarded, and the last page of their pagination redirects to the manga
    // page of the last list entry, so if #single_book exists, we know we have been redirected to
    // a manga page and there are no more pages, so just parse the manga details of that last entry
    // and append it to the results and return no more pages
    // For some reason querySelector does not work in this case so instead
    // querySelectorAll is used
    if (document.querySelectorAll('#single_book').length) {
      const { id, title, cover } = await this.getEntry(url);

      entries.push(
        createShortEntry({
          id,
          title,
          subtitle: '',
          cover,
        })
      );

      return createEntryResults({
        page,
        hasMore: false,
        entries,
      });
    }

    const items = document.querySelectorAll('#book_list > .item');

    for (const item of items) {
      entries.push(
        createShortEntry({
          id: getAbsoluteUrl(
            item.querySelector('.text .title a').getAttribute('href')
          ),
          title: item.querySelector('.text .title a').innerText,
          subtitle: '',
          cover: item.querySelector('.media .wrap_img img').getAttribute('src'),
        })
      );
    }

    // MangaKatana has a bunch of empty pages for some reason, so,
    // if no manga is found, then we know we're on an empty page and
    // there are no more usefull pages even if the pagination button is still there
    const hasMore =
      document.querySelector('.uk-pagination .next') && entries.length > 0;

    document.free();

    return createEntryResults({
      page,
      hasMore,
      entries,
    });
  }

  async getSearchResults(
    previousInfo: EntryResultsInfo | null,
    query: string,
    filters: Filter[]
  ): Promise<EntryResults> {
    const page = previousInfo === null ? 1 : previousInfo.page + 1;
    let queryItems: string[] = [];

    // Filters do not work with search
    if (query) {
      queryItems.push(
        `search=${encodeURIComponent(query)}&search_by=book_name`
      );
    } else {
      // Enable filters
      queryItems.push('filter=1');

      for (const filter of filters) {
        switch (filter.id) {
          case 'status':
            switch (filter.value as string | null) {
              case 'Any':
                break;
              case 'Ongoing':
                queryItems.push('status=1');
                break;
              case 'Completed':
                queryItems.push('status=2');
                break;
              case 'Cancelled':
                queryItems.push('status=0');
                break;
              default:
                break;
            }
            break;

          case 'genreInclusionMode':
            switch (filter.value as string | null) {
              case 'AND':
                queryItems.push('include_mode=and');
                break;
              case 'OR':
                queryItems.push('include_mode=or');
                break;
              default:
                queryItems.push('include_mode=and');
                break;
            }
            break;

          case 'genres':
            if (
              (filter.value as [string, boolean][]).filter(
                (genre) => genre[1] === false
              ).length > 0
            )
              queryItems.push(
                `include=${(filter.value as [string, boolean][])
                  .filter((genre) => genre[1] === false)
                  .map((item) => tagMappings[item[0]])
                  .join('_')}`
              );

            if (
              (filter.value as [string, boolean][]).filter(
                (genre) => genre[1] === true
              ).length > 0
            )
              queryItems.push(
                `exclude=${(filter.value as [string, boolean][])
                  .filter((genre) => genre[1] === true)
                  .map((item) => tagMappings[item[0]])
                  .join('_')}`
              );
            break;

          case 'chapterCount':
            switch (filter.value as string | null) {
              case '=1':
                queryItems.push('chapters=e1');
                break;
              case '1+':
                queryItems.push('chapters=1');
                break;
              case '5+':
                queryItems.push('chapters=5');
                break;
              case '10+':
                queryItems.push('chapters=10');
                break;
              case '20+':
                queryItems.push('chapters=20');
                break;
              case '30+':
                queryItems.push('chapters=30');
                break;
              case '50+':
                queryItems.push('chapters=50');
                break;
              case '100+':
                queryItems.push('chapters=100');
                break;
              case '150+':
                queryItems.push('chapters=150');
                break;
              case '200+':
                queryItems.push('chapters=200');
                break;
              default:
                queryItems.push('chapters=1');
                break;
            }
            break;

          case 'sort':
            switch (filter.value as string | null) {
              case 'A-Z':
                queryItems.push('order=az');
                break;
              case 'Latest Update':
                queryItems.push('order=latest');
                break;
              case 'New Manga':
                queryItems.push('order=new');
                break;
              case 'Number of Chapters':
                queryItems.push('order=numc');
                break;
              default:
                queryItems.push('order=latest');
                break;
            }
            break;
        }
      }
    }

    const url = `${BASE_URL}/${
      query ? 'page' : 'manga/page'
    }/${page}?${queryItems.join('&')}`;

    const document = await fetch(url).then((res) => Document.parse(res.data));

    let entries: ShortEntry[] = [];

    // MangaKatana is retarded, and the last page of their pagination redirects to the manga
    // page of the last list entry, so if #single_book exists, we know we have been redirected to
    // a manga page and there are no more pages, so just parse the manga details of that last entry
    // and append it to the results and return no more pages
    // For some reason querySelector does not work in this case so instead
    // querySelectorAll is used
    if (document.querySelectorAll('#single_book').length) {
      const { id, title, cover } = await this.getEntry(url);

      entries.push(
        createShortEntry({
          id,
          title,
          subtitle: '',
          cover,
        })
      );

      return createEntryResults({
        page,
        hasMore: false,
        entries,
      });
    }

    const items = document.querySelectorAll('#book_list > .item');

    for (const item of items) {
      entries.push(
        createShortEntry({
          id: getAbsoluteUrl(
            item.querySelector('.text .title a').getAttribute('href')
          ),
          title: item.querySelector('.text .title a').innerText,
          subtitle: '',
          cover: item.querySelector('.media .wrap_img img').getAttribute('src'),
        })
      );
    }

    // MangaKatana has a bunch of empty pages for some reason, so,
    // if no manga is found, then we know we're on an empty page and
    // there are no more usefull pages even if the pagination button is still there
    const hasMore =
      document.querySelector('.uk-pagination .next') && entries.length > 0;

    document.free();

    return createEntryResults({
      page,
      hasMore,
      entries,
    });
  }

  async getEntry(id: string): Promise<Entry> {
    const document = await fetch(id).then((res) => Document.parse(res.data));
    const data = document.querySelector('#single_book');
    const title = data.querySelector('.info .heading').innerText;
    const cover = data.querySelector('.cover img').getAttribute('src');
    const description = data.querySelector('.summary p').innerText;
    const statusText = data.querySelector('.info .meta .status').innerText;
    const staff = [data.querySelector('.info .meta .author').innerText];
    const tags = data
      .querySelectorAll('.info .meta .genres a')
      .map((item) => item.innerText.trim());

    document.free();

    return createEntry({
      id,
      title,
      staff,
      tags,
      cover,
      nsfw:
        tags.includes('Gore') ||
        tags.includes('Sexual violence') ||
        tags.includes('Erotica')
          ? EntryContentRating.nsfw
          : tags.includes('Ecchi') ||
            tags.includes('Harem') ||
            tags.includes('Adult') ||
            tags.includes('Loli') ||
            tags.includes('Shota')
          ? EntryContentRating.suggestive
          : EntryContentRating.safe,
      status:
        statusText === 'completed'
          ? EntryStatus.completed
          : statusText === 'ongoing'
          ? EntryStatus.ongoing
          : statusText === 'cancelled'
          ? EntryStatus.dropped
          : EntryStatus.unknown,
      url: id,
      description,
    });
  }

  async getChapters(id: string): Promise<ImageChapter[]> {
    const imageServer = getSettingsValue('imageServer') as string;
    let serverCode = '';

    switch (imageServer) {
      case 'Server 1':
        serverCode = '';
        break;
      case 'Server 2':
        serverCode = '?sv=mk';
        break;
      case 'Server 3':
        serverCode = '?sv=3';
        break;
      default:
        break;
    }

    const document = await fetch(id).then((res) => Document.parse(res.data));
    const items = document.querySelectorAll('#single_book .chapters tr');

    let chapters: ImageChapter[] = [];

    for (const item of items) {
      chapters.push(
        createImageChapter({
          id: `${getAbsoluteUrl(
            item.querySelector('.chapter a').getAttribute('href')
          )}${serverCode}`,
          entryId: id,
          chapter: parseFloat(
            item
              .querySelector('.chapter a')
              .innerText.match(/^Chapter ([0-9.]+)/)?.[1] ?? '0'
          ),
          name:
            item
              .querySelector('.chapter a')
              .innerText.match(/Chapter [0-9.]+: (.*)$/)?.[1] ?? undefined,
        })
      );
    }

    document.free();

    return chapters;
  }

  async getChapterDetails(
    id: string,
    entryId: string
  ): Promise<ImageChapterDetails> {
    const document = await fetch(id).then((res) => Document.parse(res.data));

    const pages: ImageChapterPage[] = [];

    const scripts = document.querySelectorAll('script');

    // Find the script element that contains the image urls
    for (const script of scripts) {
      // If script doesn't contain data-src, then it's not the script we want
      if (!script.innerHTML.includes('data-src')) {
        continue;
      }

      // Find the array that contains the image urls
      const urlsArray = script.innerHTML
        .match(/=\[(.*),\];/g)?.[1]
        .replaceAll(/[=\[\]';]/g, '');

      if (!urlsArray) {
        continue;
      }

      const urls = urlsArray.split(',');

      let backupIndex = 0;
      for (const url of urls) {
        if (!url) continue;

        let index = +(url.match(/\/([0-9]+).[a-z]{3,4}$/)?.[1] ?? backupIndex);
        pages.push(
          createImageChapterPage({
            index,
            url,
          })
        );
        backupIndex++;
      }
    }

    document.free();

    return {
      id,
      entryId,
      pages,
    };
  }

  async getFilters(): Promise<Filter[]> {
    const document = await fetch(`${BASE_URL}/manga`).then((res) =>
      Document.parse(res.data)
    );

    const items = document.querySelectorAll('#filter_form .genres .name');

    tagMappings = {};
    for (const item of items) {
      tagMappings[item.innerText.trim()] = item.innerText
        .trim()
        .replaceAll(' ', '-')
        .toLowerCase();
    }

    document.free();

    return [
      createSortFilter({
        id: 'sort',
        value: 'Latest Update',
        name: 'Sort',
        selections: ['A-Z', 'Latest Update', 'New Manga', 'Number of Chapters'],
      }),
      createSegmentFilter({
        id: 'status',
        value: 'Any',
        name: 'Status',
        selections: ['Any', 'Ongoing', 'Completed', 'Cancelled'],
      }),
      createExcludableMultiSelectFilter({
        id: 'genres',
        value: [],
        name: 'Genres',
        selections: Object.keys(tagMappings),
      }),
      createSegmentFilter({
        id: 'genreInclusionMode',
        value: 'AND',
        name: 'Genre Inclusion Mode',
        selections: ['AND', 'OR'],
      }),
      createSelectFilter({
        id: 'chapterCount',
        value: '1+',
        name: 'Chapter Count',
        selections: [
          '=1',
          '1+',
          '5+',
          '10+',
          '20+',
          '30+',
          '50+',
          '100+',
          '150+',
          '200+',
        ],
      }),
    ];
  }

  async getListings(): Promise<Listing[]> {
    return [
      createListing({
        id: 'latest',
        name: 'Latest',
      }),
      createListing({
        id: 'new',
        name: 'New',
      }),
    ];
  }

  async getSettings(): Promise<Filter[]> {
    return [
      createSegmentFilter({
        id: 'imageServer',
        value: 'Server 1',
        name: 'Image Server',
        selections: ['Server 1', 'Server 2', 'Server 3'],
      }),
    ];
  }

  async modifyImageRequest(
    url: string,
    options: FetchOptions
  ): Promise<{ url: string; options: FetchOptions }> {
    return {
      url,
      options: {
        headers: {
          Referer: 'https://mangakatana.com',
          ...(options.headers ?? {}),
        },
        ...options,
      },
    };
  }
}
