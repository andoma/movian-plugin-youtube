/*
  Movian Youtube Plugin
  (c) 2016 Andreas Smas All rights reserved
 */

/*

 This plugin is split into multiple files and the intention is to keep the
 main youtube.js file small for faster loading on slower devices

 It's comprised of the following files

   youtube.js - This file

   api.js -  Youtube/Google API helper and authentication
   browse.js - Handle browse and search of endpoints

   ytdl-core/ - Files to extract URLs given Youtube links

*/


/**
 * ytdl depends on some things that are not available in Movian,
 * We can wrap the modSearch loader to append './support/' to those
 * modules which will make Movian look for these modules here instead.
 */
var modsearch = Duktape.modSearch;
Duktape.modSearch = function(a, b, c, d) {
  switch(a) {
   case 'html-entities':
   case 'path':
   case 'sax':
    return modsearch('./support/' + a, b, c, d);
  default:
    return modsearch(a,b,c,d);
  }
}


var REGION = 'us';
var PREFIX = "youtube";
var UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:15.0) Gecko/20100101 Firefox/15.0.1'
var page = require('showtime/page');
var io = require('native/io'); // XXX: Bad to require('native/')
var prop = require('showtime/prop');

io.httpInspectorCreate('https://www.youtube.com/.*', function(ctrl) {
  ctrl.setHeader('User-Agent', UA);
  return 0;
});



/*
 * Get ISO 3166-1 Alpha 2 region code.
 * Movian stores this in the global property tree.
 */
prop.subscribeValue(prop.global.location.cc, function(value) {
  if(typeof value === 'string') {
    REGION = value;
    console.log("Region set to " + value);
  }
});




function oprint(o) {
  // print an object, this should really be a Movian builtin
  print(JSON.stringify(o, null, 4));
}





/**
 * Small helper to decorate the page metadata with info from the given
 * endpoint+query
 */
function pagemeta(page, endpoint, query) {
  query.part = 'snippet';
  require('./api').call(endpoint, query, null, function(info) {
    var item = info.items[0];
    page.metadata.title = item.snippet.title;
    if(item.snippet.thumbnails)
      page.metadata.icon = 'imageset:' + JSON.stringify(item.snippet.thumbnails);
  });
}


// Create the service (ie, icon on home screen)
require('showtime/service').create("Youtube", PREFIX + ":start", "video", true,
                                   Plugin.path + 'youtube.svg');


// Setup all the routes we need
// Most of these just maps this to a browse query
new page.Route(PREFIX + ":channel:(.*)", function(page, channelid) {
  pagemeta(page, 'channels', {id: channelid});
  require('./browse').search(page, {
    channelId: channelid
  });
});


new page.Route(PREFIX + ":category:(.*)", function(page, category) {
  page.metadata.icon = Plugin.path + 'youtube.svg';
  pagemeta(page, 'videoCategories', {id: category});
  require('./browse').search(page, {
    videoCategoryId: category,
    type: 'video',
  });
});

new page.Route(PREFIX + ":search:(.*)", function(page, query) {
  page.metadata.icon = Plugin.path + 'youtube.svg';
  page.metadata.title = 'Search results for: ' + query;
  require('./browse').search(page, {
    q: query
  });
});

new page.Route(PREFIX + ":categories", function(page) {
  page.metadata.title = 'Categories';
  page.metadata.icon = Plugin.path + 'youtube.svg';
  require('./browse').browse('videoCategories', page, {
    regionCode: REGION
  });
});

new page.Route(PREFIX + ":my:subscriptions", function(page) {
  page.metadata.title = "Recent activity";
  require('./browse').browse('activities', page, {
    home: true,
    part: 'snippet,contentDetails',
  });
});

new page.Route(PREFIX + ":my:playlists", function(page) {
  page.metadata.title = "My playlists";
  require('./browse').browse('playlists', page, {
    mine: true
  });
});

function playlistPage(page, playlistid) {
  pagemeta(page, 'playlists', {id: playlistid});
  require('./browse').browse('playlistItems', page, {
    playlistId: playlistid
  });
}

