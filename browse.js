var iso8601DurationRegex = /(-)?P(?:([\.,\d]+)Y)?(?:([\.,\d]+)M)?(?:([\.,\d]+)W)?(?:([\.,\d]+)D)?T(?:([\.,\d]+)H)?(?:([\.,\d]+)M)?(?:([\.,\d]+)S)?/;

function parseISO8601Duration(s) {
  var m = s.match(iso8601DurationRegex);

  return (m[8] === undefined ? 0 : m[8]) * 1 +
    (m[7] === undefined ? 0 : m[7]) * 60 +
    (m[6] === undefined ? 0 : m[6]) * 3600 +
    (m[5] === undefined ? 0 : m[5]) * 86400;
};


function trimlf(s) {
  return s.replace(/(\r\n|\n|\r)/gm,"");
}


function populatePageFromResults(page, result) {
  var items = {};
  var allvideos = [];

  for(var i = 0; i < result.items.length; i++) {

    var item = result.items[i];
    var URI;

    switch(item.kind) {
    case 'youtube#playlistItem':
      var vid = item.snippet.resourceId.videoId;
      URI = PREFIX + ":video:" + vid;
      allvideos.push(vid);
      items[vid] = page.appendItem(URI, 'video', {
        title: item.snippet.title,
        icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails),
        description: trimlf(item.snippet.description)
      });
      break;

    case 'youtube#searchResult':

      switch(item.id.kind) {
      case 'youtube#playlist':
        page.appendItem(PREFIX + ":playlist:" + item.id.playlistId, 'playlist', {
          title: item.snippet.title,
          icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails),
        });
        break;

      case 'youtube#video':
        URI = PREFIX + ":video:" + item.id.videoId;
        allvideos.push(item.id.videoId);
        items[item.id.videoId] = page.appendItem(URI, 'video', {
          title: item.snippet.title,
          icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails),
          description: trimlf(item.snippet.description)
        });
        break;

      case 'youtube#channel':
        page.appendItem(PREFIX + ":channel:" + item.id.channelId, 'directory', {
          title: item.snippet.title,
          icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails)
        });
        break;

      default:
        print("Unknown id.kind in result: " + item.id.kind);
        print(JSON.stringify(item, null, 4));
        return;
      }
      break;

    case 'youtube#subscription':
      var item = result.items[i];

      switch(item.snippet.resourceId.kind) {
      case 'youtube#channel':
        URI = PREFIX + ":channel:" + item.snippet.resourceId.channelId;
        break;
      default:
        print("Unknown resource.kind in result: " + item.snippet.resourceId.kind);
        print(JSON.stringify(item, null, 4));
        return;
      }

      page.appendItem(URI, 'directory', {
        title: item.snippet.title,
        icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails)
      });
      break;

    case 'youtube#videoCategory':
      URI = PREFIX + ":category:" + item.id;
      page.appendItem(URI, 'directory', {
        title: item.snippet.title
      });
      break;

    case 'youtube#playlist':
      page.appendItem(PREFIX + ":playlist:" + item.id, 'playlist', {
        title: item.snippet.title
      });
      break;

    case 'youtube#channel':
      page.appendItem(PREFIX + ":channel:" + item.id, 'directory', {
        title: item.snippet.title,
        icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails)
      });
      break;

    default:
      print("Unknown kind in result: " + item.kind);
      print(JSON.stringify(item, null, 4));
      return;
    }
  }

  if(allvideos.length > 0) {

    require('./api').call('videos', {
      id: allvideos.join(),
      part: 'snippet,contentDetails,statistics,status'
    }, null, function(result) {

      for(var i = 0; i < result.items.length; i++) {
        var item = result.items[i];
        var itemid = item.id;
        var metadata = items[itemid].root.metadata;

        metadata.duration     = parseISO8601Duration(item.contentDetails.duration);
        metadata.description  = trimlf(item.snippet.description);
        metadata.viewCount    = parseInt(item.statistics.viewCount);
        metadata.likeCount    = parseInt(item.statistics.likeCount);
        metadata.dislikeCount = parseInt(item.statistics.dislikeCount);

        if(item.snippet.channelId)
          items[itemid].addOptURL('Goto channel ' + item.snippet.channelTitle,
                                  PREFIX + ":channel:" + item.snippet.channelId,
                                 'tv');
      }
    });
  }
}


exports.browse = function(endpoint, page, query) {

  page.loading = true;
  page.type = 'directory';

  if(!query.part)
    query.part = 'snippet';

  query.maxResults = 10;

  function loader() {

    require('./api').call(endpoint, query, page, function(result) {
      if(result.pageInfo && result.pageInfo.totalResults === 0) {
        page.type = 'empty';
        return;
      }
      populatePageFromResults(page, result);
      query.pageToken = result.nextPageToken;
      page.haveMore(!!query.pageToken);
    });
  }

  loader();
  page.asyncPaginator = loader;
}




exports.search = function(page, query) {
  query.regionCode = getRegion();

  page.loading = true;
  page.type = 'directory';

  if(!query.part)
    query.part = 'snippet';

  query.maxResults = 10;


  function loader() {
    require('./api').call('search', query, page, function(result) {

      if(result.pageInfo && result.pageInfo.totalResults === 0) {
        page.type = 'empty';
        return;
      }
      populatePageFromResults(page, result);
      query.pageToken = result.nextPageToken;
      page.haveMore(!!query.pageToken);
    });
  }


  function reload() {
    delete query.pageToken;
    page.flush();
    loader();
  }

  page.options.createMultiOpt('order', 'Order by', [
    ['relevance',  'Relevance', true],
    ['date',       'Date'],
    ['title',      'Title'],
    ['rating',     'Rating'],
    ['videoCount', 'Videos'],
    ['viewCount',  'View Count']], function(order) {
      query.order = order;
      if(page.asyncPaginator) {
        reload();
      }
    }, true);

  page.options.createMultiOpt('duration', 'Durations', [
    ['any',     'Any', true],
    ['short',  '<4 min'],
    ['medium',  '4-20 min'],
    ['long',    '>20 min']], function(duration) {
      query.videoDuration = duration;
      if(page.asyncPaginator) {
        reload();
      }
    }, true);

  loader();
  page.asyncPaginator = loader;
}

