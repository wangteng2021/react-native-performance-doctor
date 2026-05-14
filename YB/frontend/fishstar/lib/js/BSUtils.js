;(function (window, undefined) {
    function BSUtils() {
        if (!(this instanceof BSUtils))
            return new BSUtils()
    }

    BSUtils.fn = BSUtils.prototype = {
        BSUtils: '1.0.0'
    }
    BSUtils.fn.report = null
    BSUtils.fn.reportCommplted = false

    BSUtils.fn.appChannel = null

    /**
     * 加载report模块
     */
    BSUtils.fn.loadReport = function (cb) {
        this.addScript('lib/js/common/report.js?v=1', () => {
            this.report = window.BSUtils.Report;
            cb && cb();
        })
    }
    /**
     * 初始化report
     * @param appChannel 渠道名称
     * @param gameId 游戏id
     * @param env 发布环境  0 开发 1测试 2正式
     */
    BSUtils.fn.initReport = function (appChannel, gameId, env) {
        if (typeof appChannel === 'undefined') return;
        if (typeof appChannel === null) return;
        if (appChannel.trim().length === 0) return;
        this.report.appChannel = appChannel;
        this.report.gameId = gameId;
        this.report.env = env;
        this.reportCommplted = true;
        this.report.initServer();
    }
    /**
     * 上报加载进度
     */
    BSUtils.fn.reportProcess = function (type, appId = 0, userId = '') {
        if (!this.reportCommplted) return;
        var ms = this.getMs();
        if (type === 1) {
            var uuid = this.getUUID(ms)
            this.report.sl_ms = ms;
            this.report.uuid = this.report.appChannel + '_' + uuid;
        }
        this.report.webProcess(type, ms, appId, userId)
    }

    /**
     * 加载appChannel模块
     */
    BSUtils.fn.loadAppChannel = function (cb) {
        this.addScript('lib/js/common/appChannel.js?v=1', () => {
            this.appChannel = window.BSUtils.AppChanel;
            cb && cb();
        })
    }
    /**
     * 初始化channel
     * @param appChannel
     */
    BSUtils.fn.initAppChannel = function (appChannel) {
        if (typeof appChannel === 'undefined') return;
        if (typeof appChannel === null) return;
        if (appChannel.trim().length === 0) return;
        this.appChannel.channel = appChannel;
        this.appChannel.init();
    }

    /**
     *
     * @param moduleName
     * @param cb
     */
    BSUtils.fn.addScript = function (moduleName, cb) {
        function scriptLoaded() {
            document.body.removeChild(domScript);
            domScript.removeEventListener('load', scriptLoaded, false);
            cb && cb();
        }

        var domScript = document.createElement('script');
        domScript.async = true;
        domScript.src = moduleName;
        domScript.addEventListener('load', scriptLoaded, false);
        document.body.appendChild(domScript);
    }
    /**
     * 生成时间戳
     * @returns {number}
     */
    BSUtils.fn.getMs = function () {
        return Date.now();
    }
    /**
     * 生成一个永不重复的ID
     * 36进制字符串
     * @param ms 时间戳
     * @param randomLength 长度
     * @returns {string}
     */
    BSUtils.fn.getUUID = function (ms, randomLength = 10) {
        return Number(Math.random().toString().substr(2, randomLength) + ms).toString(36);
    }
    /**
     * 获取URL拼接参数
     * @param url
     * @returns {{}}
     * @constructor
     */
    BSUtils.fn.GetUrlParams = function (url) {
        let urlArr = url.split("?");
        let data = {};
        if (urlArr.length === 1) return data;
        for (let i = 1; i <= urlArr.length - 1; i++) {
            let paramsStr = decodeURIComponent(urlArr[i]);
            if (paramsStr && paramsStr !== 'undefined') {
                let paramsArr = paramsStr.split("&");
                paramsArr.forEach((str) => {
                    let key = str.split("=")[0];
                    let value = str.split("=")[1];
                    if (value) data[key] = value;
                });
            }
        }
        return data;
    }

    window.BSUtils = new BSUtils()
})(window)