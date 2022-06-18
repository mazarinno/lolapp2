define([
  '/utils/SimpleIOPlugin.js'
], function(_simpleIoPlugin) {
  const SUMMONER_INFO_FETCHER_INTERVAL_MS = 2000;
  const SUMMONER_INFO_FETCHER_MAX_RETRIES = 20;
  const LOL_CEF_CLIENT_LOG_LISTENER_ID = 'LOL_CEF_CLIENT_LOG_LISTENER_ID';
  const SUMMONER_NAME_REGEX = /\"localPlayerCellId\":(\d).*,\"myTeam\":(\[.*\])/;

  let _teamInfo = null;
  let _gameInfo = null;
  let _timerId = null;
  let _cefRegionTimer = null;
  let _cefSummonerNameTimer = null;
  let _retries = 0;
  let _cefRegionRetries = 0;
  let _cefSummonerNameRetries = 0;
  let _fileListenerRetries = 0;
  let _gameRoot;
  let _ioPlugin;
  let _apiKey;
  let _fetchName = false;
  let _playerName = "";
  let _playerTeam = "";
  let _teamKills = 0;
  let _teamDeaths = 0;
  let _teamAssists = 0;
  let _teamDragons = 0;
  let _teamHeralds = 0;
  let _teamMonsters = 0;

  function start(gameInfo, key) {
    if (gameInfo == null) {
      console.error("SummonerInfoFetcher - passed null gameInfo");
      return false;
    }

    _apiKey = key;

    console.log('starting summoner info fetcher.');

    _simpleIoPlugin.get(function(ioPlugin){
      _ioPlugin = ioPlugin;

      stop();

      _gameInfo = gameInfo;
      _gameRoot = _getGameRoot(gameInfo);

      _retries = 0;
      _cefRegionRetries = 0;
      _cefSummonerNameRetries = 0;
      _fileListenerRetries = 0;

      _timerId = setTimeout(_extractSummonerInfoCefClient, 0);
    });

    return true;
  }

  function stop() {
    clearTimeout(_timerId);
    clearTimeout(_cefRegionTimer);
    clearTimeout(_cefSummonerNameTimer);

    _ioPlugin.stopFileListen(LOL_CEF_CLIENT_LOG_LISTENER_ID);
    _ioPlugin.onFileListenerChanged.removeListener(_cefClientLogFileListener);
  }

  function _getGameRoot(gameInfo) {
    let gameRoot;
    let gamePath = gameInfo.path;
    let pathIndex = gamePath.indexOf("RADS");

    if (pathIndex < 0) {
      pathIndex = gamePath.lastIndexOf("/") + 1;
    }

    gameRoot = gamePath.substring(0, pathIndex);
    return gameRoot;
  }

  function _extractSummonerInfoCefClient() {
    _getRegionCefClient(regionCallback);
    _getSummonerNameCefClient(summonerNameCallback);
  }

  function _getRegionCefClient(callback) {
    _cefRegionRetries++;
    if (_cefRegionRetries === SUMMONER_INFO_FETCHER_MAX_RETRIES) {
      console.error('SummonerInfoFetcher - CEF region reached max retries!');
      sendTrack('REGION_FETCH_FAILURE');
      stop();
      return;
    }

    let filename = _gameRoot + "Config/LeagueClientSettings.yaml";
    let regEx = /region:\s*"(.*)"/gmi;
    console.log("extract region from new client: ", filename);
    _extractRegionFromFile(filename, regEx, callback);
  }

  // callback = function(status, statusReason, region)
  function _extractRegionFromFile(filename, regEx, callback) {
    if (!_ioPlugin) {
      return callback(false, "no IO plugin", null);
    }

    _ioPlugin.getTextFile(filename, false, function (status, data) {
      if (!status) {
        return setTimeout(function () {  // ERROR
          callback(false, "failed to read " + filename, null);
        }, 1);
      }

      let match = regEx.exec(data);

      if ((null == match) || (match.length !== 2)) {
        return setTimeout(function () {  // ERROR
          callback(false, "failed to read region from " + filename, null);
        }, 1);
      }

      return setTimeout(function () { // RETURN REGION
        callback(true, null, match[1].toLowerCase());
      }, 1);
    });
  }

  function regionCallback(status, statusReason, region) {
    // if we fail - retry
    if (!status) {
      console.error(statusReason);

      _cefRegionTimer = setTimeout(function () {  // ERROR CASE
        _getRegionCefClient(regionCallback);
      }, SUMMONER_INFO_FETCHER_INTERVAL_MS);

      return;
    }

    let div = document.getElementById('region');
    div.innerHTML = region;
    console.info(`My region: ${region}`);
  }

  function summonerNameCallback(status, statusReason) {
    // if we fail - retry
    if (!status) {
      console.error(statusReason);

      _cefSummonerNameTimer = setTimeout(function() {  // ERROR CASE
        _getSummonerNameCefClient(summonerNameCallback);
      }, SUMMONER_INFO_FETCHER_INTERVAL_MS);

    }
  }

  function _getSummonerNameCefClient(callback) {
    let path = _gameRoot + 'Logs/LeagueClient Logs/';
    let filePattern = path + '*_LeagueClient.log';

    _cefSummonerNameRetries++;
    if (_cefSummonerNameRetries === SUMMONER_INFO_FETCHER_MAX_RETRIES) {
      console.error('SummonerInfoFetcher - CEF region reached max retries!');
      sendTrack('SUMMONER_NAME_FETCH_FAILURE');
      stop();
      return;
    }

    _ioPlugin.getLatestFileInDirectory(filePattern, function(status, logFileName) {
      if (!status || !logFileName.endsWith(".log")) {
        return callback(false, "couldn't find log file", null);
      }

      _ioPlugin.onFileListenerChanged.removeListener(_cefClientLogFileListener);
      _ioPlugin.onFileListenerChanged.addListener(_cefClientLogFileListener);

      let fullLogPath = path + logFileName;
      _listenOnCefClientLog(fullLogPath, callback); // proper syntax? 
    });
  }

  function _listenOnCefClientLog(fullLogPath, callback) {
    let skipToEnd = false;

    console.log('starting to listen on ' + fullLogPath);
    _fileListenerRetries++;

    if (_fileListenerRetries >= SUMMONER_INFO_FETCHER_MAX_RETRIES) {
      _ioPlugin.stopFileListen(LOL_CEF_CLIENT_LOG_LISTENER_ID);
      _ioPlugin.onFileListenerChanged.removeListener(_cefClientLogFileListener);
      callback(false, 'failed to stream cef log file', null);
      return;
    }

    _ioPlugin.listenOnFile(LOL_CEF_CLIENT_LOG_LISTENER_ID,
      fullLogPath, skipToEnd, function (id, status, data) {
        if (!status) {
          console.log("failed to stream " + id + ' (' + data + '), retrying...');
          return setTimeout(_listenOnCefClientLog, 500);  // ERROR CASE
        }

        console.log('now streaming ' + id);
        callback(true);
      });
  }

  function _cefClientLogFileListener(id, status, line) {
    if (id !== LOL_CEF_CLIENT_LOG_LISTENER_ID) {
      return;
    }

    if (!status) {
      console.error("received an error on file: " + id + ": " + line);
      return;
    }

    if (line.includes('Shut down EventCollector')) {  // IF LOG CLOSES, OPEN THE NEXT ONE
      console.log('EventCollector shut down detected, switching to new log file...');
      setTimeout(getNewLeagueClientLog, 3000);
    }

    // IF IN GAMEFLOW .
    // get all players once and scrub through team members only and extract all KDA data
    if (line.includes('lol-gameflow|')) {
      let div = document.getElementById('my-team');
      let killerTeam = "";

      // if we haven't gotten the name yet
      // this fetch name section will help us find the player's team
      if (_fetchName = false) {
        // fetch active player name
        fetch("​https://127.0.0.1:2999/liveclientdata/activeplayername")
          .then(response => response.json())
          .then(data => {
            _playerName = JSON.stringify(data);
          })

        // fetch player team
        fetch("https://127.0.0.1:2999/liveclientdata/playerlist")
        .then(response => response.json())
        .then(data => {
          for (player of data) {
            if (player.summonerName == _playerName) { 
              _playerTeam = player.team;
            }
          }
        });

        _fetchName = true;
      }

      // fetch player list
      fetch("https://127.0.0.1:2999/liveclientdata/playerlist")
      .then(response => response.json())
      .then(data => {
        let killCount = 0;
        let deathCount = 0;
        let assistCount = 0;

        for (player of data) {
          if (player.team == _playerTeam) { 
            // fetch KDA of all those on player team and add them to appropriate global variables ... 
            // data will only be recorded if it is an increase in each case
            killCount += player.kills;
            deathCount += player.deaths;
            assistCount += player.assists;
          }
        }

        if ((_teamKills + killCount) > _teamKills) _teamKills += killCount;
        if ((_teamDeaths + deathCount) > _teamDeaths) _teamDeaths += deathCount;
        if ((_teamAssists + assistCount) > _teamAssists) _teamAssists += assistCount;
      });

      div.innerHTML += _teamKills + " " + _teamDeaths + " " + _teamAssists + " ";

      // fetch event data
      fetch("GET ​https://127.0.0.1:2999/liveclientdata/eventdata")
      .then(response => response.json())
      .then(data => {
        let dragonCount = 0;
        let heraldCount = 0;

        for (leagueEvent of data) {
          // looking for DragonKill and HeraldKill
          if (leagueEvent.EventName == "DragonKill" || leagueEvent.EventName == "HeraldKill") {
            let killer = leagueEvent.KillerName;
            
            // find killer team
            fetch("https://127.0.0.1:2999/liveclientdata/playerlist")
            .then(response => response.json())
            .then(data => {
              for (player of data) {
                if (player.summonerName == killer) { 
                  killerTeam = player.team;
                }
              }
            });
          }
          
          if (killerTeam == _playerTeam) {
            switch(leagueEvent.EventName) {
              case "DragonKill":
                if ((_teamDragons + dragonCount) > _teamDragons) _teamDragons += dragonCount;
                break;
              case "HeraldKill":
                if ((_teamHeralds + heraldCount) > _teamHeralds) _teamHeralds += heraldCount;
                break;
            }
          }
        }});

      _teamMonsters = _teamDragons + _teamHeralds;  // update total monsters killed
    }

    if (line.includes('GAMEFLOW_EVENT.QUIT_TO_LOBBY') ||
      line.includes('GAMEFLOW_EVENT.TERMINATED') ||
      line.includes('lol-end-of-game| Game client is now not running')) {
      // return to lobby (dodge?)
      _teamInfo = null;
      _printMyTeam(null, []);
    }
  }

  function _printMyTeam(localPlayerCellId, myTeam) {
    let div = document.getElementById('my-team');
    let team = 'TEAM:<br>';
    let me = 'ME:<br>';

    for (let playerInfo of myTeam) {
      let summonerId = playerInfo.summonerId;
      if (playerInfo.cellId === localPlayerCellId) {
        me += summonerId;
      } else {
        team += summonerId + '<br>';
      }
    }
    div.innerHTML = team + '<br>' + me;
    console.table(myTeam);
  }

  function getNewLeagueClientLog() {
    clearTimeout(_cefSummonerNameTimer);

    _ioPlugin.stopFileListen(LOL_CEF_CLIENT_LOG_LISTENER_ID);
    _ioPlugin.onFileListenerChanged.removeListener(_cefClientLogFileListener);

    _cefSummonerNameRetries = 0;
    _getSummonerNameCefClient(summonerNameCallback);
  }

  /**
   * Send tracking/monitoring info
   * @param info
   */
  function sendTrack(info) {
    let URL_TRACKING = "http://bugs.somewhere.com/endpoint";
    let payload = {
      info: info
    };

    let xmlhttp = new XMLHttpRequest();
    xmlhttp.open("POST", URL_TRACKING);
    xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xmlhttp.send(JSON.stringify(payload));
  }
  return {
    start: start,
    stop: stop
  }
});