new page.Route(PREFIX + ":playlist:(.*)", playlistPage);
new page.Route("https://www.youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 
new page.Route("https://youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 
new page.Route("http://www.youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 
new page.Route("http://youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 

new page.Route(PREFIX + ":guidecategory:(.*)", function(page, catid) {
  pagemeta(page, 'guideCategories', {id: catid});
  page.model.contents = 'grid';
  require('./browse').browse('channels', page, {
    categoryId: catid
  });
});

new page.Route(PREFIX + ":my:channel", function(page) {
  page.type = 'directory';

  require('./api').call('channels', {
    part: 'snippet,contentDetails',
    mine: true
  }, page, function(info) {
    var item = info.items[0];
    page.metadata.showTitleAndIcon = true;
    page.metadata.title = item.snippet.title;
    if(item.snippet.thumbnails)
      page.metadata.icon = 'imageset:' + JSON.stringify(item.snippet.thumbnails);

    page.appendItem(PREFIX + ":my:playlists", 'playlist', {
      title: "My playlists",
    });

    var relatedLists = ['likes', 'favorites', 'uploads', 'watchHistory', 'watchLater'];
    var idlist = [];
    var items = {};
    for(a in relatedLists) {
      var type = relatedLists[a];
      var playlistid = item.contentDetails.relatedPlaylists[type];
      if(type) {
        idlist.push(playlistid);
        items[playlistid] = page.appendItem(PREFIX + ":playlist:" + playlistid, 'playlist', {});
      }
    }

    // Do one extra call to figure out the name for the playlists we
    // extracted above

    require('./api').call('playlists', {
      id: idlist.join(),
      part: 'snippet'
    }, null, function(result) {
      for(var i = 0; i < result.items.length; i++) {
        var item = result.items[i];
        var itemid = item.id;
        var metadata = items[itemid].root.metadata;
        metadata.title = item.snippet.title;
        metadata.icon = 'imageset:' + JSON.stringify(item.snippet.thumbnails);
      }
    });
  });
});



// Landing page
new page.Route(PREFIX + ":start", function(page) {
  page.type = 'directory';
  page.metadata.title = "Youtube";
  page.metadata.icon = Plugin.path + 'youtube.svg';

  page.appendItem(PREFIX + ":search:", 'search', {
    title: 'Search Youtube'
  });

  page.appendItem(null, 'separator', {
    title: 'My Youtube'
  });

  page.appendItem(PREFIX + ":my:subscriptions", 'directory', {
    title: "My subscriptions",
  }).root.subtype = 'subscriptions';


  page.appendItem(PREFIX + ":my:channel", 'directory', {
    title: 'My Channel'
  });

  page.appendItem(null, 'separator', {
    title: 'Channel Guide'
  });

  require('./api').call('guideCategories', {
    part: 'snippet',
    regionCode: REGION
  }, null, function(result) {

    for(var x in result.items) {
      var item = result.items[x];
      page.appendItem(PREFIX + ":guidecategory:" + item.id, 'directory', {
        title: item.snippet.title
      });
    }
  });
});



// Page for video playback
// Most of the stuff happens in the ytdl-core code
function videoPage(page, id) {
  var ytdl = require('./ytdl-core/lib/info');
  page.loading = true;
  page.type = 'video';

  ytdl('https://www.youtube.com/watch?v=' + id, function(err, info) {
    page.loading = false;
    if(err) {
      page.error(err);
      return;
    }

    var url = info.formats[0].url;
    var mimetype = (info.formats[0].type ? info.formats[0].type.split(';')[0] : '');  
    if (!mimetype)
        url = 'hls:' + url;
    
    var videoParams = {
      title: unescape(info.title),
      icon: info.iurlmaxres,
      canonicalUrl: PREFIX + ':video:' + info.video_id,
      sources: [{
        url: url,
        mimetype: mimetype,
      }],
      no_subtitle_scan: true,
      subtitles: []
    }

    page.source = 'videoparams:' + JSON.stringify(videoParams);
  });
}


// Routes for video playback
new page.Route(PREFIX + ":video:(.*)", videoPage);

// These allows us to play standard youtube links
new page.Route("http://www.youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("https://www.youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("http://youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("https://youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("http://youtu.be/([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("https://youtu.be/([A-Za-z0-9_\\-]*)", videoPage);
