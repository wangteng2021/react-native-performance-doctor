;(function (window, undefined) {
    function Report() {
        if (!(this instanceof Report))
            return new Report()
    }

    //appChannel
    Report.prototype.appChannel = ''
    //gameId
    Report.prototype.gameId = 0
    //env
    Report.prototype.env = 0

    //生成的模拟用户id
    Report.prototype.uuid = ''
    //uuid中的时间戳
    Report.prototype.sl_ms = 0

    Report.prototype.httpAddress = ''
    Report.prototype.initServer = function () {
        if (this.env === 0) {
            this.httpAddress = 'https://game-gm-log-server.jieyou.shop/client_log/dev/add';
        } else if (this.env === 1) {
            this.httpAddress = 'https://game-gm-log-server.jieyou.shop/client_log/test/add';
        } else {
            this.httpAddress = 'https://game-gm-log-server.jieyou.shop/client_log/prod/add';
        }
    }
    /**
     * 上报加载进度
     * @param type 类型
     * 1:成功拉起游戏
     * 2:游戏资源开始加载
     * 3:游戏资源加载完成
     * 4.getConfig数据请求
     * 5.getConfig数据回包
     * 6:游戏登录成功，进入游戏主页
     * 7:不支持WebGL
     * @param ms 时间戳
     * @param appId 商户Id
     * @param userId 用户真实Id
     */
    Report.prototype.webProcess = function (type, ms, appId, userId) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.httpAddress);
        xhr.setRequestHeader('Content-type', 'application/json');
        var data = {
            uuid: this.uuid,
            sl_ms: this.sl_ms,
            user_id: userId,
            app_id: parseInt(appId),
            app_channel: this.appChannel,
            game_id: this.gameId,
            ms_time: ms,
            type: type
        }
        xhr.send(JSON.stringify(data));
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                console.log(xhr.responseText)
            }
        }
    }

    window.BSUtils.Report = new Report()
})(window)