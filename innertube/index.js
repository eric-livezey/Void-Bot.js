const CLIENTS = {
    youtube: { id: 1, name: "WEB", version: "2.20230914.04.00" }
}

const JS_CACHE = {};

async function request(path, body) {
    body = {
        ...body,
        context: {
            client: {
                clientName: CLIENTS.youtube.name,
                clientVersion: CLIENTS.youtube.version
            }
        }
    }
    return await fetch(`https://www.youtube.com/youtubei/v1${path}?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false`, {
        headers: {
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
            "x-youtube-bootstrap-logged-in": "false",
            "x-youtube-client-name": CLIENTS.youtube.id,
            "x-youtube-client-version": CLIENTS.youtube.version
        },
        body: JSON.stringify(body),
        method: "POST"
    });
}

async function getPlayerId(videoId) {
    const html = await (await fetch(`https://www.youtube.com/watch?v=${videoId}`)).text();
    var startIndex = html.search(/\/s\/player\/.+\/player_ias\.vflset\/en_US\/base\.js/) + 10;
    return html.substring(startIndex, html.indexOf("/", startIndex));
}

async function getJs(playerId) {
    if (!JS_CACHE[playerId]) {
        const js = (await (await fetch(`https://www.youtube.com/s/player/${playerId}/player_ias.vflset/en_US/base.js`)).text());
        const f = js.search(/var [A-Za-z]+=\{[A-Za-z0-9]+:function(\(a,b\)\{var c=a\[0\];a\[0\]=a\[b%a.length\];a\[b%a.length\]=c\}|\(a\)\{a.reverse\(\)\}|\(a,b\)\{a.splice\(0,b\)\})/);
        const d = js.indexOf("function(a){a=a.split(\"\")") + 11;
        const s = js.indexOf("signatureTimestamp:") + 19;
        const c = js.indexOf(",", s);
        const b = js.indexOf("}", s);
        eval(`${js.substring(f, js.indexOf("}}", f) + 2)};JS_CACHE[playerId]={decipher:(a)=>${js.substring(d, js.indexOf("return a.join(\"\")}", d) + 18)},signatureTimestamp:${Number(js.substring(s, c < b && c != -1 ? c : b))}}`);
    }
    return JS_CACHE[playerId];
}

function decipher(js, signatureCipher) {
    return `${signatureCipher.get("url")}&${signatureCipher.get("sp")}=${encodeURIComponent(js.decipher(signatureCipher.get("s")))}`;
}

export class Video {
    #kind;
    #id;
    #publishedAt;
    #channelId;
    #title;
    #description;
    #thumbnails;
    #channelTitle;
    #tags;
    #category;
    #liveBroadcastContent;
    #contentDetails;
    #status;
    #statistics;
    #player;
    #fileDetails;
    #liveStreamingDetails;

    constructor(data, js) {
        this.#kind = "youtube#video";
        this.#id = data.videoDetails?.videoId;
        this.#publishedAt = data.microformat ? new Date(data.microformat.playerMicroformatRenderer.publishDate) : undefined;
        this.#channelId = data.videoDetails?.channelId;
        this.#title = data.videoDetails?.title;
        this.#description = data.videoDetails?.shortDescription;
        this.#thumbnails = data.videoDetails ? {
            default: {
                url: `https://i.ytimg.com/vi/${this.#id}/default.jpg`,
                width: 120,
                height: 90
            },
            medium: {
                url: `https://i.ytimg.com/vi/${this.#id}/mqdefault.jpg`,
                width: 320,
                height: 180
            },
            high: {
                url: `https://i.ytimg.com/vi/${this.#id}/hqdefault.jpg`,
                width: 480,
                height: 360
            },
            standard: {
                url: `https://i.ytimg.com/vi/${this.#id}/sddefault.jpg`,
                width: 640,
                height: 480
            },
            maxres: {
                url: `https://i.ytimg.com/vi/${this.#id}/maxresdefault.jpg`,
                width: 1280,
                height: 720
            }
        } : undefined;
        this.#channelTitle = data.videoDetails?.author;
        this.#tags = data.videoDetails?.keywords;
        this.#category = data.microformat?.playerMicroformatRenderer.category;
        this.#liveBroadcastContent = data.videoDetails?.isLive ? "live" : data.videoDetails?.isLiveContent ? "upcoming" : "none";
        this.#contentDetails = {
            duration: data.videoDetails ? ((seconds) => {
                return {
                    total: seconds,
                    days: Math.floor(seconds / 86400),
                    hours: Math.floor(seconds % 86400 / 3600),
                    minutes: Math.floor(seconds % 3600 / 60),
                    seconds: seconds % 60
                }
            })(Number(data.videoDetails.lengthSeconds)) : undefined,
            dimension: null,
            definition: null,
            regionRestriction: {
                allowed: data.microformat?.playerMicroformatRenderer.availableCountries,
            },
            ageRestricted: data.playabilityStatus?.reason == "Sign in to confirm your age",
            projection: data.streamingData?.adaptiveFormats[0].projectionType.toLowerCase(),
        };
        this.#status = {
            uploadStatus: data.playabilityStatus?.reason == "We're processing this video. Check back later." ? "uploaded" : "processed",
            privacyStatus: data.videoDetails?.isUnpluggedCorpus ? "unlisted" : data.videoDetails?.isPrivate || data.playabilityStatus?.messages?.[0] == "This is a private video. Please sign in to verify that you may see it." ? "private" : "public",
            embeddable: data.playabilityStatus?.playableInEmbed,
        };
        this.#statistics = {
            viewCount: Number(data.videoDetails?.viewCount),
        };
        this.#player = {
            embedHtml: data.microformat ? `\u003ciframe width=\"${data.microformat.playerMicroformatRenderer.embed.width}\" height=\"${data.microformat.playerMicroformatRenderer.embed.height}\" src=\"${data.microformat.playerMicroformatRenderer.embed.iframeUrl}\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" allowfullscreen\u003e\u003c/iframe\u003e` : undefined
        };
        this.#fileDetails = {
            videoStreams: data.streamingData?.adaptiveFormats.filter((value) => value.mimeType.startsWith("video") && value).map((value) => {
                return {
                    widthPixels: value.width,
                    heightPixels: value.height,
                    frameRateFps: value.fps,
                    aspectRatio: value.width / value.width,
                    codec: value.mimeType.substring(value.mimeType.indexOf("codecs=") + 8, value.mimeType.length - 1),
                    bitrateBps: value.bitrate,
                    url: value.url ? value.url : decipher(js, new URLSearchParams(value.signatureCipher))
                }
            }),
            audioStreams: data.streamingData?.adaptiveFormats.filter((value) => value.mimeType.startsWith("audio")).map((value) => {
                return {
                    channelCount: value.audioChannels,
                    codec: value.mimeType.substring(value.mimeType.indexOf("codecs=") + 8, value.mimeType.length - 1),
                    bitrateBps: value.bitrate,
                    url: value.url ? value.url : decipher(js, new URLSearchParams(value.signatureCipher))
                }
            }),
            durationMs: data.streamingData?.adaptiveFormats[0].approxDurationMs,
            dashManifestUrl: data.streamingData?.dashManifestUrl,
            hlsManifestUrl: data.streamingData?.hlsManifestUrl
        };
        this.#liveStreamingDetails = data.microformat?.playerMicroformatRenderer.liveBroadcastDetails ? {
            actualStartTime: new Date(data.microformat.playerMicroformatRenderer.liveBroadcastDetails?.startTimestamp),
            actualEndTime: data.microformat.playerMicroformatRenderer.liveBroadcastDetails.endTimestamp ? new Date(data.microformat.playerMicroformatRenderer.liveBroadcastDetails?.endTimestamp) : undefined,
        } : undefined;
    };

    get kind() {
        return this.#kind;
    };
    get id() {
        return this.#id;
    };
    get publishedAt() {
        return this.#publishedAt;
    };
    get channelId() {
        return this.#channelId;
    };
    get title() {
        return this.#title;
    };
    get description() {
        return this.#description;
    };
    get thumbnails() {
        return this.#thumbnails;
    };
    get channelTitle() {
        return this.#channelTitle;
    };
    get tags() {
        return this.#tags;
    };
    get category() {
        return this.#category;
    };
    get liveBroadcastContent() {
        return this.#liveBroadcastContent;
    };
    get contentDetails() {
        return this.#contentDetails;
    };
    get status() {
        return this.#status;
    };
    get statistics() {
        return this.#statistics;
    };
    get player() {
        return this.#player;
    };
    get fileDetails() {
        return this.#fileDetails;
    };
    get liveStreamingDetails() {
        return this.#liveStreamingDetails;
    };

    toJSON() {
        return {
            kind: this.kind,
            id: this.id,
            publishedAt: this.publishedAt,
            channelId: this.channelId,
            title: this.title,
            description: this.description,
            thumbnails: this.thumbnails,
            channelTitle: this.channelTitle,
            tags: this.tags,
            category: this.category,
            liveBroadcastContent: this.liveBroadcastContent,
            contentDetails: this.contentDetails,
            status: this.status,
            statistics: this.statistics,
            player: this.player,
            fileDetails: this.fileDetails,
            liveStreamingDetails: this.liveStreamingDetails
        }
    };
}

