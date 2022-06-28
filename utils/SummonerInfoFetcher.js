define([
  '/utils/SimpleIOPlugin.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.0.0/dist/tf.min.js'
], function(_simpleIoPlugin, tf) {
  const SUMMONER_INFO_FETCHER_INTERVAL_MS = 2000;
  const SUMMONER_INFO_FETCHER_MAX_RETRIES = 20;
  const LOL_CEF_CLIENT_LOG_LISTENER_ID = 'LOL_CEF_CLIENT_LOG_LISTENER_ID';
  const SUMMONER_NAME_REGEX = /\"localPlayerCellId\":(\d).*,\"myTeam\":(\[.*\])/;

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
  let _goldEstimate = 0;
  var _bkMin, _bkMax, _bdMin, _bdMax, _baMin, _baMax, _bemMin, _bemMax, _bdgMin, _bdgMax, _bhMin, _bhMax, _btdMin, _btdMax, _btgMin, _btgMax, _bteMin, _bteMax;
  
  _bkMin = -2.053862852243772;
  _bkMax = 5.252981766128116;
  _bdMin = -2.092146489563722;
  _bdMax = 5.40699481315093;
  _baMin = -1.6349882136850005;
  _baMax = 5.500286944765949;
  _bemMin = -0.8792309888527712;
  _bemMax = 2.318237422292646;
  _bdgMin = -0.7532256511066304;
  _bdgMax = 1.3276234001468374;
  _bhMin = -0.48113242135723605;
  _bhMax = 2.078429878367123;
  _btdMin = -0.21043903299552771;
  _btdMax = 16.159066533640836;
  _btgMin = -3.7603050511959566;
  _btgMax = 4.687827392241373;
  _bteMin = -6.522575142555767;
  _bteMax = 3.578527503406988;

  function start(gameInfo) {
    if (gameInfo == null) {
      console.error("SummonerInfoFetcher - passed null gameInfo");
      return false;
    }

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

    // initialize a model that is trained upon creation of each program start ?? 

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

    // let div = document.getElementById('region');
    // div.innerHTML = region;
    // console.info(`My region: ${region}`);
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

  function _getPrediction(data) {
    tf.loadLayersModel('/utils/tfjsmodel/model.json')
      .then(function(model) {
          let div = document.getElementById('region');
          let normalizedInputs = [];
  
          // sample_data['col1'] = (sample_data['col1'] - training_data['col1'].min()) / (training_data['col1'].max() - training_data['col1'].min())


          data.forEach(function (piece, i) {
            let instmin, instmax;

            switch(i) {
              case 0:
                instmin = _bkMin;
                instmax = _bkMax;
                break;
              case 1:
                instmin = _bdMin;
                instmax = _bdMax;
                break;
              case 2:
                instmin = _baMin;
                instmax = _baMax;
                break;
              case 3:
                instmin = _bemMin;
                instmax = _bemMax;
                break;
              case 4:
                instmin = _bdgMin;
                instmax = _bdgMax;
                break;
              case 5:
                instmin = _bhMin;
                instmax = _bhMax;
                break;
              case 6:
                instmin = _btdMin;
                instmax = _btdMax;
                break;
              case 7:
                instmin = _btgMin;
                instmax = _btgMax;
                break;
              case 8:
                instmin = _bteMin;
                instmax = _bteMax;
                break;
            }

            normalizedInputs.push((piece - instmin) / (instmax - instmin));
          });


          let arrayPredict = tf.tensor2d(normalizedInputs, [1, 9]);
          
          let prediction = model.predict([arrayPredict]);

          let percentAdjust = Math.trunc((prediction.dataSync()[0]) * 100);

          div.innerHTML = percentAdjust + "%";
      });
    return;
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
      let killerTeam;
      let killer;
      let playerTeam;
      let playerGold;

      let killCount = 0;
      let deathCount = 0;
      let assistCount = 0;
      let xpTotal = 0;
      let cumulativeXP = [0, 280, 660, 1140, 1720, 2400, 3180, 4060, 5040, 6120, 7300, 8580, 9960, 11440, 13020, 14700, 16480, 18360];
      let dragonCount = 0;
      let heraldCount = 0;
      let turretCount = 0;
      let monsterCount = 0;

      // TODO change these globals into local inside this gameflow if statement
      // fetch player team
      fetch("https://127.0.0.1:2999/liveclientdata/playerlist")
      .then(response => response.json())
      .then(data => { 
        playerTeam = data[0].team; 
        
        for (player of data) {
          if (player.team == playerTeam) { 
            // fetch KDA of all those on player team and add them to appropriate global variables ... 
            // data will only be recorded if it is an increase in each case
            killCount += player.scores.kills;
            deathCount += player.scores.deaths;
            assistCount += player.scores.assists;

            // use to loop to also increment levelcount and figure out an equation to convert this to total xp of the group
            xpTotal += cumulativeXP[player.level - 1];
          }
        }

        // fetch event data
        fetch("https://127.0.0.1:2999/liveclientdata/eventdata")
        .then(response => response.json())
        .then(data => {
          for (leagueEvent of data.Events) {
            // looking for DragonKill and HeraldKill
            if (leagueEvent.EventName == "DragonKill" || leagueEvent.EventName == "HeraldKill" || leagueEvent.EventName == "TurretKilled") {
              killer = leagueEvent.KillerName;
              
              // find killer team
              fetch("https://127.0.0.1:2999/liveclientdata/playerlist")
              .then(response => response.json())
              .then(data => {
                for (player of data) {
                  if (player.summonerName == killer) { 
                    killerTeam = player.team;
                  }
                }

                if (killerTeam == playerTeam) {
                  switch(leagueEvent.EventName) {
                    case "DragonKill":
                      dragonCount += 1;
                      break;
                    case "HeraldKill":
                      heraldCount += 1;
                      break;
                    case "TurretKilled":
                      turretCount += 1;
                      break;
                  }
                }

                monsterCount = dragonCount + heraldCount;
              });
            }
          }

          // get player gold
          fetch("https://127.0.0.1:2999/liveclientdata/activeplayer")
          .then(response => response.json())
          .then(data => { 
            playerGold = data.currentGold;

            if ((playerGold * 5) != _goldEstimate) {
              _goldEstimate += (playerGold * 5);
            }
          
            let arrData = [killCount, deathCount, assistCount, monsterCount, dragonCount, heraldCount, turretCount, _goldEstimate, xpTotal];
    
            console.log(arrData);

            // TODO send data to predictionmodel
            _getPrediction(arrData);
          });
        });
      });
    }

    if (line.includes('GAMEFLOW_EVENT.QUIT_TO_LOBBY') ||
      line.includes('GAMEFLOW_EVENT.TERMINATED') ||
      line.includes('lol-end-of-game| Game client is now not running')) {
      // return to lobby (dodge?)
      _teamInfo = null;
    }
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