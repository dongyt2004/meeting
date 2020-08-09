const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const https = require('https');
const adaro = require('adaro');
const path = require('path');
const md5 = require('md5');
const _ = require('lodash');
const eachAsync = require('each-async');
const async = require('async');
/** ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- **/
var app = express();
app.engine('dust', adaro.dust({
    helpers: ['dustjs-helpers']
}));
app.set('views', path.join(__dirname, 'view'));
app.set('view engine', 'dust');
app.use(bodyParser.text({limit: '10mb'}));
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({limit: '100mb', extended: false}));
app.use(express.static(path.join(__dirname, 'public')));
/** ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- **/
// 获得access_token
const API_KEY = "DOUGGvwuB7wEe0Nu6jygFdeV";
const SECRET_KEY = "yiaiTekE8QFXlGG0jy8YP0s6qgQIhGkH";
var access_token = '';
https.get({
        hostname: 'aip.baidubce.com',
        path: '/oauth/2.0/token?grant_type=client_credentials&client_id=' + API_KEY + "&client_secret=" + SECRET_KEY,
        agent: false
    }, function (res) {
        var body = [];
        res.on('data', function(chunk) {
            body.push(chunk);
        }).on('end', function() {
            var data = JSON.parse(Buffer.concat(body).toString());
            access_token = data['access_token'];
            console.log("access_token=" + access_token);
        });
    }
);
/** ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- **/
// 测试页
app.get("/", function (req, res) {
    res.status(200).render('meeting');
});
// 取标题任务
var title_task = function(callback, results) {
    var options = {
        hostname: 'aip.baidubce.com',
        path: '/rpc/2.0/nlp/v1/news_summary?charset=UTF-8&access_token=' + access_token,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    const req = https.request(options, function (res) {
        var body = [];
        res.on('data', function(chunk) {
            body.push(chunk);
        }).on('end', function() {
            var data = JSON.parse(Buffer.concat(body).toString());
            var title = data['summary'];  // 标题
            callback(null, title);
        });
    });
    req.on('error', function(err) {
        callback(err.toString());
    });
    var len = Math.round(results.text_task.length * 0.15);
    if (len < 50) {
        len = 50;
    } else if (len > 100) {
        len = 100;
    }
    var param = JSON.stringify({
        'content': results.text_task.substr(0, 2999),
        'max_summary_len': len
    });
    req.write(param);
    req.end();
};
// 取摘要任务
var summary_task = function(callback, results) {
    request.post({
        url: "http://partition-svc.nlp:8080",   // http://summary.ruoben.com:8008
        json: true,
        body: {text: results.text_task.replace(/\\n/g, '\\n')},
        timeout: 600000
    }, function (err, res, summary) {
        if (err) {
            callback(err.toString());
        } else {
            if (res.statusCode === 200) {
                callback(null, summary);
            } else {
               callback("调用summary接口报错");
            }
        }
    });
};
// 取spo任务
var spo_task = function(callback, results) {
    var spos = {};
    var lines = results.text_task.replace(/(\n[\s\t]*\r*\n)/g, '\n').replace(/^[\n\r\n\t]*|[\n\r\n\t]*$/g, '').split('\n');
    eachAsync(lines, function(line, index, done) {
        request.post({
            url: "http://triple-svc.nlp:50000",   // http://triple.ruoben.com:8008
            headers: {
                "Content-Type": "text/plain"
            },
            body: line,
            timeout: 600000
        }, function (err, res, spo) {
            if (err) {
                done(err.toString());
            } else {
                if (res.statusCode === 200) {
                    spo = JSON.parse(spo);
                    var triples = [];
                    for(var i = 0; i < spo.length; i++) {
                        if (spo[i].s && spo[i].p && spo[i].o) {
                            triples.push(flush(spo[i]));
                        }
                    }
                    spos[index] = dedup(triples);
                    done();
                } else {
                    done("调用triple接口报错");
                }
            }
        });
    }, function(error) {
        if (error) {
            console.error(error);
            callback(error.toString());
        } else {
            var ordered_spos = {};
            Object.keys(spos).sort().forEach(function(key) {
                ordered_spos[key] = spos[key];
            });
            callback(null, ordered_spos);
        }
    });
};
// 清洗三元组，去掉符号
function flush(spo_object) {
    if ((typeof spo_object) === 'string') {
        return spo_object.replace(/{/g, "").replace(/}/g, "").replace(/\[/g, "").replace(/]/g, "").replace(/</g, "").replace(/>/g, "").replace(/《/g, "").replace(/》/g, "").replace(/`/g, "").replace(/\(/g, "").replace(/\)/g, "").replace(/~/g, "").replace(/«/g, "").replace(/»/g, "").replace(/【/g, "").replace(/】/g, "");
    } else {
        spo_object.s = spo_object.s.replace(/{/g, "").replace(/}/g, "").replace(/\[/g, "").replace(/]/g, "").replace(/</g, "").replace(/>/g, "").replace(/《/g, "").replace(/》/g, "").replace(/`/g, "").replace(/\(/g, "").replace(/\)/g, "").replace(/~/g, "").replace(/«/g, "").replace(/»/g, "").replace(/【/g, "").replace(/】/g, "");
        spo_object.p = spo_object.p.replace(/{/g, "").replace(/}/g, "").replace(/\[/g, "").replace(/]/g, "").replace(/</g, "").replace(/>/g, "").replace(/《/g, "").replace(/》/g, "").replace(/`/g, "").replace(/\(/g, "").replace(/\)/g, "").replace(/~/g, "").replace(/«/g, "").replace(/»/g, "").replace(/【/g, "").replace(/】/g, "");
        if ((typeof spo_object.o) === "string") {
            spo_object.o = spo_object.o.replace(/{/g, "").replace(/}/g, "").replace(/\[/g, "").replace(/]/g, "").replace(/</g, "").replace(/>/g, "").replace(/《/g, "").replace(/》/g, "").replace(/`/g, "").replace(/\(/g, "").replace(/\)/g, "").replace(/~/g, "").replace(/«/g, "").replace(/»/g, "").replace(/【/g, "").replace(/】/g, "");
        } else {
            for(var index=0; index<spo_object.o.length; index++) {
                spo_object.o[index] = flush(spo_object.o[index]);
            }
        }
    }
    return spo_object;
}
// 去重
function dedup(triples) {
    var to_del_index = [];
    for(var i=0; i<triples.length; i++) {
        var str_i = stringify(triples[i]);
        for(var j=i+1; j<triples.length; j++) {
            var str_j = stringify(triples[j]);
            if (str_i.indexOf(str_j) >= 0) {
                to_del_index.push(j);
            } else if (str_j.indexOf(str_i) >= 0) {
                to_del_index.push(i);
            }
        }
    }
    to_del_index = _.uniq(to_del_index);
    var all_index = [];
    for(index=0; index<triples.length; index++) {
        all_index.push(index);
    }
    var retain_index = all_index.filter(function (val) { return to_del_index.indexOf(val) === -1 });
    var result = [];
    for(i = 0; i<retain_index.length; i++) {
        filter_vn(triples[retain_index[i]], triples, retain_index[i]);
        result.push(triples[retain_index[i]]);
    }
    return result;
}

