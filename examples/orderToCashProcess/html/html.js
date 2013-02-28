var ejs = require('ejs');
var fs = require('fs');
var path = require('path');

var DIR_MODULE = path.dirname(module.filename);

var computeInvoiceDetails = function (){
  return {
    'number': "TF0000000088",
    'date':   'Mié, 27 de feb 2013',
    'month':  'January'
  }
}

var html = function(invoiceJSON, filename, callback) {

  fs.readFile(DIR_MODULE + '/template/invoice.html', function (err, data) {

    if (!err) {

      invoiceJSON['invoice'] = computeInvoiceDetails();

      var html = ejs.render(data.toString(), invoiceJSON);

      var now = new Date();
      var nowToString = now.toTimeString().slice(0, 8);
      //var file = DIR_MODULE + '-' + nowToString + '.html';

      fs.writeFile(filename, html, function (err) {

        callback(err);

      });


    } else {
      console.log('ERROR: The chosen template does not exist')
    }
  });
}

exports.generateHTML = html;