class PlaylistItem {
    #kind;
    #id;
    #title;
    #thumbnails;
    #videoOwnerChannelTitle;
    #playlistId;
    #position;
    #resourceId;
    #contentDetails;
    #status;

    constructor(data) {
        this.#kind = "youtube#playlistItem";
        this.#id = data.videoId;
        this.#title = data.title.runs.map((value) => value.text).join();
        this.#thumbnails = {
            default: {
                url: `https://i.ytimg.com/vi/${this.#id}/default.jpg`,
                width: 120,
                height: 90
            },
            medium: {
                url: `https://i.ytimg.com/vi/${this.#id}/mqdefault.jpg`,
                width: 320,
                height: 180
            },
            high: {
                url: `https://i.ytimg.com/vi/${this.#id}/hqdefault.jpg`,
                width: 480,
                height: 360
            },
            standard: {
                url: `https://i.ytimg.com/vi/${this.#id}/sddefault.jpg`,
                width: 640,
                height: 480
            },
            maxres: {
                url: `https://i.ytimg.com/vi/${this.#id}/maxresdefault.jpg`,
                width: 1280,
                height: 720
            }
        };
        this.#videoOwnerChannelTitle = data.shortBylineText.runs.map((value) => value.text).join();
        this.#playlistId = data.navigationEndpoint.watchEndpoint.playlistId;
        this.#position = Number(data.index.simpleText);
        this.#resourceId = {
            kind: "youtube#video",
            videoId: this.#id
        };
        this.#contentDetails = {
            videoId: this.#id
        };
        this.#status = {
            privacyStatus: "public"
        };
    };

    get kind() {
        return this.#kind;
    };
    get id() {
        return this.#id;
    };
    get title() {
        return this.#title;
    };
    get thumbnails() {
        return this.#thumbnails;
    };
    get videoOwnerChannelTitle() {
        return this.#videoOwnerChannelTitle;
    };
    get playlistId() {
        return this.#playlistId;
    };
    get position() {
        return this.#position;
    };
    get resourceId() {
        return this.#resourceId;
    };
    get contentDetails() {
        return this.#contentDetails;
    };
    get status() {
        return this.#status;
    };

    toJSON() {
        return {
            kind: this.kind,
            id: this.id,
            title: this.title,
            thumbnails: this.thumbnails,
            videoOwnerChannelTitle: this.videoOwnerChannelTitle,
            playlistId: this.playlistId,
            position: this.position,
            resourceId: this.resourceId,
            contentDetails: this.contentDetails,
            status: this.status
        }
    };
}