function stringify(spo_object) {
    var s = "";
    if ((typeof spo_object) === 'string') {
        s = spo_object;
    } else {
        s = spo_object.s + spo_object.p;
        if ((typeof spo_object.o) === "string") {
            s += spo_object.o;
        } else {
            for(var index=0; index<spo_object.o.length; index++) {
                s += stringify(spo_object.o[index]);
            }
        }
    }
    return s;
}
// 过滤掉动名词和o是空数组的spo
function filter_vn(spo_object, spo_array, idx) {
    if ((typeof spo_object) === 'string') {
        spo_array.splice(idx, 1);
    } else {
        if ((typeof spo_object.o) !== "string") {
            for(var index=0; index<spo_object.o.length; index++) {
                filter_vn(spo_object.o[index], spo_object.o, index);
            }
        }
    }
}
/*// 取知识元任务
var extract_task = function(callback, results) {
    var events = {};
    var lines = results.text_task.split('\n');
    eachAsync(lines, function(line, index, done) {
        request.post({
            url: "http://extract.ruoben.com:8008",   // http://extract-svc.nlp:44444
            headers: {
                "Content-Type": "text/plain"
            },
            body: line,
            timeout: 600000
        }, function (err, res, extract) {
            if (err) {
                done(err.toString());
            } else {
                if (res.statusCode === 200) {
                    extract = JSON.parse(extract);
                    var evt = [];
                    for(var i = 0; i < extract.events.length; i++) {
                        if (extract.events[i].subject !== '' && extract.events[i].predicate !== '' && extract.events[i]['object'] !== '') {
                            var subject = extract.events[i].subject.replace(/{/g, "").replace(/}/g, "").replace(/\[/g, "").replace(/]/g, "").replace(/</g, "").replace(/>/g, "").replace(/《/g, "").replace(/》/g, "").replace(/`/g, "").replace(/\(/g, "").replace(/\)/g, "").replace(/~/g, "").replace(/«/g, "").replace(/»/g, "").replace(/【/g, "").replace(/】/g, "");
                            var predicate = extract.events[i].predicate.replace(/{/g, "").replace(/}/g, "").replace(/\[/g, "").replace(/]/g, "").replace(/</g, "").replace(/>/g, "").replace(/《/g, "").replace(/》/g, "").replace(/`/g, "").replace(/\(/g, "").replace(/\)/g, "").replace(/~/g, "").replace(/«/g, "").replace(/»/g, "").replace(/【/g, "").replace(/】/g, "");
                            var object = extract.events[i]['object'].replace(/{/g, "").replace(/}/g, "").replace(/\[/g, "").replace(/]/g, "").replace(/</g, "").replace(/>/g, "").replace(/《/g, "").replace(/》/g, "").replace(/`/g, "").replace(/\(/g, "").replace(/\)/g, "").replace(/~/g, "").replace(/«/g, "").replace(/»/g, "").replace(/【/g, "").replace(/】/g, "");
                            evt.push({subject: subject, predicate: predicate, object: object});
                        }
                    }
                    events[index] = dedup(evt);
                    done();
                } else {
                    done("调用extract接口报错");
                }
            }
        });
    }, function(error) {
        if (error) {
            console.error(error);
            callback(error.toString());
        } else {
            console.log('events=' + JSON.stringify(events));  ///////////////////
            callback(null, events);
        }
    });
};
// 去重
function dedup(events) {
    var to_del_index = [];
    for(var i=0; i<events.length; i++) {
        var str_i = events[i].subject + events[i].predicate + events[i].object;
        for(var j=i+1; j<events.length; j++) {
            var str_j = events[j].subject + events[j].predicate + events[j].object;
            if (str_i.indexOf(str_j) >= 0) {
                to_del_index.push(j);
            } else if (str_j.indexOf(str_i) >= 0) {
                to_del_index.push(i);
            }
        }
    }
    to_del_index = _.uniq(to_del_index);
    var all_index = [];
    for(index=0; index<events.length; index++) {
        all_index.push(index);
    }
    var retain_index = all_index.filter(function (val) { return to_del_index.indexOf(val) === -1 });
    var result = [];
    for(i = 0; i<retain_index.length; i++) {
        result.push(events[retain_index[i]]);
    }
    return result;
}*/
// 接收文本并生成摘要和脑图
app.post("/", function (req, res) {
    console.log('----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
    var text = '' + req.body;  // 原文
    console.log('text=' + text);  //////////////////////
    async.auto({
        text_task: function (callback) {
            callback(null, text);
        },
        title_task: ['text_task', title_task],
        summary_task: ['text_task', summary_task],
        spo_task: ['text_task', spo_task]
    }, function(err, results) {
        if (err) {
            console.error(err);
            res.header('Content-Type', 'text/plain; charset=utf-8').status(500).end(err);
        } else {
            console.log('title=' + results.title_task);  /////////////////
            console.log('summary=' + results.summary_task);  /////////////////
            var spo = JSON.stringify(results.spo_task);
            console.log('spo=' + spo);  /////////////////
            res.status(200).json({'title': results.title_task, 'summary': results.summary_task, 'spo': spo});
        }
    });
});

app.listen(1080, '0.0.0.0');
