const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const fs = require('fs');
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
    res.status(200).render('test');
});
// 取摘要任务
var summary_task = function(callback, results) {
    request.post({
        url: "http://partition-svc.nlp:8080",   //"http://summary.ruoben.com:8008",
        json: true,
        body: {text: results.text_task},
        timeout: 600000
    }, function (err, res, summary) {
        if (err) {
            callback(err.toString());
        } else {
            if (res.statusCode === 200) {
                console.log('summary=' + summary);  /////////////////
                var sum_obj = {};
                var lines = summary.split('\n');
                for(var i=0; i<lines.length; i++) {
                    sum_obj['' + i] = lines[i];
                }
                fs.writeFile("/var/bigbluebutton/published/presentation/test/webcams.sum", summary, function (err2) {
                // fs.writeFile("C:\\Users\\dongyt\\Desktop\\test\\webcams.sum", summary, function (err2) {
                    if (err2) {
                        callback("写sum文件报错");
                    } else {
                        callback(null, sum_obj);
                    }
                });
            } else {
               callback("调用summary接口报错");
            }
        }
    });
};
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
            console.log('title=' + title);  /////////////////
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
// 取原文中的ner任务
var ner_task = function(callback, results) {
    var block = '', blocks = [];
    var lines = results.text_task.split('\n');
    for(var i=0; i<lines.length; i++) {
        var str = block + lines[i];
        if (str.length > 1500) {
            blocks.push(block);
            block = lines[i] + '\n';
        } else {
            block = str + '\n';
        }
    }
    blocks.push(block.substr(0, block.length - 1));
    var ners = [];
    eachAsync(blocks, function(block, index, done) {
        request.post({
            url: "http://dd-ner-4in1-svc.nlp",   //"http://dd-ner-4in1.ruoben.com:8008",
            body: block
        }, function (err, res, body) {
            if (err) {
                done(err.toString());
            } else {
                if (res.statusCode === 200) {
                    var json = JSON.parse(body);
                    var ner = [];
                    for(var i = 0; i < json['sentences'].length; i++) {
                        for(var j = 0; j < json['sentences'][i]['tokens'].length; j++) {
                            var n = json['sentences'][i]['tokens'][j].ner;
                            if (n === 'PERSON' || n === 'FOREIGN' || n === 'ORG' || n === 'FOREIGN_ORG' || n === 'PLACE' || n === 'FOREIGN_PLACE') {
                                ner.push(json['sentences'][i]['tokens'][j].word);
                            }
                        }
                    }
                    ner = _.uniq(ner);
                    ner = _.filter(ner, function(word) {
                        return word.length > 1;
                    });
                    ners = ners.concat(ner);
                    done();
                } else {
                    done("调用ner接口报错");
                }
            }
        });
    }, function(error) {
        if (error) {
            console.error(error);
            callback(error.toString());
        } else {
            ners = _.uniq(ners);
            console.log('ner=' + JSON.stringify(ners));  ///////////////////
            callback(null, ners);
        }
    });
};
// 取关系任务
var spo_task = function(callback, results) {
    request.post({
        url: "http://triple-svc.nlp:50000",  //"http://triple.ruoben.com:8008",
        headers: {
            "Content-Type": "text/plain"
        },
        body: results.text_task,
        timeout: 600000
    }, function (err, res, body) {
        if (err) {
            callback(err.toString());
        } else {
            if (res.statusCode === 200) {
                console.log("spo=" + body);  //////////////////
                fs.writeFile("/var/bigbluebutton/published/presentation/test/webcams.mnd", JSON.stringify({'speaker': '测试用户', 'sum_obj': results.summary_task, 'title': results.title_task, 'spo': body}), function (err3) {
                // fs.writeFile("C:\\Users\\dongyt\\Desktop\\test\\webcams.mnd", JSON.stringify({'speaker': '测试用户', 'sum_obj': results.summary_task, 'title': results.title_task, 'spo': retain}), function (err3) {
                    if (err3) {
                        callback("写mnd文件报错");
                    } else {
                        callback(null);
                    }
                });
            } else {
                callback("调用ltp接口报错");
            }
        }
    });
};
// 接收语音识别得到的文本并生成摘要和脑图
app.post("/test-text", function (req, response) {
    console.log('----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
    var text = '' + req.body;  // 原文
    console.log('text=' + text);  //////////////////////
    fs.writeFile("/var/bigbluebutton/published/presentation/test/webcams.txt", text, function (error) {
    // fs.writeFile("C:\\Users\\dongyt\\Desktop\\test\\webcams.txt", text, function (error) {
        if (error) {
            console.error('写txt文件报错');
            response.header('Content-Type', 'text/plain; charset=utf-8').status(500).end("写txt文件报错");
        } else {
            async.auto({
                text_task: function (callback) {
                    callback(null, text);
                },
                summary_task: ['text_task', summary_task],
                title_task: ['text_task', title_task],
                spo_task: ['summary_task', 'title_task', spo_task]
            }, function(err) {
                if (err) {
                    console.error(err);
                    response.header('Content-Type', 'text/plain; charset=utf-8').status(500).end(err);
                } else {
                    response.header('Content-Type', 'text/plain; charset=utf-8').status(200).end("success");
                }
            });
        }
    });
});
// 取摘要和思维导图，用于test
app.get("/test-resource", function (req, res) {
    var exist = fs.existsSync("/var/bigbluebutton/published/presentation/test/webcams.mnd");
    // var exist = fs.existsSync("C:\\Users\\dongyt\\Desktop\\test\\webcams.mnd");
    if (exist) {
        fs.readFile("/var/bigbluebutton/published/presentation/test/webcams.sum", function (err, summary) {
        // fs.readFile("C:\\Users\\dongyt\\Desktop\\test\\webcams.sum", function (err, summary) {
            if (err) {
                console.error(err);
                res.status(500).end(err.toString());
            } else {
                fs.readFile("/var/bigbluebutton/published/presentation/test/webcams.mnd", function (err, mnd) {
                // fs.readFile("C:\\Users\\dongyt\\Desktop\\test\\webcams.mnd", function (err, mnd) {
                    if (err) {
                        console.error(err);
                        res.status(500).end(err.toString());
                    } else {
                        var mind = JSON.parse(mnd.toString().replace(/%/g, '%25'));
                        var sum_obj = mind['sum_obj'];
                        res.status(200).json({'sum': summary.toString(), 'sum_obj': JSON.stringify(sum_obj).replace(/%25/g, '%')});
                    }
                });
            }
        });
    } else {
        res.header('Content-Type', 'text/plain; charset=utf-8').status(404).end("文件不存在");
    }
});
// 取speaker的思维导图
app.get("/getmind/:recordId/:speakerId", function (req, res) {
    if (req.params.recordId === 'test') {
        var exist = fs.existsSync("/var/bigbluebutton/published/presentation/test/webcams.mnd");
        // var exist = fs.existsSync("C:\\Users\\dongyt\\Desktop\\test\\webcams.mnd");
        if (exist) {
            fs.readFile("/var/bigbluebutton/published/presentation/test/webcams.mnd", function (err, mnd) {
            // fs.readFile("C:\\Users\\dongyt\\Desktop\\test\\webcams.mnd", function (err, mnd) {
                if (err) {
                    console.error(err);
                    res.status(500).end(err.toString());
                } else {
                    var mind = JSON.parse(mnd.toString().replace(/%/g, '%25'));
                    mind['record'] = 'test';
                    res.status(200).json(mind);
                }
            });
        } else {
            res.header('Content-Type', 'text/plain; charset=utf-8').status(404).end("文件不存在");
        }
    } else {
        var exist = fs.existsSync("/var/bigbluebutton/published/presentation/" + req.params.recordId + "/video/webcams." + req.params.speakerId + ".mnd");
        // var exist = fs.existsSync("C:\\Users\\dongyt\\Desktop\\test\\webcams.mnd");
        if (exist) {
            fs.readFile("/var/bigbluebutton/published/presentation/" + req.params.recordId + "/video/webcams." + req.params.speakerId + ".mnd", function (err, mnd) {
            // fs.readFile("C:\\Users\\dongyt\\Desktop\\test\\webcams.mnd", function (err, mnd) {
                if (err) {
                    console.error(err);
                    res.status(500).end(err.toString());
                } else {
                    var mind = JSON.parse(mnd.toString().replace(/%/g, '%25'));
                    mind['record'] = req.params.recordId;
                    res.status(200).json(mind);
                }
            });
        } else {
            res.header('Content-Type', 'text/plain; charset=utf-8').status(404).end("文件不存在");
        }
    }
});

app.listen(1080, '0.0.0.0');
