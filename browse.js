var api = require('./api');
var popup = require('showtime/popup');

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

var channelImageSetSizes = {
  'default': {
    width: 88,
    height: 88
  },
  'medium': {
    width: 240,
    height: 240
  },
  'high': {
    width: 800,
    height: 800
  }
}

var videoImageSetSizes = {
  'default': {
    width: 120,
    height: 90
  },
  'medium': {
    width: 320,
    height: 180
  },
  'high': {
    width: 480,
    height: 360
  }
}


function makeImageSet(thumbnails, sizemap) {
  var images = [];
  for(var k in thumbnails) {
    var v = thumbnails[k];
    if(!v.width && !v.height) {
      images.push({
        url: v.url,
        width: sizemap[k].width,
        height: sizemap[k].height,
      });
    } else {
      images.push({
        url: v.url,
        width: v.width,
        height: v.height,
      });
    }
  }
  return 'imageset:' + JSON.stringify(images);
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
        icon: makeImageSet(item.snippet.thumbnails, videoImageSetSizes),
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
          icon: makeImageSet(item.snippet.thumbnails, videoImageSetSizes),
          description: trimlf(item.snippet.description)
        });
        break;

      case 'youtube#channel':
        page.appendItem(PREFIX + ":channel:" + item.id.channelId, 'directory', {
          title: item.snippet.title,
          icon: makeImageSet(item.snippet.thumbnails, channelImageSetSizes),
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
        icon: makeImageSet(item.snippet.thumbnails, channelImageSetSizes),
      });
      break;

    case 'youtube#activity':
      if(item.snippet.type == 'recommendation') {
        var vid = item.contentDetails.recommendation.resourceId.videoId;
      } else {
        var vid = item.contentDetails.upload.videoId;
      }

      URI = PREFIX + ":video:" + vid;
      allvideos.push(vid);
      items[vid] = page.appendItem(PREFIX + ":video:" + vid, 'video', {
        title: item.snippet.title,
        icon: makeImageSet(item.snippet.thumbnails, videoImageSetSizes),
      });
      break;

    default:
      print("Unknown kind in result: " + item.kind);
      print(JSON.stringify(item, null, 4));
      return;
    }
  }

  if(allvideos.length > 0) {

    // Add Like & Dislike buttons to all video items

    for(var i in allvideos) {
      var vid = allvideos[i];
      var item = items[vid];

      var aux = {
        vid: vid,
        item: item,
      };

      aux.like = item.addOptAction('Like', function() {
        api.rate(this.vid, 'like', function(ok) {
          if(ok) {
            item.destroyOption(this.like);
            item.destroyOption(this.dislike);
          } else {
            popup.notify('Request to like video failed', 5);
          }
        }.bind(this));
      }.bind(aux), 'thumb_up');

      aux.dislike = item.addOptAction('Dislike', function() {
        api.rate(this.vid, 'dislike', function(ok) {
          if(ok) {
            item.destroyOption(this.like);
            item.destroyOption(this.dislike);
          } else {
            popup.notify('Request to dislike video failed', 5);
          }
        }.bind(this));
      }.bind(aux), 'thumb_down');
    }

    require('./api').call('videos', {
      id: allvideos.join(),
      part: 'snippet,contentDetails,statistics'
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

  query.maxResults = 30;

  function loader() {

    require('./api').call(endpoint, query, page, function(result) {
      if(result.pageInfo && result.pageInfo.totalResults === 0) {
        showNoContent(page);
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


function showNoContent(page) {
  page.flush();
  page.type = 'directory';
  page.appendPassiveItem('file', '', {
    title: 'No content'
  });
}


exports.search = function(page, query) {
  query.regionCode = REGION;

  page.loading = true;
  page.type = 'directory';

  if(!query.part)
    query.part = 'snippet';

  query.maxResults = 30;

  function loader() {
    require('./api').call('search', query, page, function(result) {

      if(result.pageInfo && result.pageInfo.totalResults === 0) {
        showNoContent(page);
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
      if(duration != 'any') 
        query.type = 'video'
      if(page.asyncPaginator) {
        reload();
      }
    }, true);

  loader();
  page.asyncPaginator = loader;
}

