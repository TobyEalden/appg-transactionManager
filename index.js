(function() {
  var fs = require("fs");
  var path = require("path");
  var uuid = require("node-uuid");
  var existsSync = fs.existsSync || path.existsSync;

  function loadDb() {
    var filePath = path.join(__dirname,"transactions.json");
    var db;
    if (existsSync(filePath)) {
      var contents = fs.readFileSync(filePath);
      db = JSON.parse(contents);
    } else {
      db = {};
    }

    return db;
  }

  function loadTransactions(filter) {
    var db = loadDb();

    var resultsLst = [];
    if (typeof filter !== "undefined") {
      if (filter.hasOwnProperty("id")) {
        if (db.hasOwnProperty(filter.id)) {
          resultsLst.push(db[filter.id]);
        }
      } else if (filter.hasOwnProperty("userRecent")) {
        for (var t in db) {
          var trans = db[t];
          if (trans.hasOwnProperty("target") && trans.target === filter.userRecent) {
            // Recent => non-blocking (i.e. notfications), or those that have been confirmed or declined.
            if (trans.blocking === false || (trans.hasOwnProperty("decision") && trans.decision !== "pending")) {
              resultsLst.push(trans);
            }
          }
        }
      } else if (filter.hasOwnProperty("userPending")) {
        for (var t in db) {
          var trans = db[t];
          // Pending => blocking transactions that haven't been confirmed or declined.
          if (trans.hasOwnProperty("target") && trans.target === filter.userPending && trans.blocking === true && (!trans.hasOwnProperty("decision") || trans.decision === "pending")) {
            resultsLst.push(trans);
          }
        }
      }
    } else {
      for (var t in db) {
        resultsLst.push(db[t]);
      }
    }

    resultsLst.sort(function(a,b) {
      var aDate = new Date(a.timestamp);
      var bDate = new Date(b.timestamp);
      return aDate > bDate ? -1 : 1;
    });

    return resultsLst;
  }

  function saveTransactions(lst) {
    var filePath = path.join(__dirname,"transactions.json");
    fs.writeFileSync(filePath,JSON.stringify(lst,null,2));
  }

  function addTransaction(trans, blocking, callback) {
    var err;
    var target;
    if (!trans.hasOwnProperty("target")) {
      // Target - email of account holder
      err = "target field required";
    } else {
      target = trans.target;
    }

    var origin;
    if (!trans.hasOwnProperty("origin")) {
      // Originating ID - PayPal
      err = "origin field required";
    } else {
      origin = trans.origin;
    }

    var source;
    if (!trans.hasOwnProperty("source")) {
      // Source - Mastercard
      err = "source field required";
    } else {
      source = trans.source;
    }

    var destination;
    if (!trans.hasOwnProperty("destination")) {
      // Destination - Amazon
      err = "destination field required";
    } else {
      destination = trans.destination;
    }

    var value;
    if (!trans.hasOwnProperty("value")) {
      // Value - 10.50
      err = "value field required"
    } else {
      value = trans.value;
    }

    var description;
    if (!trans.hasOwnProperty("description")) {
      // Description - Book
      err = "description field required";
    } else {
      description = trans.description;
    }

    var currency = "GBP";
    if (trans.hasOwnProperty("currency")) {
      currency = trans.currency;
    }

    var transCallback;
    if (blocking && !trans.hasOwnProperty("callback")) {
      err = "callback field required for blocking requests";
    } else {
      transCallback = trans.callback;
    }

    if (err) {
      callback(err);
    } else {
      var newTrans = {
        id: uuid.v1(),
        target: target,
        timestamp: new Date(),
        origin: origin,
        source: source,
        destination: destination,
        value: value,
        description: description,
        currency: currency,
        blocking: blocking
      };
      if (blocking) {
        newTrans.callback = transCallback;
      }
      var db = loadDb();
      db[newTrans.id] = newTrans;
      saveTransactions(db);

      callback(null,newTrans);
    }
  }

  function respondTransaction(responseTo, decision) {
    var db = loadDb();
    if (db.hasOwnProperty(responseTo)) {
      var trans = db[responseTo];
      if (trans.blocking && (!trans.hasOwnProperty("decision") || trans.decision === "pending")) {
        trans.decision = decision;
        saveTransactions(db);

        if (trans.hasOwnProperty("callback")) {
          //var cb = trans.callback + trans.decision + "/" + trans.id;
          var cb = trans.callback + "?" + "decision=" + trans.decision + "&transactionId=" + trans.id;
          var http = require('http');
          var url = require('url');
          var parsed = url.parse(cb);

          console.log("--- calling back to: " + cb);

          // Fire and forget callback authorisation.
          http.get({ host: parsed.hostname, port: parsed.port, path: parsed.path }, function(resp) {}).on("error",function(e) { console.log("error during transaction callback: " + e.message); })
        }
      }
    }
  }

  function clearTransactions() {
    var db = loadDb();

    for (var t in db) {
      var trans = db[t];
      if (trans.blocking === false || (trans.hasOwnProperty("decision") && trans.decision !== "pending")) {
        // Keep all blocking notifications that have a pending decision.
        delete db[t];
      }
    }

    saveTransactions(db);
  }

  exports.loadTransactions = loadTransactions;
  exports.addTransaction = addTransaction;
  exports.respondTransaction = respondTransaction;
  exports.clearTransactions = clearTransactions;
})();