class Playlist {
    #kind;
    #id;
    #channelId;
    #title;
    #description;
    #thumbnails;
    #channelTitle;
    #status;
    #contentDetails;
    #contents;

    constructor(data) {
        this.#kind = "youtube#playlist";
        this.#id = data.header?.playlistHeaderRenderer.playlistId;
        this.#channelId = data.header?.playlistHeaderRenderer.ownerEndpoint?.browseEndpoint.browseId;
        this.#title = data.header?.playlistHeaderRenderer.title.simpleText;
        this.#description = data.header?.playlistHeaderRenderer.description;
        this.#thumbnails = data.header ? ((thumbnailData) => {
            const thumbnails = {};
            if (!new URL(thumbnailData[0].url).searchParams.has("v")) {
                const url = thumbnailData[0].url.substring(0, thumbnailData[0].url.indexOf("&rs="));
                thumbnails.default = {
                    url: url.replace("hqdefault.jpg", "default.jpg"),
                    width: 120,
                    height: 90
                }
                thumbnails.medium = {
                    url: url.replace("hqdefault.jpg", "mqdefault.jpg"),
                    width: 320,
                    height: 180
                }
                thumbnails.high = {
                    url: url,
                    width: 480,
                    height: 360
                }
                thumbnails.standard = {
                    url: url.replace("hqdefault.jpg", "sddefault.jpg"),
                    width: 640,
                    height: 480
                }
                thumbnails.maxres = {
                    url: url.replace("hqdefault.jpg", "maxresdefault.jpg"),
                    width: 1280,
                    height: 720
                }
            } else {
                thumbnails.medium = thumbnailData[0];
                thumbnails.standard = thumbnailData[1];
                thumbnails.maxres = thumbnailData[2];
            }
            return thumbnails;
        })(data.header.playlistHeaderRenderer.playlistHeaderBanner.heroPlaylistThumbnailRenderer.thumbnail.thumbnails) : undefined;
        this.#channelTitle = data.header?.playlistHeaderRenderer.ownerText ? data.header?.playlistHeaderRenderer.ownerText.runs.map((value) => value.text).join() : data.header?.playlistHeaderRenderer.subtitle?.simpleText;
        this.#status = {
            privacyStatus: data.header ? data.header.playlistHeaderRenderer.privacy.toLowerCase() : "private"
        }
        this.#contentDetails = {
            itemCount: data.header ? Number(data.header.playlistHeaderRenderer.numVideosText.runs[0].text.split(" ")[0]) : undefined
        }
        this.#contents = data.contents?.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents
    }

    async listItems() {
        if (!this.#contents) {
            return [];
        }
        var contents = this.#contents;
        var items = contents.filter((value) => value.playlistVideoRenderer).map((value) => new PlaylistItem(value.playlistVideoRenderer));
        var continuation = this.#contents.find(value => value.continuationItemRenderer)?.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        while (continuation) {
            const data = await (await request("/browse", { continuation: continuation })).json();
            contents = data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems;
            items = items.concat(contents.filter((value) => value.playlistVideoRenderer).map((value) => new PlaylistItem(value.playlistVideoRenderer)));
            continuation = contents.find(value => value.continuationItemRenderer)?.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        }
        return items;
    };

    get kind() {
        return this.#kind;
    };
    get id() {
        return this.#id;
    };
    get channelId() {
        return this.#channelId;
    };
    get title() {
        return this.#title;
    };
    get description() {
        return this.#description;
    };
    get thumbnails() {
        return this.#thumbnails;
    };
    get channelTitle() {
        return this.#channelTitle;
    };
    get status() {
        return this.#status;
    };
    get contentDetails() {
        return this.#contentDetails;
    };

    toJSON() {
        return {
            kind: this.kind,
            id: this.id,
            channelId: this.channelId,
            title: this.title,
            description: this.description,
            thumbnails: this.thumbnails,
            channelTitle: this.channelTitle,
            status: this.status,
            contentDetails: this.contentDetails
        }
    };
}

