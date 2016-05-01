exports.AllHtmlEntities = function() {}

exports.AllHtmlEntities.prototype.decode = function(str) {
  return require('native/string').entityDecode(str);
}
