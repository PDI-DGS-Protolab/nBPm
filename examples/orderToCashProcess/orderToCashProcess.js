var nBPM = require('../../nBPM.js');
var rating = require('./rating/rating.js');
var customers = require('./customers/customers.js');
var html = require('./html/html.js');
var mail = require('./mail/mail.js');
var charging = require('./charging/charging.js');

var activities = {};
var processName = 'orderToCash';
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

  rollback: function (exit) {
    console.log('Rollback not required');
    return -1;
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

  rollback: function (exit) {
    console.log('Rollback not required');
    return -1;
  }
};


activities['generateHTML'] = {
  exec: function (dataActivities, event, next, end) {
    var data = dataActivities[0];
    var fileName = data['sdr_file_name'];

    html.generateHTML(data, fileName, function(err) {

      data['html_file_name'] = fileName;
      next([{tag: 'mail', nextExc: true}], data);
    });
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit) {
    return -1;
  }
};

activities['mail'] = {
  exec: function (dataActivities, event, next, end) {
    var data = dataActivities[0];

    mail.mail(data, function(error, response) {
      if (error) {
        console.log('Error sending email to the client. What should I do?!')
      } else {
        next([{tag: 'charging', nextExc: true}], data);
      }
    });
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit) {
    return -1;
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

  rollback: function (exit) {
    return -1;
  }

}

process = nBPM.createProcess(processName, activities);
process.start('rating', {consumption: './sample.xml', file: '/home/aitor/facturas/fact3.html'});