class SearchResult {
    #kind;
    #id;
    #channelId;
    #title;
    #description;
    #thumbnails;
    #channelTitle;
    #liveBroadcastContent;

    constructor(data) {
        this.#kind = "youtube#searchResult";
        const videoData = data.videoRenderer;
        const channelData = data.channelRenderer;
        const playlistData = data.playlistRenderer
        this.#id = {
            kind: videoData ? "youtube#video" : channelData ? "youtube#channel" : "youtube#playlist",
            videoId: videoData?.videoId,
            channelId: channelData?.channelId,
            playlistId: playlistData?.playlistId
        };
        this.#channelId = videoData ? videoData.ownerText.runs[0].navigationEndpoint.browseEndpoint.browseId : channelData ? this.#id.channelId : playlistData.longBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId;
        this.#title = videoData ? videoData.title.runs.map((value) => value.text).join() : (channelData ? channelData : playlistData).title.simpleText;
        this.#description = videoData ? videoData.detailedMetadataSnippets?.[0].snippetText.runs.map((value) => value.text).join() : channelData?.descriptionSnippet?.runs.map(value => value.text).join();
        this.#thumbnails = {
            default: {
                url: videoData || playlistData ? `https://i.ytimg.com/vi/${(videoData ? this.#id.videoId : playlistData.videos[0].childVideoRenderer.navigationEndpoint.watchEndpoint.videoId)}/default.jpg` : "https:" + channelData.thumbnail.thumbnails[0].url,
                width: videoData || playlistData ? 120 : 88,
                height: videoData || playlistData ? 90 : 88
            },
            medium: {
                url: videoData || playlistData ? `https://i.ytimg.com/vi/${(videoData ? this.#id.videoId : playlistData.videos[0].childVideoRenderer.navigationEndpoint.watchEndpoint.videoId)}/mqdefault.jpg` : "https:" + channelData.thumbnail.thumbnails[0].url.replace("=s88", "=s240"),
                width: videoData || playlistData ? 320 : 240,
                height: videoData || playlistData ? 180 : 240
            },
            high: {
                url: videoData || playlistData ? `https://i.ytimg.com/vi/${(videoData ? this.#id.videoId : playlistData.videos[0].childVideoRenderer.navigationEndpoint.watchEndpoint.videoId)}/hqdefault.jpg` : "https:" + channelData.thumbnail.thumbnails[0].url.replace("=s88", "=s800"),
                width: videoData || playlistData ? 480 : 800,
                height: videoData || playlistData ? 360 : 800
            },
            standard: videoData || playlistData ? {
                url: `https://i.ytimg.com/vi/${(videoData ? this.#id.videoId : playlistData.videos[0].childVideoRenderer.navigationEndpoint.watchEndpoint.videoId)}/sddefault.jpg`,
                width: 640,
                height: 480
            } : undefined,
            maxres: videoData || playlistData ? {
                url: `https://i.ytimg.com/vi/${(videoData ? this.#id.videoId : playlistData.videos[0].childVideoRenderer.navigationEndpoint.watchEndpoint.videoId)}/maxresdefault.jpg`,
                width: 1280,
                height: 720
            } : undefined
        }
        this.#channelTitle = videoData ? videoData.ownerText.runs.map((value) => value.text).join() : channelData ? this.#title : playlistData.longBylineText.runs[0].text;
        this.#liveBroadcastContent = videoData?.badges?.find((value) => value.metadataBadgeRenderer.label == "LIVE") ? "live" : "none";
    }

    get kind() {
        return this.#kind;
    };
    get id() {
        return this.#id;
    };
    get channelId() {
        return this.#channelId;
    };
    get title() {
        return this.#title;
    };
    get description() {
        return this.#description;
    };
    get thumbnails() {
        return this.#thumbnails;
    };
    get channelTitle() {
        return this.#channelTitle;
    };
    get liveBroadcastContent() {
        return this.#liveBroadcastContent;
    };

    toJSON() {
        return {
            kind: this.kind,
            id: this.id,
            channelId: this.channelId,
            title: this.title,
            description: this.description,
            thumbnails: this.thumbnails,
            liveBroadcastContent: this.liveBroadcastContent
        }
    };
}

