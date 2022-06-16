"use strict";

define([
  '/utils/SummonerInfoFetcher.js',
  '/utils/config.js'
],function(summonerInfoFetcher, config) {

  function _getLauncherInfo() {
    overwolf.games.launchers.getRunningLaunchersInfo((info) => {
      if (info.launchers.length) {
        summonerInfoFetcher.start(info.launchers[0], config.apiKey);
      } else {
        setTimeout(_getLauncherInfo, 1000);
      }
    });
  }

  _getLauncherInfo();

});