;(function (window, undefined) {
    function AppChanel() {
        if (!(this instanceof AppChanel))
            return new AppChanel()
    }

    AppChanel.prototype.bsUtils = window.BSUtils;
    //appChannel
    AppChanel.prototype.channel = ''
    AppChanel.prototype.init = function () {
        switch (this.channel) {
            case 'likee':
                this.initLikee()
                break;
            case 'imo':
                this.initImo()
                break;
            case 'kafu':
                this.initKafu()
                break;
            case 'kafucoin':
                this.initKafu()
                break;
            case 'kwaime':
                this.initKwaime()
                break;
            case 'kwaime_tur':
                this.initKwaime()
                break;
            case 'tevi':
                this.initTevi()
                break;
            case 'nimo':
                this.initNimo()
                break;
            case 'lobah':
                this.initLobah()
                break;
            case 'liveme':
                this.initLiveMe()
                break;
            case 'voya':
                this.initVoya()
                break;
            default:
                break;
        }
    }
    //Likee
    AppChanel.prototype.initLikee = function () {
        this.bsUtils.addScript('./lib/channel/likeeSdk.js?v=1', () => {
            var likee = window.LikeeSDK.likeeSDK;
            likee.webProcess({"process": '0'});
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                likee.unSupportDevice({"errorMsg": "This device does not support webgl"});
            }
        })
    }

    //imo
    AppChanel.prototype.initImo = function () {
        this.bsUtils.addScript('./lib/channel/imoSdk.js?v=1', () => {
            var imo = window.ImoSDK.imoSDK;
            imo.webProcess({"process": '0'});
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                imo.unSupportDevice({"errorMsg": "This device does not support webgl"});
            }
        })
    }
    //kafu
    AppChanel.prototype.initKafu = function () {
        this.bsUtils.addScript('./lib/channel/kafuSdk.js?v=1', () => {
            window['kafu'] ={};
            if(GAMESDK){
                window.kafu = new GAMESDK(()=>{});
            }
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                console.log("This device does not support webgl");
            }
        })
    }
    //Kwaime
    AppChanel.prototype.initKwaime = function () {
        this.bsUtils.addScript('./lib/channel/kwaimeSdk_v2.js?v=1', () => {
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                console.log("This device does not support webgl");
            }
        })
    }
    //Tevi
    AppChanel.prototype.initTevi = function () {
        this.bsUtils.addScript('./lib/channel/teviSdk.js?v=1', () => {
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                console.log("This device does not support webgl");
            }
        })
    }

    //Nimo
    AppChanel.prototype.initNimo = function () {
        this.bsUtils.addScript('./lib/channel/nimoSdk_0.2.js?v=1', () => {
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                console.log("This device does not support webgl");
            }
        })
    }

    //Lobah
    AppChanel.prototype.initLobah = function () {
        this.bsUtils.addScript('./lib/channel/lobah.js?v=1', () => {
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                console.log("This device does not support webgl");
            }
        })
    }

    //LiveMe
    AppChanel.prototype.initLiveMe = function () {
        var url = './lib/channel/kewl.1.js?v=1';
        var params = this.bsUtils.GetUrlParams(window.location.href);
        if (params.from === 'web') {
            url = './lib/channel/gameKewl.1.js?v=1';
        }
        this.bsUtils.addScript(url, () => {
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                console.log("This device does not support webgl");
            }
        })
    }

    //Voya
    AppChanel.prototype.initVoya = function () {
        this.bsUtils.addScript('./lib/channel/VYBridge.js?v=1', () => {
            var canvas = document.createElement('canvas');
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                console.log('支持WebGL')
            } else {
                console.log("This device does not support webgl");
            }
        })
    }

    window.BSUtils.AppChanel = new AppChanel()
})(window)