class SearchListResponse {
    #kind;
    #nextPageToken;
    #regionCode;
    #pageInfo;
    #items;

    constructor(data) {
        this.#kind = "youtube#searchListResponse";
        this.#nextPageToken = data.contents?.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents.find((value) => value.continuationItemRenderer)?.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        this.#regionCode = "US";
        this.#pageInfo = {
            totalResults: Number(data.estimatedResults),
            resultsPerPage: null
        };
        const items = data.contents?.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents
            .find((value) => value.itemSectionRenderer)?.itemSectionRenderer.contents
            .filter((value) => value.videoRenderer || value.channelRenderer || value.playlistRenderer)
            .map((value) => new SearchResult(value));
        this.#items = items ? items : [];
    }

    async next() {
        if (!this.#nextPageToken) {
            return null;
        }
        const response = await request("/search", {
            continuation: this.#nextPageToken
        })
        const data = await (response.json());
        const continuationItems = data.onResponseReceivedCommands?.find((value) => value.appendContinuationItemsAction)?.appendContinuationItemsAction.continuationItems
        this.#nextPageToken = continuationItems.find((value) => value.continuationItemRenderer)?.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        const newItems = continuationItems.find((value) => value.itemSectionRenderer)?.itemSectionRenderer.contents
            .filter((value) => value.videoRenderer || value.channelRenderer || value.playlistRenderer)
            .map((value) => new SearchResult(value));
        this.#items = this.#items.concat(newItems);
        return newItems;
    }

    get kind() {
        return this.#kind;
    };
    get nextPageToken() {
        return this.#nextPageToken;
    };
    get regionCode() {
        return this.#regionCode;
    };
    get pageInfo() {
        return this.#pageInfo;
    };
    get items() {
        return this.#items;
    };

    toJSON() {
        return {
            kind: this.kind,
            nextPageToken: this.nextPageToken,
            regionCode: this.regionCode,
            pageInfo: this.pageInfo,
            items: this.items
        }
    };
}

async function getVideo(id) {
    const js = await getJs(await getPlayerId(id));
    const response = await request("/player", {
        videoId: id,
        playbackContext: {
            contentPlaybackContext: {
                signatureTimestamp: js.signatureTimestamp
            }
        },
        racyCheckOk: false,
        contentCheckOk: false
    })
    if (response.status != 200) {
        return null;
    } else {
        return new Video(await response.json(), js);
    }
}

async function getPlaylist(id) {
    const response = await request("/browse", { browseId: "VL" + id });
    if (response.status != 200) {
        return null;
    } else {
        return new Playlist(await response.json());
    }
}

async function listSearchResults(q, type) {
    const response = await request("/search", {
        query: q,
        params: type == "video" ? "EgIQAQ%3D%3D" : type == "channel" ? "EgIQAg%3D%3D" : type == "playlist" ? "EgIQAw%3D%3D" : undefined
    })
    if (response.status != 200) {
        return null;
    } else {
        return new SearchListResponse(await response.json());
    }
}

export {
    getVideo,
    getPlaylist,
    listSearchResults
}
