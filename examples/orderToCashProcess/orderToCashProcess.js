var nBPM = require('../../nBPM.js');
var rating = require('./rating/rating.js');
var customers = require('./customers/customers.js');
var html = require('./html/html.js');
var mail = require('./mail/mail.js');
var charging = require('./charging/charging.js');

var activities = {};
var PROCESS_NAME = 'orderToCash';
var BEFORE_MAIL = 'beforeMail';
var process;

activities['rating'] = {
  exec: function (dataActivities, event, next, end) {

    rating.rating(dataActivities[0], function(result) {
      next([{tag: 'customer', nextExc: true}], result);
    });
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit, callback) {
    console.log('Rollback not required');
    callback(-1, null);
  }
};

activities['customer'] = {
  exec: function (dataActivities, event, next, end) {
    var data = dataActivities[0];
    customers.getCustomer(data, function(result) {
      data['customer'] = result;

      next([{tag: 'generateHTML', nextExc: true}], data);
    });
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit, callback) {
    console.log('Rollback not required');
    callback(-1, null);
  }
};


activities['generateHTML'] = {
  exec: function (dataActivities, event, next, end) {
    var data = dataActivities[0];
    var fileName = data['sdr_file_name'];

    html.generateHTML(data, fileName, function(err) {

      data['html_file_name'] = fileName;
      next([{tag: 'mail'}], data);
      process.setTransactionTag(BEFORE_MAIL);
    });
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit, callback) {
    console.log('Rollback not required');
    callback(-1, null);
  }
};

activities['mail'] = {
  exec: function (dataActivities, event, next, end) {
    var data = dataActivities[0];

    mail.mail(data, event.mail, function(error, response) {
      if (error) {

        console.log('ERROR: An error arises when the mail was being sent. Rollback is going to be executed now...')

        process.rollback(BEFORE_MAIL, function(err) {
          if (!err) {
            console.log('Rollback executed properly. Try to send the message again!');
          } else {
            console.log('An error arises when callback was being executed. ABORT!')
          }
        });
      } else {
        next([{tag: 'charging', nextExc: true}], data);
      }
    });
  },

  filter: function (dataActivities, event) {
    if (!event) {
      return false;
    } else {
      if (!event.mail) {
        return false;
      } else {
        var mail = event.mail;

        if (!mail.user || !mail.pass || !mail.name) {
          return false
        } else {
          return true;
        }
      }
    }
  },

  rollback: function (exit, callback) {
    console.log('Rollback not required');
    callback(null, null);
  }
};

activities['charging'] = {

  exec: function (dataActivities, event, next, end) {

    var data = dataActivities[0];

    charging.processPayment(data, function(res) {
      end(data);
    });
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit, callback) {
    console.log('Rollback not required');
    callback(-1, null);
  }

}

process = nBPM.createProcess(PROCESS_NAME, activities);
process.start('rating', {consumption: './sample.xml', file: '/home/aitor/facturas/fact3.html'});