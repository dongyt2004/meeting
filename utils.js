const sha1 = require("sha1");
const url = require("url");

const Utils = exports;

// Calculates the checksum given a url `fullUrl` and a `salt`, as calculate by bbb-web.
Utils.checksumAPI = function(fullUrl, salt) {
    const method = Utils.methodFromUrl(fullUrl);
    const query = Utils.queryFromUrl(fullUrl);
    return Utils.checksum(method + query + salt);
};

// Calculates the checksum for a string.
// Just a wrapper for the method that actually does it.
Utils.checksum = function(string) {
    return sha1(string);
};

// Get the method name of an API call from the url object (from url.parse())
// Example:
//
// * `fullUrl` = `http://mconf.org/bigbluebutton/api/create?name=Demo+Meeting&meetingID=Demo`
// * returns: `create`
Utils.methodFromUrl = function(fullUrl) {
    const urlObj = url.parse(fullUrl, true);
    return urlObj.pathname.substr(("/bigbluebutton/api/").length);
};

// Get the query of an API call from the url object (from url.parse())
// Example:
//
// * `fullUrl` = `http://bigbluebutton.org/bigbluebutton/api/create?name=Demo+Meeting&meetingID=Demo`
// * returns: `name=Demo+Meeting&meetingID=Demo`
Utils.queryFromUrl = function(fullUrl) {

    // Returns the query without the checksum.
    // We can't use url.parse() because it would change the encoding
    // and the checksum wouldn't match. We need the url exactly as
    // the client sent us.
    var query = fullUrl.replace(/&checksum=[^&]*/, '');
    query = query.replace(/checksum=[^&]*&/, '');
    query = query.replace(/checksum=[^&]*$/, '');
    const matched = query.match(/\?(.*)/);
    if (matched != null) {
        return matched[1];
    } else {
        return '';
    }
};

// Returns the IP address of the client that made a request `req`.
// If can not determine the IP, returns `127.0.0.1`.
Utils.ipFromRequest = function(req) {

    // the first ip in the list if the ip of the client
    // the others are proxys between him and us
    var ipAddress;
    if ((req.headers != null ? req.headers["x-forwarded-for"] : undefined) != null) {
        var ips = req.headers["x-forwarded-for"].split(",");
        ipAddress = ips[0] != null ? ips[0].trim() : undefined;
    }

    // fallbacks
    if (!ipAddress) { ipAddress = req.headers != null ? req.headers["x-real-ip"] : undefined; } // when behind nginx
    if (!ipAddress) { ipAddress = req.connection != null ? req.connection.remoteAddress : undefined; }
    if (!ipAddress) { ipAddress = "127.0.0.1"; }
    return ipAddress;
};
