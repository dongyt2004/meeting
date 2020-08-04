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
        url: "http://summary.ruoben.com:8008",   //"http://partition-svc.nlp:8080"
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
// 取知识元任务
var extract_task = function(callback, results) {
    request.post({
        url: "http://extract.ruoben.com:8008",   //"http://partition-svc.nlp:8080"
        headers: {
            "Content-Type": "text/plain"
        },
        body: results.text_task,
        timeout: 600000
    }, function (err, res, extract) {
        if (err) {
            callback(err.toString());
        } else {
            if (res.statusCode === 200) {
                callback(null, extract);
            } else {
                callback("调用extract接口报错");
            }
        }
    });
};
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
        extract_task: ['text_task', extract_task]
    }, function(err, results) {
        if (err) {
            console.error(err);
            res.header('Content-Type', 'text/plain; charset=utf-8').status(500).end(err);
        } else {
            console.log('title=' + results.title_task);  /////////////////
            console.log('summary=' + results.summary_task);  /////////////////
            console.log('extract=' + results.extract_task);  /////////////////
            res.status(200).json({'title': results.title_task, 'summary': results.summary_task, 'extract': results.extract_task});
        }
    });
});

app.listen(1080, '0.0.0.0');
