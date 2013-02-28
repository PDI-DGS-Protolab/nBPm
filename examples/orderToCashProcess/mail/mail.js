var fs = require('fs');
var mailer = require('nodemailer');
var path = require('path');

var DIR_MODULE = path.dirname(module.filename);

var mail = function(json, callback) {
  var fileName = json['html_file_name'];

  fs.readFile(fileName, function (err, data) {

    var smtpTransport = mailer.createTransport('SMTP',{
      service: 'Gmail',
      auth: {
        user: 'your_gmail_user@gmail.com',
        pass: 'your_gmail_pass'
      }
    });

    var mailOptions = {
      attachments: [{
        filename: 'head.jpg',
        filePath: DIR_MODULE + '/head.jpg',
        cid: "unique@kreata.ee" //same cid value as in the html img src
      }],
      from: 'Aitor Magán \<amagan@conwet.com\>',
      to: json['customer']['email'],
      subject: 'Your invoice from Telefónica Digital',
      html: data.toString()
    }

    smtpTransport.sendMail(mailOptions, function(error, response){

      /*if(error){
        console.log(error);
      }else{
        console.log("Message sent: " + response.message);
      }*/

      // if you don't want to use this transport object anymore, uncomment following line
      smtpTransport.close(); // shut down the connection pool, no more messages

      callback(error, response);
    });

  });
};

exports.mail = mail;
