// Dummy SAX parser that never parses anything

function Parser() {
  this.onend = function() {}
}

Parser.prototype.close = function() {
  this.onend();
}

Parser.prototype.write = function() {
}

exports.parser = function() {
  return new Parser();
}
